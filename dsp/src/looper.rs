//! Loops: samples a whole number of bars long, played phase-locked to the transport, each at its own level.
//!
//! A loop is `bars` bars of the meter it starts in, laid from the transport's beat 0: at beat `b` it reads source
//! frame `(b mod span) * frames_per_beat_of_source`. Started late it starts inside itself at that frame, so a loop
//! that starts on bar 1.5 sounds sample for sample like one that started on bar 0. It follows a tempo change by
//! varispeed (the pitch moves with it; a pack is built at the tempo it plays at).
//!
//! The lock is kept by a mirror: the looper knows exactly how the voice moves its 32.32 read position (the same
//! step from the same `f32` rate), so it knows where the voice is on every block without asking. Each block it
//! sets the rate that carries the voice to where the transport says it should be: the start's fraction of a frame
//! is closed inside the voice's first block (under its 2 ms attack), and an `f32` rate's rounding over `HORIZON`
//! frames after that. The rate moves by parts per million, far below anything heard, and the voice stays within a
//! thousandth of a frame of the transport for as long as it plays.
//!
//! The level slews in beats. With the transport stopped a loop is released and waits; started again, it comes back
//! in at the transport's position. A loop started while the transport is stopped waits for it to start. A loop's
//! voice takes a handle from `ops::CORE_VOICE` up (`CORE_VOICE | generation << 8 | slot`), which the shell never
//! issues.

use crate::ops::{CORE_VOICE, LOOPS, LoopSet, LoopStart, LoopStop, VoiceStart, voice_param};
use crate::sample::SampleTable;
use crate::transport::Transport;
use crate::voice::VoicePool;

/// Loops are never stolen.
const LOOP_PRIORITY: u32 = u32::MAX;
/// Frames over which a phase error is closed.
const HORIZON: f64 = 1024.0;
/// A phase error past this many source frames (the transport jumped) restarts the voice where it should be.
const LOST: f64 = 64.0;
/// What `voice.rs` reads in a frame at most, and its fixed point.
const MAX_STEP: f64 = 64.0;
const ONE: f64 = 4294967296.0;

#[derive(Clone, Copy, PartialEq, Debug)]
enum State {
    Idle,
    /// Waiting to start (on `at`, or when the transport next runs).
    Armed,
    Playing,
}

#[derive(Clone, Copy)]
struct Slot {
    state: State,
    def: LoopStart,
    at: u64,
    generation: u32,
    handle: u32,
    /// The sample as the voice reads it: its memory, its length, source frames per beat, beats in the loop, and
    /// source rate over engine rate.
    ptr: *const i16,
    len: u32,
    per_beat: f64,
    span: f64,
    ratio: f32,
    /// The voice's read position (32.32), as the voice will have it at the start of the next block.
    pos: u64,
    /// The rate the voice was last given.
    rate: f32,
    /// The level (0..1) moves from `from` at beat `from_beat` to `to` at beat `to_beat`.
    from: f32,
    to: f32,
    from_beat: f64,
    to_beat: f64,
    /// The gain the voice was last given.
    gain: f32,
    /// The beat it ends on, fading out.
    end_beat: Option<f64>,
    /// A `LOOP_SET` (level, beats, frame) and a `LOOP_STOP` (beats, frame) waiting for `run`.
    set: Option<(f32, f32, u64)>,
    stop: Option<(f32, u64)>,
}

impl Slot {
    fn level(&self, b: f64) -> f32 {
        if b >= self.to_beat || self.to_beat <= self.from_beat {
            self.to
        } else if b <= self.from_beat {
            self.from
        } else {
            self.from + (self.to - self.from) * ((b - self.from_beat) / (self.to_beat - self.from_beat)) as f32
        }
    }

    fn fade(&mut self, to: f32, beats: f32, b: f64) {
        self.from = self.level(b);
        self.to = to;
        self.from_beat = b;
        self.to_beat = b + if beats.is_finite() { beats.max(0.0) as f64 } else { 0.0 };
    }

    /// The source frame the transport puts the loop on at beat `b`.
    fn target(&self, b: f64) -> f64 {
        b.rem_euclid(self.span) * self.per_beat
    }
}

