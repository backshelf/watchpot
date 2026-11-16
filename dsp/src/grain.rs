//! The granulator: up to 8 clouds of up to 64 grains over a sample, each cloud's playhead a number the game drives.
//!
//! A grain is a Hann-windowed read of the sample: it starts on its own frame at the cloud's playhead (give or take
//! the spray), reads at the cloud's pitch, and is thrown somewhere across the stereo field (the cloud's pan, give or
//! take the spread). What it was given when it started it keeps: a parameter that moves is heard in the grains that
//! start after, so no grain is ever cut or bent mid-window. A cloud leaves as a voice does: its sum, scaled by its
//! level, adds into its bus and its two sends through `Buses::input`.
//!
//! The playhead. `position` (0..1 of the sample) puts it somewhere, at once or along a slew, and while it travels
//! the slew is the playhead: a game that sets `position` every frame scrubs the sample. Left alone, the playhead
//! runs on at `rate` (1 is real time, 0 holds, negative runs backwards) and stops at either end of the sample, where
//! there is nothing left to read and the cloud falls silent until it is moved. `pitch` is apart from both: `rate`
//! 0.5 and `pitch` 1 plays the sample at half speed and the same pitch.
//!
//! Defaults (before any `GRAIN_SET`): position 0, rate 0 (the playhead holds), size 100 ms, density 40 grains a
//! second, spray 0, pitch 1, spread 0, level 1. A parameter's first set lands at once.
//!
//! Ranges: position 0..1; rate -8..8; size 10 to 500 ms; density 0 to 1000 a second (0 starts none; past 64
//! sounding at once a start is dropped); spray 0..1 of the sample's length, either side of the playhead; pitch 1/16
//! to 16; spread 0..1; level 0..1.
//!
//! Level. Density times size is the number of grains sounding at once, and each grain is scaled by it when it
//! starts so the cloud is as loud as its sample whatever either is. Grains that read different stretches of the
//! sample add in power; grains that line up with it (the playhead moving at the pitch, no spray: the sample played
//! straight) add in amplitude. The cloud works out which it is from how far apart two neighbouring grains read
//! (`COHERE`) and scales between the two; the same number takes the jitter off the grain clock, so a sample played
//! straight is tiled by its windows and comes back whole, while a texture's grains never fall into a buzz. Below one
//! grain at a time there is nothing to even out: sparse grains are each as loud as one grain of a full cloud.
//!
//! `GRAIN_STOP` starts no more grains; a release of 0 lets the ones sounding finish their windows, any other fades
//! them over that many frames. A `GRAIN_START` on a cloud that is still sounding takes the cloud over at once: the
//! old grains fade out on their own (over what was left of a release, or 20 ms) beside the new ones, through the bus
//! they had. `release_sample` stops every grain reading the sample on the spot.
//!
//! Nothing here allocates after `new`. All randomness comes from the cloud's seed.

use crate::bus::Buses;
use crate::math::{PI, finite_or, hermite, lerp, ms_to_frames, pan_gains};
use crate::ops::{GRAIN_CLOUDS, GrainSet, GrainStart, GrainStop, MAX_BLOCK, MAX_BUSES, curve, grain_param};
use crate::param::Slew;
use crate::sample::SampleTable;

/// Grains one cloud sounds at once.
pub const MAX_GRAINS: usize = 64;
/// What a cloud does before any `GRAIN_SET`, by `ops::grain_param`.
pub const DEFAULTS: [f32; PARAMS] = [0.0, 0.0, 100.0, 40.0, 0.0, 1.0, 0.0, 1.0];

const PARAMS: usize = 8;
/// How far the grain clock strays: a texture's grains start between half and one and a half intervals apart.
const JITTER: f32 = 1.0;
/// Two neighbouring grains that read the sample this far apart (seconds) no longer line up at all.
const COHERE: f32 = 0.002;
/// The fade of the grains a new cloud takes over, when no release was running.
const REPLACE_MS: f32 = 20.0;
/// The most grains one block starts.
const BLOCK_STARTS: usize = 16;
/// The fastest a grain reads, in source frames per output frame.
const MAX_STEP: f64 = 64.0;
/// The mean square of a Hann window: what a grain's power is to its peak's.
const HANN_POWER: f32 = 0.375;

