//! The tape: one line written at the engine's rate and read by a head that moves at `speed`, wobbled by wow and
//! flutter, through a head bump and a high roll-off that follow the speed, with hiss on top.
//!
//! - Speed (0..2) varispeeds the bus: the read head moves `speed` frames a frame, so pitch follows it, and level
//!   falls with it below 1. The head's own speed travels to the parameter at most a whole unit in 30 ms, so a set
//!   to 0 stops the tape (pitch and level falling together) and is silent within 30 ms; the head then holds its
//!   place in the line, and a set back to 1 runs it up again from there, without a click. Slew the parameter for a
//!   slower stop.
//! - The head can only run ahead of 1 on what it has fallen behind. When it closes on the write head, or falls
//!   more than the line holds behind it, it splices: a second head starts 40 ms further back (or at the normal
//!   distance) and the two crossfade over 10 ms, as a rotating-head pitch shifter does.
//! - Wow (0.3 to 2 Hz) moves the head by up to 2.5 ms at 1, flutter (6 to 12 Hz) by up to 0.15 ms at 1.
//! - The head bump is a +3 dB peak at 60 Hz times speed, the roll-off a 12 dB low-pass at 14 kHz times speed.
//! - Hiss: filtered white noise, -40 dBFS RMS at 1, scaled by the tape's level (a stopped tape is silent).
//! - The line runs 17 ms behind the input at speed 1: room for the wobble and a splice.
//!
//! Defaults (before any `FX_SET`): wow 0.15 at 0.8 Hz, flutter 0.1 at 9 Hz, speed 1, hiss 0.05.
//!
//! Ranges: wow and flutter 0..1; wow rate 0.3 to 2 Hz; flutter rate 6 to 12 Hz; speed 0..2; hiss 0..1.

use super::Fx;
use super::svf::Stage;
use crate::math::{PI, TAU, hermite};
use crate::ops::MAX_BLOCK;
use crate::ops::fx_param::tape;

/// The most wow and flutter, seconds of head movement.
const WOW_DEPTH: f32 = 0.0025;
const FLUTTER_DEPTH: f32 = 0.00015;
/// How far back a splice jumps, and how long its crossfade runs (seconds).
const SPLICE: f32 = 0.04;
const SPLICE_FADE: f32 = 0.01;
/// The fastest the head's speed changes: a whole unit in this many seconds.
const SPEED_RAMP: f32 = 0.03;
/// The line's length, seconds: how long a stopped tape holds its place.
const LINE_SECONDS: f32 = 5.0;
/// The head bump at speed 1: its frequency, its gain (+3 dB) and its damping (one over a Q of 1).
const BUMP_HZ: f32 = 60.0;
const BUMP_GAIN: f32 = 1.412_537_5;
const BUMP_K: f32 = 1.0;
/// The roll-off at speed 1.
const ROLL_HZ: f32 = 14000.0;
/// Hiss at 1, RMS.
const HISS_LEVEL: f32 = 0.01;
/// One over the RMS of the filtered noise source (uniform white through a one-pole at 0.3).
const HISS_NORM: f32 = 4.12;

pub struct Tape {
    sample_rate: f32,
    lines: [Vec<f32>; 2],
    mask: usize,
    write: usize,
    /// How far behind the write head each read head is, frames (fractional).
    lag: f64,
    lag_next: f64,
    /// 0..1 through a splice; 0 when none runs.
    fade: f32,
    /// The splice running is the head going home (a straight crossfade), not a jump between unrelated moments.
    homing: bool,
    fade_step: f32,
    /// The closest a head may come to the write head, the normal distance, and the farthest it may fall (frames).
    lag_min: f64,
    lag_home: f64,
    lag_max: f64,
    splice: f64,
    wow: f32,
    flutter: f32,
    wow_rate: f32,
    flutter_rate: f32,
    wow_phase: f32,
    flutter_phase: f32,
    speed: f32,
    speed_now: f32,
    /// True until the first block: a setting lands at once rather than gliding from the default.
    fresh: bool,
    speed_step: f32,
    hiss: f32,
    /// The tone filters' prewarped frequencies (bump, roll-off) at the end of the last block, and their stages
    /// by channel. Trapezoidal stages, so the frequencies glide across each block without a transient.
    tone_g: [f32; 2],
    tone: [[Stage; 2]; 2],
    noise: u32,
    hiss_lp: [f32; 2],
    /// The level of each frame of the block, by the head's speed.
    level: [f32; MAX_BLOCK],
}

