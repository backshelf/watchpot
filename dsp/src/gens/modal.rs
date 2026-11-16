//! The modal bank: up to 12 two-pole resonators, struck.
//!
//! Each mode is a decaying rotation (a complex one-pole: the coupled form, which stays stable and clean while its
//! frequency moves) whose impulse response is `gain · r^n · sin(n·w)`: a sine at `freq` Hz falling 60 dB over
//! `decay` seconds. `strike` excites every mode at once: a positive value is a single impulse of that height (a
//! hard hit), a negative one a 5 ms burst of noise of about that loudness (a scrape, a rub, a soft hit). Every set
//! of `strike` strikes; it never slews and is not a level. `damp` divides every decay (2 rings half as long) and
//! `size` divides every frequency (2 is a body twice as big, an octave down); a mode pushed above 0.45 of the
//! sample rate falls silent. A bank that has rung out costs nothing until it is struck again.
//!
//! A bank starts as a free-free bar at 440 Hz (modes at 1, 2.756, 5.404 and 8.933 times it, decays 1.5 s to
//! 0.35 s). The first set of any mode's parameter replaces that preset with the modes that are set: the rest are
//! silent until set (a mode with no gain set has gain 0).
//!
//! Parameters (`ops::gen_param::modal`), defaults and ranges:
//! - `strike` -1 to 1 (a moment);
//! - `damp` 1, 0.05 to 20; `size` 1, 0.1 to 10;
//! - `level` 0.5 linear, 0 to 4;
//! - mode `i` (0 to 11) from `mode + 3 * i`: frequency 20 Hz to 20 kHz, decay 5 ms to 30 s, gain -4 to 4.

use super::{Param, Rng};
use crate::math::{TAU, ms_to_frames};
use crate::ops::gen_param::modal as p;

pub const MODES: usize = 12;
/// -60 dB, as a natural logarithm.
const LN_1000: f32 = 6.907_755;
const BURST_MS: f32 = 5.0;
/// Below this the bank has rung out.
const QUIET: f32 = 1e-6;

/// The bar a bank starts as: (frequency, decay, gain).
const PRESET: [(f32, f32, f32); 4] =
    [(440.0, 1.5, 1.0), (1212.64, 0.9, 0.6), (2377.76, 0.55, 0.4), (3930.52, 0.35, 0.25)];

#[derive(Clone, Copy)]
struct Mode {
    freq: Param,
    decay: Param,
    gain: Param,
    re: f32,
    im: f32,
    /// r·cos(w), r·sin(w), and the gain (0 for a mode above the band).
    rc: f32,
    rs: f32,
    g: f32,
}

impl Mode {
    const fn new() -> Self {
        Mode {
            freq: Param::new(440.0, 20.0, 20000.0, true),
            decay: Param::new(1.0, 0.005, 30.0, true),
            gain: Param::new(0.0, -4.0, 4.0, false),
            re: 0.0,
            im: 0.0,
            rc: 0.0,
            rs: 0.0,
            g: 0.0,
        }
    }
}

pub struct Modal {
    sample_rate: f32,
    modes: [Mode; MODES],
    damp: Param,
    size: Param,
    level: Param,
    /// The first mode set clears the preset.
    custom: bool,
    /// The coefficients need working out again.
    dirty: bool,
    /// Rung out: nothing to render until a strike.
    quiet: bool,
    impulse: f32,
    burst_left: u32,
    burst_amp: f32,
    burst_len: u32,
    rng: Rng,
    /// The modes that sound this block.
    live: [u8; MODES],
    live_len: usize,
}

impl Modal {
    pub fn new(sample_rate: f32) -> Self {
        let mut modes = [Mode::new(); MODES];
        for (m, &(f, d, g)) in modes.iter_mut().zip(PRESET.iter()) {
            m.freq.reset(f);
            m.decay.reset(d);
            m.gain.reset(g);
        }
        let burst_len = ms_to_frames(BURST_MS, sample_rate);
        Modal {
            sample_rate,
            modes,
            damp: Param::new(1.0, 0.05, 20.0, true),
            size: Param::new(1.0, 0.1, 10.0, true),
            level: Param::new(0.5, 0.0, 4.0, false),
            custom: false,
            dirty: true,
            quiet: true,
            impulse: 0.0,
            burst_left: 0,
            burst_amp: 0.0,
            burst_len,
            rng: Rng::new(1),
            live: [0; MODES],
            live_len: 0,
        }
    }