const ONE: f64 = 4294967296.0;
const FRAC: f32 = 1.0 / 4294967296.0;
const PCM: f32 = 1.0 / 32768.0;

/// One parameter's value held to its range.
fn clamp(param: u32, value: f32) -> f32 {
    match param {
        grain_param::POSITION | grain_param::SPRAY | grain_param::SPREAD | grain_param::LEVEL => value.clamp(0.0, 1.0),
        grain_param::RATE => value.clamp(-8.0, 8.0),
        grain_param::SIZE => value.clamp(10.0, 500.0),
        grain_param::DENSITY => value.clamp(0.0, 1000.0),
        _ => value.clamp(1.0 / 16.0, 16.0),
    }
}

/// What one grain is scaled by so that `overlap` of them at once are as loud as their sample: by power when they
/// read apart (`coherence` 0), by amplitude when they line up (1).
fn normalise(overlap: f32, coherence: f32) -> f32 {
    let overlap = overlap.min(MAX_GRAINS as f32);
    let power = (HANN_POWER * overlap.max(1.0)).sqrt();
    let sum = (0.5 * overlap).max(power);
    1.0 / lerp(power, sum, coherence)
}

#[derive(Clone, Copy)]
struct Grain {
    live: bool,
    /// Left behind by the cloud that started it: it fades by its own `trim` and no longer follows the level.
    orphan: bool,
    sample: u32,
    data: *const i16,
    /// The sample's frames.
    len: u32,
    stereo: bool,
    /// Where it reads, and how far it moves a frame: 32.32 source frames.
    pos: u64,
    step: u64,
    /// Output frames left of its window, and frames into the block it starts on.
    left: u32,
    delay: u32,
    /// The window: a point turning once round a circle over the grain, `1 - wx` the Hann window (doubled).
    wx: f32,
    wy: f32,
    eps: f32,
    /// The gains on each side: the pan, the cloud's normalising, half the window and the PCM scale.
    gl: f32,
    gr: f32,
    trim: f32,
    trim_step: f32,
}

const DEAD: Grain = Grain {
    live: false,
    orphan: false,
    sample: 0,
    data: core::ptr::null(),
    len: 0,
    stereo: false,
    pos: 0,
    step: 0,
    left: 0,
    delay: 0,
    wx: 1.0,
    wy: 0.0,
    eps: 0.0,
    gl: 0.0,
    gr: 0.0,
    trim: 1.0,
    trim_step: 0.0,
};

impl Grain {
    /// One frame of each side at `pos`, by the careful path: outside the sample is silence.
    #[inline]
    fn read_slow(&self, pos: u64) -> (f32, f32) {
        let i = (pos >> 32) as i64;
        let t = (pos as u32) as f32 * FRAC;
        let ch = if self.stereo { 2 } else { 1 };
        let tap = |i: i64, c: usize| {
            if i < 0 || i >= self.len as i64 {
                return 0.0;
            }
            // SAFETY: `0 <= i < len`, and the PCM holds `len * ch` samples while a grain reads it.
            unsafe { *self.data.add(i as usize * ch + c) as f32 }
        };
        let l = hermite(tap(i - 1, 0), tap(i, 0), tap(i + 1, 0), tap(i + 2, 0), t);
        let r = if self.stereo { hermite(tap(i - 1, 1), tap(i, 1), tap(i + 1, 1), tap(i + 2, 1), t) } else { l };
        (l, r)
    }

    /// Adds `n` windowed frames into `l` and `r`, each read by `read`.
    #[inline(always)]
    fn weave(&mut self, l: &mut [f32], r: &mut [f32], n: usize, read: impl Fn(u64) -> (f32, f32)) {
        let (mut wx, mut wy, eps) = (self.wx, self.wy, self.eps);
        let (mut trim, trim_step) = (self.trim, self.trim_step);
        let (mut pos, step) = (self.pos, self.step);
        let (gl, gr) = (self.gl, self.gr);
        for (yl, yr) in l[..n].iter_mut().zip(r[..n].iter_mut()) {
            let (sl, sr) = read(pos);
            let a = (1.0 - wx) * trim;
            *yl += sl * a * gl;
            *yr += sr * a * gr;
            wx -= eps * wy;
            wy += eps * wx;
            trim -= trim_step;
            pos += step;
        }
        (self.wx, self.wy, self.trim, self.pos) = (wx, wy, trim, pos);
    }