impl Tape {
    pub fn new(sample_rate: f32) -> Self {
        let frames = (LINE_SECONDS * sample_rate) as usize;
        let size = frames.next_power_of_two();
        let sr = sample_rate as f64;
        let wobble = (WOW_DEPTH + FLUTTER_DEPTH) as f64 * sr + 4.0;
        let splice = SPLICE as f64 * sr;
        let fade = SPLICE_FADE as f64 * sr;
        // A splice running at speed 2 eats `fade` frames of lag while it fades.
        let lag_min = (wobble + fade + 2.0).ceil();
        let lag_home = lag_min + (0.001 * sr).round();
        let mut t = Tape {
            sample_rate,
            lines: [vec![0.0; size], vec![0.0; size]],
            mask: size - 1,
            write: 0,
            lag: lag_home,
            lag_next: lag_home,
            fade: 0.0,
            homing: false,
            fade_step: 1.0 / fade.max(1.0) as f32,
            lag_min,
            lag_home,
            lag_max: size as f64 - wobble - splice - fade - 8.0,
            splice,
            wow: 0.15,
            flutter: 0.1,
            wow_rate: 0.8,
            flutter_rate: 9.0,
            wow_phase: 0.0,
            flutter_phase: 0.25,
            speed: 1.0,
            speed_now: 1.0,
            fresh: true,
            speed_step: 1.0 / (SPEED_RAMP * sample_rate),
            hiss: 0.05,
            tone_g: [0.0; 2],
            tone: [[Stage::default(); 2]; 2],
            noise: 0x9e37_79b9,
            hiss_lp: [0.0; 2],
            level: [0.0; MAX_BLOCK],
        };
        t.tone_g = t.tone_at(1.0);
        t
    }

    /// The head bump's and the roll-off's prewarped frequencies at head speed `speed`.
    fn tone_at(&self, speed: f32) -> [f32; 2] {
        let s = speed.max(0.01);
        let g = |hz: f32| (PI * hz.clamp(20.0, 0.45 * self.sample_rate) / self.sample_rate).tan();
        [g(BUMP_HZ * s), g(ROLL_HZ * s)]
    }

    #[inline]
    fn read(&self, ch: usize, back: f64) -> f32 {
        let line = &self.lines[ch];
        let pos = self.write as f64 - back;
        let base = pos.floor();
        let t = (pos - base) as f32;
        let i = base as i64 as usize;
        let m = self.mask;
        hermite(line[i.wrapping_sub(1) & m], line[i & m], line[i.wrapping_add(1) & m], line[i.wrapping_add(2) & m], t)
    }

    /// A white sample in -1..1.
    #[inline]
    fn white(&mut self) -> f32 {
        let mut x = self.noise;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.noise = x;
        (x as i32) as f32 * (1.0 / 2_147_483_648.0)
    }
}

impl Fx for Tape {
    fn set(&mut self, param: u16, value: f32) {
        match param {
            tape::WOW => self.wow = value.clamp(0.0, 1.0),
            tape::WOW_RATE => self.wow_rate = value.clamp(0.3, 2.0),
            tape::FLUTTER => self.flutter = value.clamp(0.0, 1.0),
            tape::FLUTTER_RATE => self.flutter_rate = value.clamp(6.0, 12.0),
            tape::SPEED => {
                self.speed = value.clamp(0.0, 2.0);
                if self.fresh {
                    self.speed_now = self.speed;
                    self.tone_g = self.tone_at(self.speed);
                }
            }
            tape::HISS => self.hiss = value.clamp(0.0, 1.0),
            _ => {}
        }
    }