const IDLE: Slot = Slot {
    state: State::Idle,
    def: LoopStart {
        at_frame: 0,
        slot: 0,
        sample: 0,
        bus: 0,
        gain: 0.0,
        level: 0.0,
        bars: 1.0,
        send_bus1: 0,
        send1: 0.0,
        send_bus2: 0,
        send2: 0.0,
    },
    at: 0,
    generation: 0,
    handle: 0,
    ptr: core::ptr::null(),
    len: 0,
    per_beat: 0.0,
    span: 1.0,
    ratio: 1.0,
    pos: 0,
    rate: 1.0,
    from: 0.0,
    to: 0.0,
    from_beat: 0.0,
    to_beat: 0.0,
    gain: 0.0,
    end_beat: None,
    set: None,
    stop: None,
};

/// The step `voice.rs` takes for a rate: the same arithmetic, so the mirror never drifts from the voice.
#[inline]
fn step_of(rate: f32, ratio: f32) -> u64 {
    (((rate as f64 * ratio as f64).min(MAX_STEP) * ONE) as u64).max(1)
}

pub struct Looper {
    sample_rate: f32,
    slots: Vec<Slot>,
}

impl Looper {
    pub fn new(sample_rate: f32) -> Self {
        Looper { sample_rate, slots: vec![IDLE; LOOPS] }
    }

    /// `LOOP_START` on frame `at`: started late, a loop starts inside itself at the transport's position.
    pub fn start(
        &mut self,
        l: &LoopStart,
        at: u64,
        _transport: &Transport,
        _samples: &SampleTable,
        voices: &mut VoicePool,
    ) {
        let Some(s) = self.slots.get_mut(l.slot as usize) else {
            return;
        };
        if s.state == State::Playing {
            voices.stop(s.handle, 0, at);
        }
        let level = if l.level.is_finite() { l.level.clamp(0.0, 1.0) } else { 1.0 };
        *s = Slot { state: State::Armed, def: *l, at, generation: s.generation, from: level, to: level, ..IDLE };
    }

    /// `LOOP_SET`: a loop's level, over beats.
    pub fn set(&mut self, l: &LoopSet, at: u64) {
        let Some(s) = self.slots.get_mut(l.slot as usize) else {
            return;
        };
        if s.state != State::Idle && l.level.is_finite() {
            s.set = Some((l.level.clamp(0.0, 1.0), l.beats, at));
        }
    }

    /// `LOOP_STOP`: fades a loop out over beats and ends it.
    pub fn stop(&mut self, l: &LoopStop, at: u64) {
        let Some(s) = self.slots.get_mut(l.slot as usize) else {
            return;
        };
        if s.state != State::Idle {
            s.stop = Some((l.beats, at));
        }
    }

    /// Moves every loop across the block: its level, its speed with the tempo, its end. After `Seq::run`, before
    /// the voices render.
    pub fn run(
        &mut self,
        transport: &Transport,
        samples: &SampleTable,
        voices: &mut VoicePool,
        now: u64,
        frames: usize,
    ) {
        let end = now + frames as u64;
        for i in 0..self.slots.len() {
            let mut s = self.slots[i];
            if s.state == State::Idle {
                continue;
            }
            if let Some((level, beats, at)) = s.set.take() {
                s.fade(level, beats, transport.beats_at(at));
            }
            if let Some((beats, at)) = s.stop.take() {
                if s.state != State::Playing || beats.is_nan() || beats <= 0.0 {
                    voices.stop(s.handle, 0, now);
                    self.slots[i] = Slot { generation: s.generation, ..IDLE };
                    continue;
                }
                let b = transport.beats_at(at);
                s.fade(0.0, beats, b);
                s.end_beat = Some(s.to_beat);
            }

            if s.state == State::Playing {
                let sample = samples.get(s.def.sample);
                if sample.is_none_or(|x| !core::ptr::eq(x.ptr(), s.ptr)) {
                    // Freed (its voice is already released) or replaced: start again on whatever is there now.
                    s.state = State::Armed;
                    s.at = now;
                } else if !transport.running() {
                    voices.stop(s.handle, 0, now);
                    s.state = State::Armed;
                    s.at = now;
                } else if s.end_beat.is_some_and(|e| transport.beats_at(end) >= e) {
                    voices.stop(s.handle, 0, now);
                    self.slots[i] = Slot { generation: s.generation, ..IDLE };
                    continue;
                } else if !self.follow(&mut s, transport, voices, now, end) {
                    voices.stop(s.handle, 0, now);
                    s.state = State::Armed;
                    s.at = now;
                }
            }

            if s.state == State::Armed
                && let Some(f) = transport.running_from(s.at.max(now))
                && !self.begin(&mut s, transport, samples, voices, f, end)
            {
                self.slots[i] = Slot { generation: s.generation, ..IDLE };
                continue;
            }
            self.slots[i] = s;
        }
    }

