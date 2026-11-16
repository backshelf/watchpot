//! The voice pool: every sample that is sounding.
//!
//! A voice reads 16-bit PCM with 4-point Hermite interpolation from a 32.32 fixed-point position, so the read
//! position never needs a float-to-int cast. It has an attack and a release ramp, a gain, an equal-power pan and
//! two post-fader sends, each movable over a slew, an optional loop with a short crossfade, and a start frame
//! honoured to the sample.
//!
//! A block of a voice is rendered in runs: stretches over which nothing changes shape (no envelope stage ends, no
//! slew ends, no loop or edge of the sample is near), so a run is one tight loop with its gains ramped linearly
//! and every PCM read in range by construction. The few frames near an edge (the first frame, the last two, a
//! loop's crossfade) take a careful path one frame at a time.
//!
//! The pool holds `max_voices` live voices plus as many slots again for voices fading out after a steal, so a
//! steal never cuts: when the pool is full, the quietest voice of the lowest priority is released over 5 ms and the
//! new voice takes a spare slot.

use crate::bus::{Buses, Ramp};
use crate::engine::Events;
use crate::math::{finite_or, hermite, ms_to_frames, pan_gains};
use crate::ops::{MAX_BLOCK, MAX_BUSES, VoiceEnded, VoiceStart, voice_param};
use crate::sample::SampleTable;
use crate::space::Place;

const ATTACK_MS: f32 = 2.0;
const RELEASE_MS: f32 = 8.0;
/// The release of a stolen voice, or of one whose sample is freed.
const STEAL_MS: f32 = 5.0;
/// The longest crossfade at a loop's seam.
const LOOP_FADE_MS: f32 = 5.0;
/// The fastest a voice reads its sample, in source frames per output frame.
const MAX_STEP: f64 = 64.0;
/// While the rate slews, it is updated this often (frames).
const RATE_RUN: usize = 32;
/// Voice handles that ended without sounding (a start refused or cut), waiting for the next block's events.
const DROPPED_CAP: usize = 256;

const ONE: f64 = 4294967296.0;
const FRAC: f32 = 1.0 / 4294967296.0;
const PCM: f32 = 1.0 / 32768.0;

#[derive(Clone, Copy, PartialEq, Debug)]
enum Stage {
    Attack,
    Sustain,
    Release,
}

#[derive(Clone, Copy)]
struct Voice {
    active: bool,
    /// Released by a steal (or a freed sample): no longer counted against `max_voices`.
    fading: bool,
    id: u32,
    sample: u32,
    data: *const i16,
    /// Source frames.
    len: u32,
    stereo: bool,
    /// Source rate over engine rate.
    ratio: f32,
    bus: usize,
    send_bus: [usize; 2],
    priority: u32,
    /// The frame it starts on.
    start: u64,
    /// Where it reads, in source frames, 32.32.
    pos: u64,
    /// Source frames per output frame, 32.32.
    step: u64,
    /// `[loop_start, loop_end)` in source frames; `loop_end` 0 is no loop.
    loop_start: u32,
    loop_end: u32,
    /// The crossfade before `loop_end`, in source frames (0: a plain wrap).
    fade: u32,
    gain: Ramp,
    pan: Ramp,
    rate: Ramp,
    send: [Ramp; 2],
    pan_l: f32,
    pan_r: f32,
    stage: Stage,
    env: f32,
    env_step: f32,
    /// Frames left in the attack or the release.
    env_left: u32,
    /// Its own release, in frames.
    release: u32,
}

const IDLE: Voice = Voice {
    active: false,
    fading: false,
    id: 0,
    sample: 0,
    data: core::ptr::null(),
    len: 0,
    stereo: false,
    ratio: 1.0,
    bus: 0,
    send_bus: [0; 2],
    priority: 0,
    start: 0,
    pos: 0,
    step: 1 << 32,
    loop_start: 0,
    loop_end: 0,
    fade: 0,
    gain: Ramp::at(0.0),
    pan: Ramp::at(0.0),
    rate: Ramp::at(1.0),
    send: [Ramp::at(0.0); 2],
    pan_l: 0.0,
    pan_r: 0.0,
    stage: Stage::Sustain,
    env: 0.0,
    env_step: 0.0,
    env_left: 0,
    release: 1,
};

