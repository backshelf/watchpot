//! The engine: everything the core holds, and one block of work in its fixed order.
//!
//! A block: commands that fall in it are dispatched (`cmd.rs`); the transport moves, starting the voices that
//! waited for a grid line; the sequencer starts its steps and the loops follow the tempo; the buses are cleared;
//! the grain clouds, the babble voices, the generators and the voices render into their buses and sends (each
//! placed voice through its place first); the effect parameters move; the buses run their effects and sum into the
//! master; the limiter holds the ceiling; the meters read the result; and the frame counter moves on.

use crate::babble::Babble;
use crate::bus::Buses;
use crate::cmd;
use crate::fx::Rack;
use crate::gens::Gens;
use crate::grain::Grains;
use crate::limiter::Limiter;
use crate::looper::Looper;
use crate::meter::Meters;
use crate::ops::{self, Record};
use crate::sample::SampleTable;
use crate::seq::Seq;
use crate::transport::Transport;
use crate::voice::VoicePool;

/// The events one block wrote, as records. Fixed in size: an event that does not fit is dropped.
pub struct Events {
    buf: Vec<u8>,
}

impl Events {
    pub(crate) fn new() -> Self {
        Events { buf: Vec::with_capacity(ops::EVT_CAP) }
    }

    /// Appends one event record.
    pub fn push<R: Record>(&mut self, event: &R) {
        let at = self.buf.len();
        if at + R::SIZE > ops::EVT_CAP {
            return;
        }
        self.buf.resize(at + R::SIZE, 0);
        event.write(&mut self.buf[at..]);
    }

    pub fn bytes(&self) -> &[u8] {
        &self.buf
    }

    pub(crate) fn clear(&mut self) {
        self.buf.clear();
    }
}

/// What `Engine::render` returns: the two channels and every event record written on the way.
pub struct Rendered {
    pub l: Vec<f32>,
    pub r: Vec<f32>,
    pub events: Vec<u8>,
}

pub struct Engine {
    pub sample_rate: f32,
    /// The frame the next block starts at.
    pub frame: u64,
    pub samples: SampleTable,
    pub voices: VoicePool,
    pub buses: Buses,
    /// Every bus's effect slots.
    pub fx: Rack,
    pub limiter: Limiter,
    pub meters: Meters,
    pub transport: Transport,
    pub seq: Seq,
    pub looper: Looper,
    pub grains: Grains,
    pub babble: Babble,
    pub gens: Gens,
    pub events: Events,
    /// Command records that arrived since the last block.
    pub(crate) inbox: Vec<u8>,
    /// Command records waiting for a later block.
    pub(crate) held: Vec<u8>,
    /// The master: left in `..frames`, right in `frames..2 * frames`.
    out: Vec<f32>,
}

impl Engine {
    pub fn new(sample_rate: f32, max_voices: u32) -> Self {
        let sample_rate = if sample_rate.is_finite() && sample_rate >= 8000.0 { sample_rate } else { 48000.0 };
        let max_voices = (max_voices as usize).clamp(1, 1024);
        Engine {
            sample_rate,
            frame: 0,
            samples: SampleTable::new(),
            voices: VoicePool::new(max_voices, sample_rate),
            buses: Buses::new(sample_rate),
            fx: Rack::new(sample_rate),
            limiter: Limiter::new(sample_rate),
            meters: Meters::new(sample_rate),
            transport: Transport::new(sample_rate),
            seq: Seq::new(sample_rate),
            looper: Looper::new(sample_rate),
            grains: Grains::new(sample_rate),
            babble: Babble::new(sample_rate),
            gens: Gens::new(sample_rate),
            events: Events::new(),
            inbox: Vec::with_capacity(ops::CMD_CAP),
            held: Vec::with_capacity(cmd::HELD_CAP),
            out: vec![0.0; 2 * ops::MAX_BLOCK],
        }
    }

    /// Queues command records for the next block.
    pub fn command(&mut self, records: &[u8]) {
        self.inbox.extend_from_slice(records);
    }

    /// Renders one block of up to `MAX_BLOCK` frames and returns the master, left then right.
    pub fn process(&mut self, frames: usize) -> (&[f32], &[f32]) {
        let frames = frames.min(ops::MAX_BLOCK);
        self.events.clear();
        cmd::run(self, frames);
        self.transport.advance(self.frame, frames, &self.samples, &mut self.voices, &mut self.events);
        self.seq.run(&self.transport, &self.samples, &mut self.voices, self.frame, frames, &mut self.events);
        self.looper.run(&self.transport, &self.samples, &mut self.voices, self.frame, frames);
        self.buses.clear(frames);
        self.grains.run(&self.samples, &mut self.buses, self.frame, frames);
        self.babble.run(&self.samples, &mut self.buses, self.frame, frames, &mut self.events);
        self.gens.run(&mut self.buses, self.frame, frames);
        self.voices.render(&self.samples, &mut self.buses, self.frame, frames, &mut self.events);
        self.samples.collect(&self.voices);
        let (l, r) = self.out[..2 * frames].split_at_mut(frames);
        self.fx.tempo(self.transport.frames_per_beat(), self.transport.beats_per_bar());
        self.fx.tick(frames);
        self.buses.mix(frames, l, r, &mut self.fx);
        self.limiter.process(l, r);
        self.meters.run(&self.buses, self.fx.reduction(), l, r, self.frame, &mut self.events);
        self.frame += frames as u64;
        self.out[..2 * frames].split_at(frames)
    }