    /// Adds this block of the grain into `l` and `r` (cut to start on the grain's first frame). True when the
    /// grain is over.
    fn render(&mut self, l: &mut [f32], r: &mut [f32]) -> bool {
        let mut n = (self.left as usize).min(l.len()).min(r.len());
        let mut over = n == self.left as usize;
        if self.trim_step > 0.0 {
            let fade = (self.trim / self.trim_step).ceil().max(0.0) as usize;
            if fade <= n {
                n = fade;
                over = true;
            }
        }
        if n == 0 {
            return true;
        }
        let first = self.pos >> 32;
        let last = (self.pos + self.step * (n as u64 - 1)) >> 32;
        let data = self.data;
        if first >= 1 && last + 2 < self.len as u64 {
            // SAFETY (both): every frame of the run reads taps `i - 1 ..= i + 2`, all inside the sample by the
            // bound above.
            if self.stereo {
                self.weave(l, r, n, |pos| unsafe {
                    let p = data.add(2 * ((pos >> 32) as usize - 1));
                    let t = (pos as u32) as f32 * FRAC;
                    (
                        hermite(*p as f32, *p.add(2) as f32, *p.add(4) as f32, *p.add(6) as f32, t),
                        hermite(*p.add(1) as f32, *p.add(3) as f32, *p.add(5) as f32, *p.add(7) as f32, t),
                    )
                });
            } else {
                self.weave(l, r, n, |pos| unsafe {
                    let p = data.add((pos >> 32) as usize - 1);
                    let s = hermite(*p as f32, *p.add(1) as f32, *p.add(2) as f32, *p.add(3) as f32, (pos as u32) as f32 * FRAC);
                    (s, s)
                });
            }
        } else {
            let this = *self;
            self.weave(l, r, n, |pos| this.read_slow(pos));
        }
        self.left -= n as u32;
        // Past the sample's last frame there is only silence to read.
        over || (self.pos >> 32) > self.len as u64
    }
}

/// Where a cloud, or the grains it left behind, goes.
#[derive(Clone, Copy)]
struct Route {
    bus: usize,
    send_bus: [usize; 2],
    send: [f32; 2],
}

const NOWHERE: Route = Route { bus: 0, send_bus: [0; 2], send: [0.0; 2] };

impl Route {
    /// Adds `l` and `r` into the bus and the sends, scaled by a ramp from `g0` to `g1`.
    fn add(&self, buses: &mut Buses, l: &[f32], r: &[f32], g0: f32, g1: f32) {
        let n = l.len();
        let (bl, br) = buses.input(self.bus);
        add_ramped(&mut bl[..n], l, g0, g1);
        add_ramped(&mut br[..n], r, g0, g1);
        for k in 0..2 {
            if self.send[k] > 0.0 {
                let (bl, br) = buses.input(self.send_bus[k]);
                add_ramped(&mut bl[..n], l, g0 * self.send[k], g1 * self.send[k]);
                add_ramped(&mut br[..n], r, g0 * self.send[k], g1 * self.send[k]);
            }
        }
    }
}

/// Adds `src` into `dst`, scaled by a ramp from `g0` to `g1`.
#[inline]
fn add_ramped(dst: &mut [f32], src: &[f32], g0: f32, g1: f32) {
    let d = (g1 - g0) / src.len().max(1) as f32;
    let mut g = g0;
    for (y, x) in dst.iter_mut().zip(src) {
        *y += x * g;
        g += d;
    }
}

struct Cloud {
    /// Starting grains.
    on: bool,
    /// Grains sounding, the orphans among them counted apart.
    live: u32,
    orphans: u32,
    sample: u32,
    data: *const i16,
    len: u32,
    stereo: bool,
    /// Source frames in one output frame at real time.
    ratio: f64,
    /// The sample's length in seconds.
    seconds: f32,
    route: Route,
    /// Where the orphans go: the route of the cloud that started them.
    orphan_route: Route,
    pan: f32,
    params: [Slew; PARAMS],
    /// Where the next grain reads, in source frames.
    playhead: f64,
    /// True while `position` owns the playhead: it was just set, or it is travelling.
    scrub: bool,
    /// Grain intervals until the next grain starts.
    owed: f32,
    rng: u32,
    /// The stop's fade: 1 until a release runs, and what it loses a frame.
    fade: f32,
    fade_step: f32,
    /// The level times the fade at the end of the last block.
    gain: f32,
    /// True until its first block: the level lands rather than ramps.
    fresh: bool,
    grains: [Grain; MAX_GRAINS],
}

