//! Commands: records decoded and handed to the module that owns them.
//!
//! Every record names the frame it takes effect on. A record for a later block waits in `Engine::held` and is
//! dispatched at the start of the block that holds its frame, with that frame, so a voice start lands on the
//! sample and everything else lands on the block.

use crate::engine::Engine;
use crate::ops::{self, HEADER, Record, cmd, grid, master_param};

/// Bytes of records that may wait for a later block. A record that does not fit takes effect at once.
pub const HELD_CAP: usize = 65536;

/// The frame a record asks for, as an absolute frame at or after `now`. `at` is the low 32 bits of the frame
/// counter; 0, and any frame already past, is `now`. The comparison wraps, so it holds past 2^32 frames.
#[inline]
pub fn resolve(at: u32, now: u64) -> u64 {
    if at == 0 {
        return now;
    }
    let ahead = at.wrapping_sub(now as u32) as i32;
    if ahead <= 0 { now } else { now + ahead as u64 }
}

/// The length of the record at the head of `bytes`, when a whole one is there.
#[inline]
fn record_len(bytes: &[u8]) -> Option<usize> {
    if bytes.len() < HEADER {
        return None;
    }
    let len = u16::from_le_bytes([bytes[2], bytes[3]]) as usize;
    if len < HEADER || len > bytes.len() { None } else { Some(len) }
}

/// The frame the record at the head of `bytes` asks for.
#[inline]
fn due(record: &[u8], now: u64) -> u64 {
    if record.len() >= HEADER + 4 { resolve(ops::u32_at(record, HEADER), now) } else { now }
}

/// Dispatches every record that falls in the block of `frames` frames starting at `engine.frame`: first the
/// held ones, then the new ones, each in arrival order. New records for a later block are held.
pub fn run(engine: &mut Engine, frames: usize) {
    let frames = frames as u64;

    let mut held = core::mem::take(&mut engine.held);
    let mut at = 0;
    let mut keep = 0;
    while let Some(len) = record_len(&held[at..]) {
        let when = due(&held[at..at + len], engine.frame);
        if when < engine.frame + frames {
            dispatch(engine, &held[at..at + len], when);
        } else {
            held.copy_within(at..at + len, keep);
            keep += len;
        }
        at += len;
    }
    held.truncate(keep);

    let mut inbox = core::mem::take(&mut engine.inbox);
    at = 0;
    while let Some(len) = record_len(&inbox[at..]) {
        let record = &inbox[at..at + len];
        let when = due(record, engine.frame);
        if when < engine.frame + frames {
            dispatch(engine, record, when);
        } else if held.len() + len <= HELD_CAP {
            held.extend_from_slice(record);
        } else {
            dispatch(engine, record, engine.frame);
        }
        at += len;
    }
    inbox.clear();

    engine.inbox = inbox;
    engine.held = held;
}

/// Registers PCM at `ptr` as `sample` and announces it. The table owns the memory from here.
pub fn load_sample(engine: &mut Engine, sample: u32, ptr: *mut i16, frames: u32, channels: u32, rate: f32) -> bool {
    // Whatever held this id is replaced: nothing may read the old memory after this.
    engine.grains.release_sample(sample);
    engine.babble.release_sample(sample);
    let taken = engine.samples.load(sample, ptr, frames, channels, rate, &mut engine.voices);
    if taken {
        engine.events.push(&ops::SampleReady { frame: engine.frame as u32, sample });
    }
    taken
}