/// A rate as a ratio: 0, negative and non-finite are 1.
#[inline]
fn sane_rate(rate: f32) -> f32 {
    if rate.is_finite() && rate > 0.0 { rate } else { 1.0 }
}

impl Voice {
    fn begin_release(&mut self, frames: u32) {
        let frames = frames.max(1);
        if self.stage == Stage::Release && self.env_left <= frames {
            return;
        }
        self.stage = Stage::Release;
        self.env_left = frames;
        self.env_step = -self.env / frames as f32;
    }

    fn update_step(&mut self) {
        let step = (self.rate.value as f64 * self.ratio as f64).min(MAX_STEP);
        self.step = ((step * ONE) as u64).max(1);
    }

    fn update_pan(&mut self) {
        (self.pan_l, self.pan_r) = pan_gains(self.pan.value);
    }

    /// The gains on each side now, with the PCM scale folded in.
    #[inline]
    fn gains(&self) -> (f32, f32) {
        let g = self.env * self.gain.value * PCM;
        (g * self.pan_l, g * self.pan_r)
    }

    /// How loud it is for a steal: what it will be if it has not started.
    fn loudness(&self, now: u64) -> f32 {
        if self.start > now { self.gain.value } else { self.env * self.gain.value }
    }

    /// Moves the envelope on `n` frames (never past the end of its stage).
    #[inline]
    fn advance_env(&mut self, n: u32) {
        match self.stage {
            Stage::Sustain => {}
            Stage::Attack => {
                if n >= self.env_left {
                    self.stage = Stage::Sustain;
                    self.env = 1.0;
                    self.env_left = 0;
                } else {
                    self.env += self.env_step * n as f32;
                    self.env_left -= n;
                }
            }
            Stage::Release => {
                if n >= self.env_left {
                    self.env = 0.0;
                    self.env_left = 0;
                } else {
                    self.env = (self.env + self.env_step * n as f32).max(0.0);
                    self.env_left -= n;
                }
            }
        }
    }

    /// The source frame below which a run may read its four taps straight from the PCM.
    #[inline]
    fn fast_end(&self) -> u64 {
        let edge = self.len.saturating_sub(2) as u64;
        if self.loop_end > 0 { edge.min((self.loop_end - self.fade) as u64) } else { edge }
    }

    /// One tap of channel `c` at source frame `i`: before the start is the first frame, past a loop's end wraps,
    /// past a one-shot's end is silence.
    #[inline]
    fn tap(&self, i: i64, c: usize) -> f32 {
        let mut i = i.max(0);
        if self.loop_end > 0 && i >= self.loop_end as i64 {
            i -= (self.loop_end - self.loop_start) as i64;
        }
        if i >= self.len as i64 {
            return 0.0;
        }
        let ch = if self.stereo { 2 } else { 1 };
        // SAFETY: `0 <= i < len`, and the PCM holds `len * ch` samples while a voice reads it.
        unsafe { *self.data.add(i as usize * ch + c.min(ch - 1)) as f32 }
    }

    #[inline]
    fn read(&self, pos: u64, c: usize) -> f32 {
        let i = (pos >> 32) as i64;
        let t = (pos as u32) as f32 * FRAC;
        hermite(self.tap(i - 1, c), self.tap(i, c), self.tap(i + 1, c), self.tap(i + 2, c), t)
    }

    /// One frame by the careful path: any position, with the loop's crossfade.
    fn read_slow(&self, c: usize) -> f32 {
        let s = self.read(self.pos, c);
        if self.loop_end == 0 || self.fade == 0 {
            return s;
        }
        let seam = ((self.loop_end - self.fade) as u64) << 32;
        if self.pos < seam {
            return s;
        }
        let w = ((self.pos - seam) as f64 / (self.fade as f64 * ONE)) as f32;
        let back = self.pos - (((self.loop_end - self.loop_start) as u64) << 32);
        s + (self.read(back, c) - s) * w
    }

