//! The crusher: sample-rate reduction (a held sample, taken `rate` times a second) and bit depth reduction (the
//! held sample rounded to `bits` bits, a fraction of a bit allowed), blended with the dry signal by `mix`.
//!
//! Defaults (before any `FX_SET`): rate 11025 Hz, bits 8, mix 1: a plainly crushed bus.
//!
//! Ranges: rate 50 Hz to the engine's sample rate (at or above it, no hold); bits 1 to 24 (at 24, no rounding);
//! mix 0..1. Mix glides over 5 ms; rate and bits step a block at a time, which is the sound of the thing.

use super::Fx;
use crate::math::one_pole;
use crate::ops::fx_param::crush;

pub struct Crush {
    sample_rate: f32,
    /// Hold samples taken per output sample (1: every one).
    step: f32,
    bits: f32,
    mix: f32,
    mix_now: f32,
    /// True until the first block: a setting lands at once rather than gliding from the default.
    fresh: bool,
    glide: f32,
    phase: f32,
    held: [f32; 2],
}

impl Crush {
    pub fn new(sample_rate: f32) -> Self {
        let mut c = Crush {
            sample_rate,
            step: 1.0,
            bits: 8.0,
            mix: 1.0,
            mix_now: 1.0,
            fresh: true,
            glide: one_pole(0.005, sample_rate),
            phase: 1.0,
            held: [0.0; 2],
        };
        c.set(crush::RATE, 11025.0);
        c
    }
}

impl Fx for Crush {
    fn set(&mut self, param: u16, value: f32) {
        match param {
            crush::RATE => self.step = (value / self.sample_rate).clamp(50.0 / self.sample_rate, 1.0),
            crush::BITS => self.bits = value.clamp(1.0, 24.0),
            crush::MIX => self.mix = value.clamp(0.0, 1.0),
            _ => {}
        }
        if self.fresh {
            self.mix_now = self.mix;
        }
    }

    fn process(&mut self, l: &mut [f32], r: &mut [f32], _key: Option<(&[f32], &[f32])>) {
        self.fresh = false;
        let n = l.len().min(r.len());
        let round = self.bits < 24.0;
        // Steps either side of zero: 2^(bits-1), so one bit leaves -1, 0 and 1.
        let levels = 2f32.powf(self.bits - 1.0);
        let inv = 1.0 / levels;
        for i in 0..n {
            self.phase += self.step;
            if self.phase >= 1.0 {
                self.phase -= self.phase.floor();
                for (h, x) in self.held.iter_mut().zip([l[i], r[i]]) {
                    *h = if round { (x * levels).round() * inv } else { x };
                }
            }
            self.mix_now += self.glide * (self.mix - self.mix_now);
            let m = self.mix_now;
            l[i] = (1.0 - m) * l[i] + m * self.held[0];
            r[i] = (1.0 - m) * r[i] + m * self.held[1];
        }
    }

    fn reset(&mut self) {
        self.held = [0.0; 2];
        self.phase = 1.0;
    }
}