/// Hands one record to its owner. `at` is the frame it takes effect on: inside the current block.
fn dispatch(engine: &mut Engine, record: &[u8], at: u64) {
    match u16::from_le_bytes([record[0], record[1]]) {
        cmd::CLOCK_SET => {
            if let Some(c) = ops::ClockSet::read(record) {
                engine.frame = c.frame as u64;
            }
        }
        cmd::SAMPLE_LOAD => {
            // The pointer is an address in the linear memory of the wasm build; natively `Engine::load_sample`
            // stands in.
            #[cfg(target_arch = "wasm32")]
            if let Some(s) = ops::SampleLoad::read(record) {
                load_sample(engine, s.sample, s.ptr as usize as *mut i16, s.frames, s.channels, s.rate);
            }
        }
        cmd::SAMPLE_FREE => {
            if let Some(s) = ops::SampleFree::read(record) {
                engine.grains.release_sample(s.sample);
                engine.babble.release_sample(s.sample);
                engine.samples.free(s.sample, &mut engine.voices);
            }
        }
        cmd::VOICE_START => {
            if let Some(v) = ops::VoiceStart::read(record) {
                // The low three bits of the flags name a grid line to wait for.
                let line = v.flags & 7;
                if line == grid::OFF {
                    engine.voices.start_at(&engine.samples, &v, at);
                } else {
                    engine.transport.hold(&v, line, at, &engine.samples, &mut engine.voices);
                }
            }
        }
        cmd::VOICE_SET => {
            if let Some(v) = ops::VoiceSet::read(record) {
                engine.voices.set(v.voice, v.param, v.value, v.slew, at);
            }
        }
        cmd::VOICE_STOP => {
            if let Some(v) = ops::VoiceStop::read(record) {
                engine.voices.stop(v.voice, v.release, at);
            }
        }
        cmd::BUS_DEFINE => {
            if let Some(b) = ops::BusDefine::read(record) {
                engine.buses.define(&b);
            }
        }
        cmd::BUS_SET => {
            if let Some(b) = ops::BusSet::read(record) {
                engine.buses.set(&b);
            }
        }
        cmd::MASTER_SET => {
            if let Some(m) = ops::MasterSet::read(record) {
                if m.param == master_param::CEILING {
                    engine.limiter.set_ceiling(m.value);
                } else {
                    engine.buses.master_set(m.param, m.value, m.slew);
                }
            }
        }
        cmd::FX_DEFINE => {
            if let Some(f) = ops::FxDefine::read(record) {
                engine.fx.define(f.bus, f.slot, f.kind, f.key);
            }
        }
        cmd::FX_SET => {
            if let Some(f) = ops::FxSet::read(record) {
                engine.fx.set(f.bus, f.slot, f.param, f.value, f.slew, f.curve);
            }
        }
        cmd::FX_ON => {
            if let Some(f) = ops::FxOn::read(record) {
                engine.fx.on(f.bus, f.slot, f.value, f.slew);
            }
        }
        cmd::IR_LOAD => {
            if let Some(i) = ops::IrLoad::read(record) {
                if let Some(sample) = engine.samples.get(i.sample) {
                    engine.fx.ir(i.bus, i.slot, sample.data(), sample.channels, sample.rate);
                }
            }
        }
        cmd::SPACE_SET => {
            if let Some(s) = ops::SpaceSet::read(record) {
                engine.voices.space(s.mode);
            }
        }
        cmd::TRANSPORT_SET => {
            if let Some(t) = ops::TransportSet::read(record) {
                engine.transport.set(&t, at);
            }
        }
        cmd::SEQ_DEFINE => {
            if let Some(d) = ops::SeqDefine::read(record) {
                engine.seq.define(&d);
            }
        }
        cmd::SEQ_STEPS => {
            if let Some(s) = ops::SeqSteps::read(record) {
                engine.seq.steps(&s, at);
            }
        }
        cmd::LOOP_START => {
            if let Some(l) = ops::LoopStart::read(record) {
                engine.looper.start(&l, at, &engine.transport, &engine.samples, &mut engine.voices);
            }
        }
        cmd::LOOP_SET => {
            if let Some(l) = ops::LoopSet::read(record) {
                engine.looper.set(&l, at);
            }
        }
        cmd::LOOP_STOP => {
            if let Some(l) = ops::LoopStop::read(record) {
                engine.looper.stop(&l, at);
            }
        }
        cmd::GRAIN_START => {
            if let Some(g) = ops::GrainStart::read(record) {
                engine.grains.start(&g, &engine.samples);
            }
        }
        cmd::GRAIN_SET => {
            if let Some(g) = ops::GrainSet::read(record) {
                engine.grains.set(&g);
            }
        }
        cmd::GRAIN_STOP => {
            if let Some(g) = ops::GrainStop::read(record) {
                engine.grains.stop(&g);
            }
        }
        cmd::GEN_START => {
            if let Some(g) = ops::GenStart::read(record) {
                engine.gens.start(&g);
            }
        }
        cmd::GEN_SET => {
            if let Some(g) = ops::GenSet::read(record) {
                engine.gens.set(&g);
            }
        }
        cmd::GEN_STOP => {
            if let Some(g) = ops::GenStop::read(record) {
                engine.gens.stop(&g);
            }
        }
        cmd::BABBLE_DEFINE => {
            if let Some(b) = ops::BabbleDefine::read(record) {
                engine.babble.define(&b, &engine.samples);
            }
        }
        cmd::BABBLE_SAY => {
            if let Some(s) = ops::BabbleSay::read(record) {
                engine.babble.say(&s, at);
            }
        }
        cmd::BABBLE_STOP => {
            if let Some(s) = ops::BabbleStop::read(record) {
                engine.babble.stop(&s);
            }
        }
        cmd::VOICE_PLACE => {
            if let Some(p) = ops::VoicePlace::read(record) {
                engine.voices.place(p.voice, p.pan, p.distance, p.occlusion, p.slew);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ops::{ClockSet, VoiceStop};

    #[test]
    fn resolve_reads_zero_and_the_past_as_now() {
        assert_eq!(resolve(0, 500), 500);
        assert_eq!(resolve(400, 500), 500);
        assert_eq!(resolve(500, 500), 500);
        assert_eq!(resolve(628, 500), 628);
    }

    #[test]
    fn resolve_holds_across_the_32_bit_wrap() {
        let now = (1u64 << 32) - 100;
        assert_eq!(resolve(50, now), now + 150);
        assert_eq!(resolve((now as u32).wrapping_sub(10), now), now);
        let later = (3u64 << 32) + 5;
        assert_eq!(resolve(105, later), later + 100);
    }

    #[test]
    fn a_record_for_a_later_block_waits_for_it() {
        let mut e = Engine::new(48000.0, 4);
        e.command(&VoiceStop { at_frame: 1000, voice: 1, release: 0 }.bytes());
        e.process(128);
        assert_eq!(e.held.len(), VoiceStop::SIZE);
        e.render(1000 - 128);
        assert_eq!(e.held.len(), VoiceStop::SIZE);
        e.process(128);
        assert_eq!(e.held.len(), 0);
    }

    #[test]
    fn the_clock_can_be_set_and_a_cut_off_record_is_dropped() {
        let mut e = Engine::new(48000.0, 4);
        let mut bytes = ClockSet { at_frame: 0, frame: 96000 }.bytes();
        bytes.extend_from_slice(&[4, 0, 60, 0, 1]);
        e.command(&bytes);
        e.process(128);
        assert_eq!(e.frame, 96000 + 128);
        assert!(e.inbox.is_empty());
    }
}