    /// Starts the loop's voice on frame `f` at the source frame the transport is on. False when the sample is not
    /// there.
    fn begin(
        &self,
        s: &mut Slot,
        transport: &Transport,
        samples: &SampleTable,
        voices: &mut VoicePool,
        f: u64,
        end: u64,
    ) -> bool {
        let Some(sample) = samples.get(s.def.sample) else {
            return false;
        };
        if sample.frames < 2 {
            return false;
        }
        let bars = if s.def.bars.is_finite() && s.def.bars > 0.0 { s.def.bars as f64 } else { 1.0 };
        s.ptr = sample.ptr();
        s.len = sample.frames;
        s.ratio = sample.rate / self.sample_rate;
        s.span = bars * transport.beats_per_bar() as f64;
        s.per_beat = s.len as f64 / s.span;

        let b = transport.beats_at(f);
        let offset = (s.target(b).floor() as u32).min(s.len - 1);
        s.pos = (offset as u64) << 32;
        s.rate = self.rate_for(s, transport, f, end, 1.0);
        s.generation = (s.generation + 1) & 0xff;
        s.handle = CORE_VOICE as u32 | s.generation << 8 | s.def.slot;
        s.gain = s.def.gain.max(0.0) * s.level(b);
        let v = VoiceStart {
            at_frame: 0,
            voice: s.handle,
            sample: s.def.sample,
            bus: s.def.bus,
            gain: s.gain,
            pan: 0.0,
            rate: s.rate,
            offset,
            loop_start: 0,
            loop_end: s.len,
            attack: 0,
            release: 0,
            send_bus1: s.def.send_bus1,
            send1: s.def.send1,
            send_bus2: s.def.send_bus2,
            send2: s.def.send2,
            priority: LOOP_PRIORITY,
            flags: 0,
        };
        voices.start_at(samples, &v, f);
        self.advance_mirror(s, (end - f) as u32);
        s.state = State::Playing;
        true
    }

    /// One block of a playing loop: the rate that keeps it on the transport, and its level. False when it has
    /// lost its place (the transport jumped) and must start again.
    fn follow(&self, s: &mut Slot, transport: &Transport, voices: &mut VoicePool, now: u64, end: u64) -> bool {
        if self.error(s, transport, now).abs() > LOST {
            return false;
        }
        let rate = self.rate_for(s, transport, now, end, (end - now) as f64 / HORIZON);
        if rate != s.rate {
            s.rate = rate;
            voices.set(s.handle, voice_param::RATE, rate, 0, now);
        }
        let gain = s.def.gain.max(0.0) * s.level(transport.beats_at(end));
        if gain != s.gain {
            s.gain = gain;
            voices.set(s.handle, voice_param::GAIN, gain, (end - now) as u32, now);
        }
        self.advance_mirror(s, (end - now) as u32);
        true
    }

    /// Where the transport says the voice should be at `frame`, less where it is, in source frames (the shorter way
    /// round the loop).
    fn error(&self, s: &Slot, transport: &Transport, frame: u64) -> f64 {
        let len = s.len as f64;
        let d = s.target(transport.beats_at(frame)) - s.pos as f64 / ONE;
        d - len * (d / len).round()
    }

    /// The rate that carries the voice from where it is on frame `from` to where the transport will be on `end`,
    /// closing a share of its error.
    fn rate_for(&self, s: &Slot, transport: &Transport, from: u64, end: u64, share: f64) -> f32 {
        let n = (end - from) as f64;
        let ahead = (transport.beats_at(end) - transport.beats_at(from)) * s.per_beat;
        let err = self.error(s, transport, from);
        let per_frame = (ahead + err * share.min(1.0)) / n;
        let rate = (per_frame / s.ratio as f64) as f32;
        if rate.is_finite() && rate > 0.0 { rate } else { s.rate }
    }

    /// Moves the mirror on `n` frames at the rate the voice was given.
    fn advance_mirror(&self, s: &mut Slot, n: u32) {
        let len = (s.len as u64) << 32;
        s.pos = (s.pos + step_of(s.rate, s.ratio) * n as u64) % len;
    }
}