    /// Back to the preset, at rest, with a fresh seed.
    pub fn reset(&mut self, seed: u32) {
        *self = Modal { rng: Rng::new(seed), ..Modal::new(self.sample_rate) };
    }

    /// The longest decay any sounding mode has now, seconds (after `damp`).
    pub fn longest_decay(&self) -> f32 {
        let damp = self.damp.value();
        self.modes.iter().filter(|m| m.gain.value() != 0.0).map(|m| m.decay.value() / damp).fold(0.0, f32::max)
    }

    pub fn set(&mut self, param: u32, value: f32, slew: u32) {
        match param {
            p::STRIKE => self.strike(value),
            p::DAMP => self.damp.set(value, slew),
            p::SIZE => self.size.set(value, slew),
            p::LEVEL => self.level.set(value, slew),
            _ => {
                let Some(at) = param.checked_sub(p::MODE) else { return };
                let i = (at / 3) as usize;
                if i >= MODES || !value.is_finite() {
                    return;
                }
                if !self.custom {
                    self.custom = true;
                    for m in &mut self.modes {
                        m.gain.reset(0.0);
                    }
                }
                let m = &mut self.modes[i];
                match at % 3 {
                    0 => m.freq.set(value, slew),
                    1 => m.decay.set(value, slew),
                    _ => m.gain.set(value, slew),
                }
            }
        }
        self.dirty = true;
    }

    fn strike(&mut self, value: f32) {
        if !value.is_finite() || value == 0.0 {
            return;
        }
        let hard = value.abs().min(1.0);
        if value > 0.0 {
            self.impulse += hard;
        } else {
            // A burst's loudness grows with the root of its length; this brings it to about an impulse's.
            self.burst_amp = hard / (self.burst_len as f32).sqrt() * 2.0;
            self.burst_left = self.burst_len;
        }
        self.quiet = false;
    }

    fn design(&mut self, n: u32) {
        let (_, damp) = self.damp.step(n);
        let (_, size) = self.size.step(n);
        let fs = self.sample_rate;
        self.live_len = 0;
        for (i, m) in self.modes.iter_mut().enumerate() {
            let (_, f) = m.freq.step(n);
            let (_, d) = m.decay.step(n);
            let (_, g) = m.gain.step(n);
            let f = f / size;
            if g == 0.0 || f >= 0.45 * fs {
                m.g = 0.0;
                m.re = 0.0;
                m.im = 0.0;
                continue;
            }
            let r = (-LN_1000 / (d / damp * fs)).exp();
            let w = TAU * f / fs;
            m.rc = r * w.cos();
            m.rs = r * w.sin();
            m.g = g;
            self.live[self.live_len] = i as u8;
            self.live_len += 1;
        }
    }

    fn moving(&self) -> bool {
        self.damp.moving()
            || self.size.moving()
            || self.modes.iter().any(|m| m.freq.moving() || m.decay.moving() || m.gain.moving())
    }

    /// Writes the block, mono, over `out`; false (and `out` untouched) when the bank has rung out.
    pub fn render(&mut self, out: &mut [f32]) -> bool {
        let n = out.len() as u32;
        if self.dirty || self.moving() {
            self.design(n);
            self.dirty = self.moving();
        }
        let (lv0, lv1) = self.level.step(n);
        if self.quiet {
            return false;
        }
        let lv_step = (lv1 - lv0) / n as f32;
        let mut level = lv0;
        let live = &self.live[..self.live_len];
        for s in out.iter_mut() {
            level += lv_step;
            let mut x = self.impulse;
            self.impulse = 0.0;
            if self.burst_left > 0 {
                self.burst_left -= 1;
                x += self.burst_amp * self.rng.bipolar();
            }
            let mut y = 0.0;
            for &i in live {
                let m = &mut self.modes[i as usize];
                let re = m.rc * m.re - m.rs * m.im + x;
                let im = m.rs * m.re + m.rc * m.im;
                m.re = re;
                m.im = im;
                y += m.g * im;
            }
            *s = y * level;
        }
        let energy: f32 = live.iter().map(|&i| self.modes[i as usize].re.abs() + self.modes[i as usize].im.abs()).sum();
        if energy < QUIET && self.burst_left == 0 {
            self.quiet = true;
            for m in &mut self.modes {
                m.re = 0.0;
                m.im = 0.0;
            }
        }
        true
    }
}