    /// Renders this block of the voice into `out_l` and `out_r` from frame `now`. Returns the first frame written,
    /// the frame after the last, and whether the voice is over.
    fn render(&mut self, now: u64, frames: usize, out_l: &mut [f32], out_r: &mut [f32]) -> (usize, usize, bool) {
        let first = if self.start > now { (self.start - now).min(frames as u64) as usize } else { 0 };
        let mut i = first;
        while i < frames {
            if self.stage == Stage::Release && self.env_left == 0 {
                return (first, i, true);
            }
            if self.loop_end == 0 && (self.pos >> 32) >= self.len as u64 {
                return (first, i, true);
            }
            let mut n = frames - i;
            if self.stage != Stage::Sustain {
                n = n.min(self.env_left as usize);
            }
            if self.gain.left > 0 {
                n = n.min(self.gain.left as usize);
            }
            if self.pan.left > 0 {
                n = n.min(self.pan.left as usize);
            }
            if self.rate.left > 0 {
                n = n.min(RATE_RUN).min(self.rate.left as usize);
                self.update_step();
            }
            let idx = self.pos >> 32;
            let end = self.fast_end();
            let fast = idx >= 1 && idx < end;
            if fast {
                let ahead = ((end << 32) - self.pos).div_ceil(self.step);
                n = n.min(ahead as usize);
            } else {
                n = 1;
            }

            let (l0, r0) = self.gains();
            let step = n as u32;
            self.advance_env(step);
            self.gain.advance(step);
            self.rate.advance(step);
            if self.pan.left > 0 {
                self.pan.advance(step);
                self.update_pan();
            }
            let (l1, r1) = self.gains();
            let inv = 1.0 / n as f32;
            let (dl, dr) = ((l1 - l0) * inv, (r1 - r0) * inv);

            let ol = &mut out_l[i..i + n];
            let or = &mut out_r[i..i + n];
            if fast {
                self.pos = if self.stereo {
                    run_stereo(self.data, self.pos, self.step, ol, or, l0, dl, r0, dr)
                } else {
                    run_mono(self.data, self.pos, self.step, ol, or, l0, dl, r0, dr)
                };
            } else {
                let sl = self.read_slow(0);
                let sr = if self.stereo { self.read_slow(1) } else { sl };
                ol[0] = sl * l0;
                or[0] = sr * r0;
                self.pos += self.step;
            }
            if self.loop_end > 0 && self.pos >= (self.loop_end as u64) << 32 {
                self.pos -= ((self.loop_end - self.loop_start) as u64) << 32;
            }
            i += n;
        }
        let over = (self.stage == Stage::Release && self.env_left == 0)
            || (self.loop_end == 0 && (self.pos >> 32) >= self.len as u64);
        (first, frames, over)
    }
}

/// The tight loop of a mono run. Every read is in range: the caller bounds the run so that `1 <= pos >> 32` and
/// `(pos >> 32) + 2 < len` throughout.
#[inline(always)]
#[allow(clippy::too_many_arguments)]
fn run_mono(data: *const i16, mut pos: u64, step: u64, ol: &mut [f32], or: &mut [f32], mut gl: f32, dl: f32, mut gr: f32, dr: f32) -> u64 {
    for (yl, yr) in ol.iter_mut().zip(or.iter_mut()) {
        let i = (pos >> 32) as usize;
        let t = (pos as u32) as f32 * FRAC;
        // SAFETY: the caller's bound above.
        let s = unsafe {
            let p = data.add(i - 1);
            hermite(*p as f32, *p.add(1) as f32, *p.add(2) as f32, *p.add(3) as f32, t)
        };
        *yl = s * gl;
        *yr = s * gr;
        gl += dl;
        gr += dr;
        pos += step;
    }
    pos
}