    /// The event records the last block wrote.
    pub fn events(&self) -> &[u8] {
        self.events.bytes()
    }

    /// Copies 16-bit interleaved PCM into memory the core owns and registers it as `sample`, as the worklet does
    /// with `alloc` and `SAMPLE_LOAD`. Its `SAMPLE_READY` is in `events()` until the next block. For tests and
    /// offline use; it allocates.
    pub fn load_sample(&mut self, sample: u32, pcm: &[i16], channels: u32, rate: f32) -> bool {
        let channels = channels.clamp(1, 2);
        let frames = pcm.len() / channels as usize;
        let bytes = frames * channels as usize * 2;
        let ptr = crate::alloc::alloc_bytes(bytes) as *mut i16;
        if ptr.is_null() {
            return false;
        }
        // SAFETY: `ptr` holds `bytes` bytes, which is `frames * channels` samples, all inside `pcm`.
        unsafe { core::ptr::copy_nonoverlapping(pcm.as_ptr(), ptr, frames * channels as usize) };
        cmd::load_sample(self, sample, ptr, frames as u32, channels, rate)
    }

    /// Renders `frames` frames in blocks and gathers the output and the events. For tests and offline use; it
    /// allocates.
    pub fn render(&mut self, frames: usize) -> Rendered {
        let mut out = Rendered { l: Vec::with_capacity(frames), r: Vec::with_capacity(frames), events: Vec::new() };
        let mut left = frames;
        while left > 0 {
            let n = left.min(ops::MAX_BLOCK);
            let (l, r) = self.process(n);
            out.l.extend_from_slice(l);
            out.r.extend_from_slice(r);
            out.events.extend_from_slice(self.events.bytes());
            left -= n;
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ops::{SampleReady, VoiceStart};

    fn tone(frames: usize) -> Vec<i16> {
        (0..frames).map(|i| ((i as f32 * 0.05).sin() * 20000.0) as i16).collect()
    }

    fn start(sample: u32, at_frame: u32) -> VoiceStart {
        VoiceStart {
            at_frame,
            voice: 7,
            sample,
            bus: 0,
            gain: 1.0,
            pan: 0.0,
            rate: 1.0,
            offset: 0,
            loop_start: 0,
            loop_end: 0,
            attack: 0,
            release: 0,
            send_bus1: 0,
            send1: 0.0,
            send_bus2: 0,
            send2: 0.0,
            priority: 0,
            flags: 0,
        }
    }

    #[test]
    fn a_loaded_sample_is_announced_and_heard() {
        let mut e = Engine::new(48000.0, 8);
        assert!(e.load_sample(1, &tone(4800), 1, 48000.0));
        assert_eq!(e.events(), &SampleReady { frame: 0, sample: 1 }.bytes()[..]);
        e.command(&start(1, 0).bytes());
        let out = e.render(9600);
        assert!(out.l.iter().any(|s| s.abs() > 0.05));
        assert!(out.r.iter().any(|s| s.abs() > 0.05));
        assert!(out.l.iter().chain(&out.r).all(|s| s.is_finite()));
    }

    #[test]
    fn a_start_for_a_later_frame_is_silent_until_then() {
        let mut e = Engine::new(48000.0, 8);
        e.load_sample(1, &tone(4800), 1, 48000.0);
        e.command(&start(1, 1000).bytes());
        let out = e.render(4800);
        assert!(out.l[..1000].iter().all(|s| *s == 0.0));
        assert!(out.l[1000..].iter().any(|s| s.abs() > 0.05));
    }

    #[test]
    fn a_start_for_a_sample_the_core_does_not_hold_is_ignored() {
        let mut e = Engine::new(48000.0, 8);
        e.command(&start(9, 0).bytes());
        let out = e.render(960);
        assert!(out.l.iter().all(|s| *s == 0.0));
    }

    #[test]
    fn the_frame_counter_follows_the_blocks() {
        let mut e = Engine::new(48000.0, 8);
        e.render(1000);
        assert_eq!(e.frame, 1000);
    }
}