impl Cloud {
    fn idle() -> Self {
        Cloud {
            on: false,
            live: 0,
            orphans: 0,
            sample: 0,
            data: core::ptr::null(),
            len: 0,
            stereo: false,
            ratio: 1.0,
            seconds: 0.0,
            route: NOWHERE,
            orphan_route: NOWHERE,
            pan: 0.0,
            params: DEFAULTS.map(unset_at),
            playhead: 0.0,
            scrub: true,
            owed: 0.0,
            rng: 1,
            fade: 1.0,
            fade_step: 0.0,
            gain: 0.0,
            fresh: true,
            grains: [DEAD; MAX_GRAINS],
        }
    }

    /// 0..1, from the cloud's seed.
    #[inline]
    fn random(&mut self) -> f32 {
        self.rng ^= self.rng << 13;
        self.rng ^= self.rng >> 17;
        self.rng ^= self.rng << 5;
        (self.rng >> 8) as f32 * (1.0 / 16_777_216.0)
    }

    /// Hands the grains sounding to themselves: each keeps the gain it has now and fades on its own, so the cloud
    /// can be given to something else.
    fn orphan(&mut self, sample_rate: f32) {
        let trim = self.gain;
        let step = if self.on {
            trim / ms_to_frames(REPLACE_MS, sample_rate) as f32
        } else if self.fade_step > 0.0 && self.fade > 0.0 {
            // What is left of the release: the trim reaches nothing when the fade would have.
            trim * self.fade_step / self.fade
        } else {
            0.0
        };
        let mut moved = false;
        for g in self.grains.iter_mut().filter(|g| g.live && !g.orphan) {
            if self.fresh || trim <= 0.0 {
                // Never heard, or already silent.
                g.live = false;
                self.live -= 1;
                continue;
            }
            g.orphan = true;
            g.trim = trim;
            g.trim_step = step;
            self.orphans += 1;
            moved = true;
        }
        if moved {
            self.orphan_route = self.route;
        }
        self.on = false;
    }

    /// Starts one grain `delay` frames into the block, reading from source frame `at`.
    fn spawn(&mut self, delay: usize, at: f64, step: f64, frames: f32, gain: f32, pan: f32) {
        let Some(g) = self.grains.iter_mut().find(|g| !g.live) else { return };
        let (pl, pr) = pan_gains(pan);
        let scale = gain * 0.5 * PCM;
        *g = Grain {
            live: true,
            orphan: false,
            sample: self.sample,
            data: self.data,
            len: self.len,
            stereo: self.stereo,
            pos: (at * ONE) as u64,
            step: ((step * ONE) as u64).max(1),
            left: frames as u32,
            delay: delay as u32,
            wx: 1.0,
            wy: 0.0,
            eps: 2.0 * (PI / frames).sin(),
            gl: scale * pl,
            gr: scale * pr,
            trim: 1.0,
            trim_step: 0.0,
        };
        self.live += 1;
    }