/// The tight loop of a stereo run, under the same bound as `run_mono`.
#[inline(always)]
#[allow(clippy::too_many_arguments)]
fn run_stereo(data: *const i16, mut pos: u64, step: u64, ol: &mut [f32], or: &mut [f32], mut gl: f32, dl: f32, mut gr: f32, dr: f32) -> u64 {
    for (yl, yr) in ol.iter_mut().zip(or.iter_mut()) {
        let i = (pos >> 32) as usize;
        let t = (pos as u32) as f32 * FRAC;
        // SAFETY: the caller's bound above.
        let (sl, sr) = unsafe {
            let p = data.add(2 * (i - 1));
            (
                hermite(*p as f32, *p.add(2) as f32, *p.add(4) as f32, *p.add(6) as f32, t),
                hermite(*p.add(1) as f32, *p.add(3) as f32, *p.add(5) as f32, *p.add(7) as f32, t),
            )
        };
        *yl = sl * gl;
        *yr = sr * gr;
        gl += dl;
        gr += dr;
        pos += step;
    }
    pos
}

/// Adds `src` into `dst`, scaled by a ramp from `g0` to `g1`.
#[inline]
fn add_ramped(dst: &mut [f32], src: &[f32], g0: f32, g1: f32) {
    if g0 == 1.0 && g1 == 1.0 {
        for (y, x) in dst.iter_mut().zip(src) {
            *y += x;
        }
        return;
    }
    let d = (g1 - g0) / src.len().max(1) as f32;
    let mut g = g0;
    for (y, x) in dst.iter_mut().zip(src) {
        *y += x * g;
        g += d;
    }
}

pub struct VoicePool {
    voices: Vec<Voice>,
    /// Voices counted against `max`: active and not fading after a steal.
    live: usize,
    max: usize,
    sample_rate: f32,
    attack: u32,
    release: u32,
    steal: u32,
    loop_fade: u32,
    dropped: [u32; DROPPED_CAP],
    dropped_len: usize,
    scratch_l: Vec<f32>,
    scratch_r: Vec<f32>,
    /// The place of each voice slot: inactive until `VOICE_PLACE` names the voice.
    places: Vec<Place>,
    /// How placed voices are spatialised (`ops::space_mode`).
    space_mode: u32,
}

impl VoicePool {
    pub fn new(max_voices: usize, sample_rate: f32) -> Self {
        let max = max_voices.max(1);
        VoicePool {
            voices: vec![IDLE; 2 * max],
            live: 0,
            max,
            sample_rate,
            attack: ms_to_frames(ATTACK_MS, sample_rate),
            release: ms_to_frames(RELEASE_MS, sample_rate),
            steal: ms_to_frames(STEAL_MS, sample_rate),
            loop_fade: ms_to_frames(LOOP_FADE_MS, sample_rate),
            dropped: [0; DROPPED_CAP],
            dropped_len: 0,
            scratch_l: vec![0.0; MAX_BLOCK],
            scratch_r: vec![0.0; MAX_BLOCK],
            places: (0..2 * max).map(|_| Place::new(sample_rate)).collect(),
            space_mode: 0,
        }
    }

    /// Voices sounding or fading.
    pub fn active(&self) -> usize {
        self.voices.iter().filter(|v| v.active).count()
    }

    /// Voices counted against the pool's size.
    pub fn live(&self) -> usize {
        self.live
    }

    fn drop_handle(&mut self, id: u32) {
        if id != 0 && self.dropped_len < DROPPED_CAP {
            self.dropped[self.dropped_len] = id;
            self.dropped_len += 1;
        }
    }

    fn retire(&mut self, slot: usize) {
        let v = &mut self.voices[slot];
        if v.active && !v.fading {
            self.live -= 1;
        }
        v.active = false;
    }

