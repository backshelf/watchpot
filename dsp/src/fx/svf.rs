//! The state-variable filter: a topology-preserving (trapezoidal) SVF, low, high, band or notch, one stage
//! (12 dB an octave) or two (24 dB). The trapezoidal form stays stable however fast its cutoff moves, so the
//! coefficients glide linearly across each block from where they were to where the parameters put them: a cutoff
//! swept a block at a time never zips.
//!
//! Defaults (before any `FX_SET`): low-pass, cutoff 20 kHz (held under 0.45 of the sample rate), Q 0.707,
//! 12 dB an octave. That is a filter wide open: what a game sweeps down from.
//!
//! Ranges: cutoff 20 Hz to 20 kHz; Q 0.1 to 40; `mode` 0 low, 1 high, 2 band (unity at the centre), 3 notch;
//! `slope` 0 is 12 dB, 1 is 24. At 24 dB the two stages take Butterworth's Qs scaled by Q, so Q 0.707 is flat to
//! the cutoff and -3 dB there at either slope.

use super::Fx;
use crate::math::PI;
use crate::ops::fx_param::svf;

/// Butterworth's fourth-order stage Qs, over Butterworth's second-order Q.
const STAGE_Q: [f32; 2] = [0.541_196_1 / core::f32::consts::FRAC_1_SQRT_2, 1.306_563 / core::f32::consts::FRAC_1_SQRT_2];

#[derive(Clone, Copy, Default)]
struct Coef {
    g: f32,
    k: f32,
}

#[derive(Clone, Copy, Default)]
pub(crate) struct Stage {
    ic1: f32,
    ic2: f32,
}

impl Stage {
    /// One sample through the stage: returns (low, band, high).
    #[inline]
    pub(crate) fn tick(&mut self, x: f32, g: f32, k: f32) -> (f32, f32, f32) {
        let a1 = 1.0 / (1.0 + g * (g + k));
        let a2 = g * a1;
        let a3 = g * a2;
        let v3 = x - self.ic2;
        let v1 = a1 * self.ic1 + a2 * v3;
        let v2 = self.ic2 + a2 * self.ic1 + a3 * v3;
        self.ic1 = 2.0 * v1 - self.ic1;
        self.ic2 = 2.0 * v2 - self.ic2;
        (v2, v1, x - k * v1 - v2)
    }

    pub(crate) fn flush(&mut self) {
        if self.ic1.abs() < 1e-20 {
            self.ic1 = 0.0;
        }
        if self.ic2.abs() < 1e-20 {
            self.ic2 = 0.0;
        }
    }
}

pub struct Svf {
    sample_rate: f32,
    cutoff: f32,
    q: f32,
    mode: u8,
    slope24: bool,
    /// Per stage: where the coefficients are now, and where this block takes them.
    now: [Coef; 2],
    next: [Coef; 2],
    /// [channel][stage]
    stages: [[Stage; 2]; 2],
}

impl Svf {
    pub fn new(sample_rate: f32) -> Self {
        let mut f = Svf {
            sample_rate,
            cutoff: 20000.0,
            q: core::f32::consts::FRAC_1_SQRT_2,
            mode: 0,
            slope24: false,
            now: [Coef::default(); 2],
            next: [Coef::default(); 2],
            stages: [[Stage::default(); 2]; 2],
        };
        f.design();
        f.now = f.next;
        f
    }

    fn design(&mut self) {
        let fc = self.cutoff.clamp(20.0, 20000.0).min(0.45 * self.sample_rate);
        let g = (PI * fc / self.sample_rate).tan();
        let q = self.q.clamp(0.1, 40.0);
        for (i, c) in self.next.iter_mut().enumerate() {
            let stage_q = if self.slope24 { (q * STAGE_Q[i]).min(40.0) } else { q };
            *c = Coef { g, k: 1.0 / stage_q };
        }
    }
}

impl Fx for Svf {
    fn set(&mut self, param: u16, value: f32) {
        match param {
            svf::CUTOFF => self.cutoff = value,
            svf::Q => self.q = value,
            svf::MODE => self.mode = value.round().clamp(0.0, 3.0) as u8,
            svf::SLOPE => {
                let on = value >= 0.5;
                if on && !self.slope24 {
                    // The second stage starts from rest, not from whatever it held when last in use.
                    self.stages[0][1] = Stage::default();
                    self.stages[1][1] = Stage::default();
                }
                self.slope24 = on;
            }
            _ => return,
        }
        self.design();
    }

    fn process(&mut self, l: &mut [f32], r: &mut [f32], _key: Option<(&[f32], &[f32])>) {
        let n = l.len().min(r.len());
        if n == 0 {
            return;
        }
        let stages = if self.slope24 { 2 } else { 1 };
        let mode = self.mode;
        let inv = 1.0 / n as f32;
        let from = self.now;
        let to = self.next;
        for (ch, buf) in [&mut *l, &mut *r].into_iter().enumerate() {
            for (i, s) in buf[..n].iter_mut().enumerate() {
                let t = (i + 1) as f32 * inv;
                let mut x = *s;
                for st in 0..stages {
                    let g = from[st].g + (to[st].g - from[st].g) * t;
                    let k = from[st].k + (to[st].k - from[st].k) * t;
                    let (low, band, high) = self.stages[ch][st].tick(x, g, k);
                    x = match mode {
                        0 => low,
                        1 => high,
                        2 => band * k,
                        _ => x - k * band,
                    };
                }
                *s = x;
            }
            for st in &mut self.stages[ch] {
                st.flush();
            }
        }
        self.now = self.next;
    }

    fn reset(&mut self) {
        self.stages = [[Stage::default(); 2]; 2];
        self.now = self.next;
    }
}