    /// One block: moves the parameters and the playhead, starts the grains that fall in it, and adds every grain
    /// sounding into the bus and the sends.
    #[allow(clippy::too_many_arguments)]
    fn run(&mut self, sample_rate: f32, frames: usize, buses: &mut Buses, l: &mut [f32], r: &mut [f32], ol: &mut [f32], or: &mut [f32]) {
        let value = |c: &Cloud, p: u32| c.params[p as usize].value;
        let (size, density, spray) = (value(self, grain_param::SIZE), value(self, grain_param::DENSITY), value(self, grain_param::SPRAY));
        let (pitch, spread, rate) = (value(self, grain_param::PITCH), value(self, grain_param::SPREAD), value(self, grain_param::RATE));
        let from = value(self, grain_param::POSITION);
        for p in &mut self.params {
            p.advance(frames as u32);
        }
        let level = value(self, grain_param::LEVEL);

        if self.on {
            // The playhead across the block: the scrub's, or its own run at the rate, held at the sample's ends.
            let len = self.len as f64;
            let (p0, p1) = if self.scrub {
                self.scrub = self.params[grain_param::POSITION as usize].moving();
                (from as f64 * len, value(self, grain_param::POSITION) as f64 * len)
            } else {
                (self.playhead, (self.playhead + rate as f64 * self.ratio * frames as f64).clamp(0.0, len))
            };
            self.playhead = p1;

            let per_frame = density / sample_rate;
            if per_frame > 0.0 {
                let step = (pitch as f64 * self.ratio).min(MAX_STEP);
                // How far apart two neighbouring grains read, in seconds: none when the playhead keeps up with
                // the grains (the sample played straight), more as it falls behind, runs ahead or is sprayed.
                let drift = (step - (p1 - p0) / frames as f64).abs() / self.ratio;
                let apart = drift as f32 / density + spray * self.seconds;
                let coherence = (1.0 - apart / COHERE).clamp(0.0, 1.0);
                let length = (size * 0.001 * sample_rate).max(16.0);
                let gain = normalise(density * size * 0.001, coherence);
                let stray = JITTER * (1.0 - coherence);

                let mut t = self.owed / per_frame;
                let mut started = 0;
                while t < frames as f32 && started < BLOCK_STARTS {
                    let (a, b, c) = (self.random(), self.random(), self.random());
                    let k = (t.max(0.0) as usize).min(frames - 1);
                    let at = p0 + (p1 - p0) * (k as f64 / frames as f64) + ((2.0 * b - 1.0) * spray) as f64 * len;
                    let at = at.clamp(0.0, len);
                    // A grain at the sample's very end has nothing to read.
                    if at < len - 1.0 {
                        self.spawn(k, at, step, length, gain, (self.pan + (2.0 * c - 1.0) * spread).clamp(-1.0, 1.0));
                    }
                    t += (1.0 + stray * (a - 0.5)) / per_frame;
                    started += 1;
                }
                self.owed = ((t - frames as f32) * per_frame).max(0.0);
            }
        }

        // The stop's fade and the level, as one ramp across the block.
        let fade = (self.fade - self.fade_step * frames as f32).max(0.0);
        let g1 = level * fade;
        let g0 = if self.fresh { g1 } else { self.gain };
        self.fresh = false;
        self.fade = fade;
        self.gain = g1;
        let ended = !self.on && self.fade_step > 0.0 && fade <= 0.0;

        if self.live == 0 {
            return;
        }
        l[..frames].fill(0.0);
        r[..frames].fill(0.0);
        if self.orphans > 0 {
            ol[..frames].fill(0.0);
            or[..frames].fill(0.0);
        }
        let had_orphans = self.orphans > 0;
        for g in self.grains.iter_mut().filter(|g| g.live) {
            let first = (g.delay as usize).min(frames);
            g.delay = 0;
            let over = if g.orphan { g.render(&mut ol[first..frames], &mut or[first..frames]) } else { g.render(&mut l[first..frames], &mut r[first..frames]) };
            if over || (ended && !g.orphan) {
                g.live = false;
                self.live -= 1;
                self.orphans -= g.orphan as u32;
            }
        }
        if g0 > 0.0 || g1 > 0.0 {
            self.route.add(buses, &l[..frames], &r[..frames], g0, g1);
        }
        if had_orphans {
            self.orphan_route.add(buses, &ol[..frames], &or[..frames], 1.0, 1.0);
        }
    }
}

/// A parameter nothing has set, resting at `value`: its first set lands at once.
fn unset_at(value: f32) -> Slew {
    let mut s = Slew::unset();
    s.value = value;
    s
}

pub struct Grains {
    sample_rate: f32,
    clouds: Vec<Cloud>,
    /// A cloud's block, and its orphans' block: left and right of each.
    scratch: [Vec<f32>; 4],
}

impl Grains {
    pub fn new(sample_rate: f32) -> Self {
        Grains {
            sample_rate,
            clouds: (0..GRAIN_CLOUDS).map(|_| Cloud::idle()).collect(),
            scratch: [vec![0.0; MAX_BLOCK], vec![0.0; MAX_BLOCK], vec![0.0; MAX_BLOCK], vec![0.0; MAX_BLOCK]],
        }
    }