    /// Releases the quietest live voice of the lowest priority over the steal time, unless the newcomer ranks
    /// below every live voice. False when the newcomer should be refused.
    fn make_room(&mut self, priority: u32, at: u64) -> bool {
        let mut victim: Option<usize> = None;
        for (slot, v) in self.voices.iter().enumerate() {
            if !v.active || v.fading {
                continue;
            }
            let better = match victim {
                None => true,
                Some(w) => {
                    let w = &self.voices[w];
                    v.priority < w.priority || (v.priority == w.priority && v.loudness(at) < w.loudness(at))
                }
            };
            if better {
                victim = Some(slot);
            }
        }
        let Some(slot) = victim else { return true };
        if priority < self.voices[slot].priority {
            return false;
        }
        let steal = self.steal;
        let v = &mut self.voices[slot];
        v.fading = true;
        v.begin_release(steal);
        self.live -= 1;
        true
    }

    /// A free slot; when every spare is still fading, the quietest fading voice is cut for it.
    fn free_slot(&mut self, at: u64) -> usize {
        if let Some(slot) = self.voices.iter().position(|v| !v.active) {
            return slot;
        }
        let mut pick = 0;
        for (slot, v) in self.voices.iter().enumerate() {
            let p = &self.voices[pick];
            if (v.fading && !p.fading) || (v.fading == p.fading && v.loudness(at) < p.loudness(at)) {
                pick = slot;
            }
        }
        let id = self.voices[pick].id;
        self.retire(pick);
        self.drop_handle(id);
        pick
    }

    /// Starts a voice on frame `at` (the current block or later). A start for a sample the table does not hold is
    /// ignored; a start that ranks below every voice of a full pool is refused (its handle ends at once).
    pub fn start_at(&mut self, samples: &SampleTable, v: &VoiceStart, at: u64) {
        let Some(sample) = samples.get(v.sample) else { return };
        if self.live >= self.max && !self.make_room(v.priority, at) {
            self.drop_handle(v.voice);
            return;
        }
        let slot = self.free_slot(at);
        self.places[slot].reset();

        let len = sample.frames;
        let mut loop_start = v.loop_start;
        let mut loop_end = v.loop_end.min(len);
        if loop_end <= loop_start || v.offset >= loop_end {
            loop_start = 0;
            loop_end = 0;
        }
        let fade = if loop_end > 0 {
            let source_fade = (self.loop_fade as f32 * sample.rate / self.sample_rate) as u32;
            source_fade.min(loop_start).min((loop_end - loop_start) / 2)
        } else {
            0
        };
        let attack = if v.attack > 0 { v.attack } else { self.attack };
        let release = if v.release > 0 { v.release } else { self.release };
        let bus = |b: u32| if (b as usize) < MAX_BUSES { b as usize } else { 0 };
        let send = |level: f32| Ramp::at(finite_or(level, 0.0).max(0.0));

        let mut voice = Voice {
            active: true,
            fading: false,
            id: v.voice,
            sample: v.sample,
            data: sample.ptr(),
            len,
            stereo: sample.channels == 2,
            ratio: sample.rate / self.sample_rate,
            bus: bus(v.bus),
            send_bus: [bus(v.send_bus1), bus(v.send_bus2)],
            priority: v.priority,
            start: at,
            pos: (v.offset as u64) << 32,
            step: 1 << 32,
            loop_start,
            loop_end,
            fade,
            gain: Ramp::at(finite_or(v.gain, 1.0).max(0.0)),
            pan: Ramp::at(finite_or(v.pan, 0.0).clamp(-1.0, 1.0)),
            rate: Ramp::at(sane_rate(v.rate)),
            send: [send(v.send1), send(v.send2)],
            pan_l: 0.0,
            pan_r: 0.0,
            // The first frame already sounds: the ramp runs 1/attack, 2/attack, .. 1.
            stage: if attack > 1 { Stage::Attack } else { Stage::Sustain },
            env: 1.0 / attack as f32,
            env_step: 1.0 / attack as f32,
            env_left: attack - 1,
            release,
        };
        voice.update_step();
        voice.update_pan();
        self.voices[slot] = voice;
        self.live += 1;
    }