    fn process(&mut self, l: &mut [f32], r: &mut [f32], key: Option<(&[f32], &[f32])>) {
        let n = l.len().min(r.len());
        if n > MAX_BLOCK {
            for (bl, br) in l[..n].chunks_mut(MAX_BLOCK).zip(r[..n].chunks_mut(MAX_BLOCK)) {
                self.process(bl, br, key);
            }
            return;
        }
        self.fresh = false;
        let (l, r) = (&mut l[..n], &mut r[..n]);
        let sr = self.sample_rate;
        let wow_inc = self.wow_rate / sr;
        let flutter_inc = self.flutter_rate / sr;
        let wow_amp = self.wow * WOW_DEPTH * sr;
        let flutter_amp = self.flutter * FLUTTER_DEPTH * sr;
        for i in 0..n {
            // The head's speed, and where that leaves it.
            let ds = (self.speed - self.speed_now).clamp(-self.speed_step, self.speed_step);
            self.speed_now += ds;
            self.level[i] = self.speed_now.min(1.0);
            let drift = 1.0 - self.speed_now as f64;
            self.lag += drift;
            self.lag_next += drift;
            if self.fade == 0.0 {
                if self.lag < self.lag_min {
                    self.lag_next = self.lag + self.splice;
                    self.fade = self.fade_step;
                } else if self.lag > self.lag_max {
                    self.lag_next = self.lag_home;
                    self.fade = self.fade_step;
                } else if self.speed == 1.0 && self.speed_now == 1.0 && self.lag > self.lag_home + 1.0 {
                    // Back at speed with ground lost while it ran slow: splice home, or the bus stays late for good.
                    // The two heads read the same sound a moment apart, so this one fades straight across.
                    self.lag_next = self.lag_home;
                    self.fade = self.fade_step;
                    self.homing = true;
                }
            }

            self.wow_phase += wow_inc;
            self.wow_phase -= self.wow_phase.floor();
            self.flutter_phase += flutter_inc;
            self.flutter_phase -= self.flutter_phase.floor();
            let wobble = (wow_amp * (1.0 + (TAU * self.wow_phase).sin()) + flutter_amp * (1.0 + (TAU * self.flutter_phase).sin())) as f64;

            // Write first: the head may sit as close as `lag_min` frames behind.
            let w = self.write;
            self.lines[0][w] = l[i];
            self.lines[1][w] = r[i];
            self.write = (w + 1) & self.mask;

            let (mut ol, mut or) = (self.read(0, self.lag + wobble), self.read(1, self.lag + wobble));
            if self.fade > 0.0 {
                let (nl, nr) = (self.read(0, self.lag_next + wobble), self.read(1, self.lag_next + wobble));
                // Equal-power where the heads read unrelated moments; a straight line when the head is only going home.
                let (a, b) = if self.homing {
                    (1.0 - self.fade, self.fade)
                } else {
                    ((self.fade * core::f32::consts::FRAC_PI_2).cos(), (self.fade * core::f32::consts::FRAC_PI_2).sin())
                };
                ol = a * ol + b * nl;
                or = a * or + b * nr;
                self.fade += self.fade_step;
                if self.fade >= 1.0 {
                    self.fade = 0.0;
                    self.homing = false;
                    self.lag = self.lag_next;
                }
            }
            l[i] = ol;
            r[i] = or;
        }
        // The tone follows the head; the level comes after it, so a stopped tape's filters cannot ring on.
        let from = self.tone_g;
        let to = self.tone_at(self.speed_now);
        let inv = 1.0 / n as f32;
        for (ch, buf) in [&mut *l, &mut *r].into_iter().enumerate() {
            let [bump, roll] = &mut self.tone[ch];
            for (i, x) in buf.iter_mut().enumerate() {
                let t = (i + 1) as f32 * inv;
                let gb = from[0] + (to[0] - from[0]) * t;
                let gr = from[1] + (to[1] - from[1]) * t;
                let (_, band, _) = bump.tick(*x, gb, BUMP_K);
                let y = *x + (BUMP_GAIN - 1.0) * BUMP_K * band;
                *x = roll.tick(y, gr, core::f32::consts::SQRT_2).0;
            }
            bump.flush();
            roll.flush();
        }
        self.tone_g = to;
        let hiss = self.hiss * HISS_LEVEL * HISS_NORM;
        for i in 0..n {
            let (hl, hr) = (self.white(), self.white());
            // A gentle tilt down on the noise: tape hiss is brighter than pink but not white.
            self.hiss_lp[0] += 0.3 * (hl - self.hiss_lp[0]);
            self.hiss_lp[1] += 0.3 * (hr - self.hiss_lp[1]);
            let level = self.level[i];
            l[i] = level * (l[i] + hiss * self.hiss_lp[0]);
            r[i] = level * (r[i] + hiss * self.hiss_lp[1]);
        }
    }

    fn reset(&mut self) {
        for line in &mut self.lines {
            line.fill(0.0);
        }
        self.tone = [[Stage::default(); 2]; 2];
        self.hiss_lp = [0.0; 2];
        self.fade = 0.0;
        self.lag = self.lag_home;
        self.lag_next = self.lag_home;
    }
}