    /// `GRAIN_START`: a cloud over a sample the table holds, at its parameters' defaults. A cloud still sounding
    /// is taken over: its grains fade out on their own.
    pub fn start(&mut self, g: &GrainStart, samples: &SampleTable) {
        let Some(c) = self.clouds.get_mut(g.cloud as usize) else { return };
        c.orphan(self.sample_rate);
        let Some(sample) = samples.get(g.sample).filter(|s| s.frames >= 4) else { return };
        let bus = |b: u32| if (b as usize) < MAX_BUSES { b as usize } else { 0 };
        let send = |level: f32| finite_or(level, 0.0).max(0.0);
        c.on = true;
        c.sample = g.sample;
        c.data = sample.ptr();
        c.len = sample.frames;
        c.stereo = sample.channels == 2;
        c.ratio = (sample.rate / self.sample_rate) as f64;
        c.seconds = sample.frames as f32 / sample.rate;
        c.route = Route { bus: bus(g.bus), send_bus: [bus(g.send_bus1), bus(g.send_bus2)], send: [send(g.send1), send(g.send2)] };
        c.pan = finite_or(g.pan, 0.0).clamp(-1.0, 1.0);
        c.params = DEFAULTS.map(unset_at);
        c.playhead = 0.0;
        c.scrub = true;
        c.owed = 0.0;
        // Two clouds given the same seed still differ; no seed is the dead state of the generator.
        c.rng = (g.seed ^ (g.cloud + 1).wrapping_mul(0x9e37_79b9)).max(1);
        c.fade = 1.0;
        c.fade_step = 0.0;
        c.gain = 0.0;
        c.fresh = true;
    }

    /// `GRAIN_SET`: one of a cloud's parameters (`ops::grain_param`), slewed.
    pub fn set(&mut self, g: &GrainSet) {
        let Some(c) = self.clouds.get_mut(g.cloud as usize) else { return };
        let p = g.param as usize;
        if !c.on || p >= PARAMS || !g.value.is_finite() {
            return;
        }
        if g.param == grain_param::POSITION {
            // A scrub leaves from where the playhead is, wherever the rate has taken it.
            if !c.scrub && c.len > 0 {
                c.params[p] = Slew::at((c.playhead / c.len as f64) as f32);
            }
            c.scrub = true;
        }
        c.params[p].go(clamp(g.param, g.value), g.slew, curve::LIN);
    }

    /// `GRAIN_STOP`: no more grains; what is sounding fades over the release (0 lets each grain finish).
    pub fn stop(&mut self, g: &GrainStop) {
        let Some(c) = self.clouds.get_mut(g.cloud as usize) else { return };
        if !c.on {
            return;
        }
        c.on = false;
        c.fade_step = if g.release > 0 { c.fade / g.release as f32 } else { 0.0 };
    }

    /// Sample `sample` is being freed or replaced: every cloud over it stops reading it now, for its memory may be
    /// gone before the next block.
    pub fn release_sample(&mut self, sample: u32) {
        for c in &mut self.clouds {
            for g in c.grains.iter_mut().filter(|g| g.live && g.sample == sample) {
                g.live = false;
                c.live -= 1;
                c.orphans -= g.orphan as u32;
            }
            if c.sample == sample {
                c.on = false;
                c.data = core::ptr::null();
            }
        }
    }

    /// Adds every cloud's block into its bus and sends. After the buses are cleared, before the voices render.
    pub fn run(&mut self, _samples: &SampleTable, buses: &mut Buses, _now: u64, frames: usize) {
        let frames = frames.min(MAX_BLOCK);
        if frames == 0 {
            return;
        }
        let [l, r, ol, or] = &mut self.scratch;
        for c in self.clouds.iter_mut().filter(|c| c.on || c.live > 0) {
            c.run(self.sample_rate, frames, buses, l, r, ol, or);
        }
    }

    /// Grains sounding in cloud `cloud`: for tests.
    pub fn sounding(&self, cloud: usize) -> usize {
        self.clouds.get(cloud).map_or(0, |c| c.live as usize)
    }
}