    /// Moves a parameter of voice `voice` (`voice_param`) to `value` over `slew` frames, from the block's start.
    pub fn set(&mut self, voice: u32, param: u32, value: f32, slew: u32, _at: u64) {
        if voice == 0 {
            return;
        }
        for v in self.voices.iter_mut().filter(|v| v.active && v.id == voice) {
            match param {
                voice_param::GAIN => v.gain.go(finite_or(value, v.gain.value).max(0.0), slew),
                voice_param::PAN => {
                    v.pan.go(finite_or(value, v.pan.value).clamp(-1.0, 1.0), slew);
                    v.update_pan();
                }
                voice_param::RATE => {
                    v.rate.go(sane_rate(value), slew);
                    v.update_step();
                }
                voice_param::SEND1 => v.send[0].go(finite_or(value, 0.0).max(0.0), slew),
                voice_param::SEND2 => v.send[1].go(finite_or(value, 0.0).max(0.0), slew),
                _ => {}
            }
        }
    }

    /// Places voice `voice` (`VOICE_PLACE`): from here its blocks pass through its `Place` before the bus.
    pub fn place(&mut self, voice: u32, pan: f32, distance: f32, occlusion: f32, slew: u32) {
        if voice == 0 {
            return;
        }
        for slot in 0..self.voices.len() {
            if self.voices[slot].active && self.voices[slot].id == voice {
                self.places[slot].set(pan, distance, occlusion, slew);
            }
        }
    }

    /// Sets how placed voices are spatialised (`ops::space_mode`).
    pub fn space(&mut self, mode: u32) {
        self.space_mode = mode;
    }

    /// Releases voice `voice` over `release` frames (0: its own release), from the block's start.
    pub fn stop(&mut self, voice: u32, release: u32, _at: u64) {
        if voice == 0 {
            return;
        }
        for v in self.voices.iter_mut().filter(|v| v.active && v.id == voice) {
            let frames = if release > 0 { release } else { v.release };
            v.begin_release(frames);
        }
    }

    /// Releases every voice that reads `sample` over the steal time: its memory is about to go.
    pub fn release_sample(&mut self, sample: u32) {
        let steal = self.steal;
        for v in self.voices.iter_mut().filter(|v| v.active && v.sample == sample) {
            if !v.fading {
                v.fading = true;
                self.live -= 1;
            }
            v.begin_release(steal);
        }
    }

    /// Whether any voice still reads `sample`.
    pub fn uses_sample(&self, sample: u32) -> bool {
        self.voices.iter().any(|v| v.active && v.sample == sample)
    }

    /// Whether any voice still reads the PCM at `ptr`.
    pub fn reads(&self, ptr: *const i16) -> bool {
        self.voices.iter().any(|v| v.active && core::ptr::eq(v.data, ptr))
    }

    /// Ends at once every voice reading the PCM at `ptr`: the last resort when it cannot wait.
    pub fn cut(&mut self, ptr: *const i16) {
        for slot in 0..self.voices.len() {
            let v = self.voices[slot];
            if v.active && core::ptr::eq(v.data, ptr) {
                self.retire(slot);
                self.drop_handle(v.id);
            }
        }
    }

    /// Adds `frames` frames of every voice into its bus and sends, from frame `now`, and reports the voices that
    /// ended.
    pub fn render(&mut self, _samples: &SampleTable, buses: &mut Buses, now: u64, frames: usize, events: &mut Events) {
        for &voice in &self.dropped[..self.dropped_len] {
            events.push(&VoiceEnded { frame: now as u32, voice });
        }
        self.dropped_len = 0;
        let frames = frames.min(MAX_BLOCK);
        for slot in 0..self.voices.len() {
            if !self.voices[slot].active {
                continue;
            }
            let v = &mut self.voices[slot];
            let sends = [v.send[0].value, v.send[1].value];
            let (first, last, over) = v.render(now, frames, &mut self.scratch_l, &mut self.scratch_r);
            let n = (last - first) as u32;
            v.send[0].advance(n);
            v.send[1].advance(n);
            let v = *v;
            if last > first {
                // A placed voice passes through its place first; a far one is more of its first send.
                let lift = if self.places[slot].active() {
                    self.places[slot].process(
                        self.space_mode,
                        &mut self.scratch_l[first..last],
                        &mut self.scratch_r[first..last],
                    )
                } else {
                    0.0
                };
                let (sl, sr) = (&self.scratch_l[first..last], &self.scratch_r[first..last]);
                let (bl, br) = buses.input(v.bus);
                add_ramped(&mut bl[first..last], sl, 1.0, 1.0);
                add_ramped(&mut br[first..last], sr, 1.0, 1.0);
                for k in 0..2 {
                    // The lift needs somewhere to go: a first send to the master is no send at all.
                    let lift = if k == 0 && v.send_bus[0] != 0 { lift } else { 0.0 };
                    let (s0, s1) = (sends[k] + lift, v.send[k].value + lift);
                    if s0 > 0.0 || s1 > 0.0 {
                        let (bl, br) = buses.input(v.send_bus[k]);
                        add_ramped(&mut bl[first..last], sl, s0, s1);
                        add_ramped(&mut br[first..last], sr, s0, s1);
                    }
                }
            }
            if over {
                self.retire(slot);
                if v.id != 0 {
                    events.push(&VoiceEnded { frame: (now + last as u64) as u32, voice: v.id });
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ramp_pcm(frames: usize) -> Vec<i16> {
        (0..frames).map(|i| (i * 5) as i16).collect()
    }

    fn voice_over(pcm: &[i16], ratio: f32, loop_start: u32, loop_end: u32, fade: u32) -> Voice {
        let mut v = IDLE;
        v.active = true;
        v.data = pcm.as_ptr();
        v.len = pcm.len() as u32;
        v.ratio = ratio;
        v.loop_start = loop_start;
        v.loop_end = loop_end;
        v.fade = fade;
        v.gain = Ramp::at(1.0);
        v.env = 1.0;
        v.update_step();
        v.update_pan();
        v
    }

    #[test]
    fn the_fast_runs_and_the_careful_path_agree() {
        let pcm: Vec<i16> = (0..5000).map(|i| ((i as f32 * 0.037).sin() * 20000.0) as i16).collect();
        for ratio in [0.73f32, 1.0, 1.9] {
            let mut a = voice_over(&pcm, ratio, 0, 0, 0);
            let mut b = a;
            let (mut al, mut ar) = (vec![0.0; 128], vec![0.0; 128]);
            for _ in 0..10 {
                a.render(0, 128, &mut al, &mut ar);
            }
            // The same frames, one at a time by the careful path.
            let mut want = 0.0;
            for _ in 0..1280 {
                want = b.read_slow(0) * b.gains().0;
                b.pos += b.step;
            }
            assert!((al[127] - want).abs() < 1e-4, "ratio {ratio}: {} vs {want}", al[127]);
        }
    }

    #[test]
    fn a_loop_crosses_its_seam_without_a_step() {
        let pcm: Vec<i16> = ramp_pcm(4000);
        // A rising ramp looped: the seam is a jump of 9750 (0.21 after the pan) that the crossfade spreads out.
        let mut v = voice_over(&pcm, 1.0, 1200, 3150, 200);
        let (mut l, mut r) = (vec![0.0; 128], vec![0.0; 128]);
        let mut prev: Option<f32> = None;
        let mut worst = 0.0f32;
        for _ in 0..80 {
            let (_, _, over) = v.render(0, 128, &mut l, &mut r);
            assert!(!over);
            for &s in &l {
                if let Some(p) = prev {
                    worst = worst.max((s - p).abs());
                }
                prev = Some(s);
            }
        }
        assert!(worst < 0.01, "{worst}");
    }
}
