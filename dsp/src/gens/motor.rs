//! The pulse motor: a band-limited pulse train from a rhythm to a pitch, through two body resonances.
//!
//! One pulse a step: high for `duty` of each period, low for the rest, both edges smoothed by a polyBLEP so a
//! pitch high up keeps its aliases down. The phase only ever accumulates, so `rate` can sweep from half a step a
//! second (a slow tick) to 2,000 (a whine) with no seam between: the same pulses, closer together. The pulses
//! leave through a DC blocker (20 Hz) and excite two band-pass resonances, the body, which ring on each edge at a
//! low rate and colour the harmonics at a high one; the dry pulses are mixed in under them. `load` takes every
//! other pulse down (a sub-harmonic growl an octave under) and jitters each period and pulse height.
//!
//! Rate changes glide: a set travels over its slew or 20 ms, whichever is longer (the first set lands at once),
//! along a line in the logarithm, sample by sample.
//!
//! Parameters (`ops::gen_param::motor`), defaults and ranges:
//! - `rate` 60 steps a second, 0.5 to 2,000;
//! - `duty` 0.3, 0.02 to 0.98 (held at least a sample and a half from either edge at a high rate);
//! - `body1` 220 Hz with `body1Q` 3; `body2` 1,400 Hz with `body2Q` 6; 20 Hz to 20 kHz (under 0.45 of the sample
//!   rate), Q 0.3 to 30;
//! - `load` 0, 0 to 1;
//! - `level` 0.5 linear, 0 to 4.

use super::{Param, Rng, poly_blep};
use crate::fx::svf::Stage;
use crate::math::{PI, TAU, ms_to_frames};
use crate::ops::gen_param::motor as p;

/// How the dry pulses and the two bodies are mixed.
const DRY: f32 = 0.5;
const BODY1: f32 = 0.7;
const BODY2: f32 = 0.5;
/// The shortest glide of a rate change, in ms.
const GLIDE_MS: f32 = 20.0;

pub struct Motor {
    sample_rate: f32,
    glide: u32,
    rate: Param,
    duty: Param,
    body1: Param,
    q1: Param,
    body2: Param,
    q2: Param,
    load: Param,
    level: Param,
    /// Where the pulse is in its period, 0..1.
    phase: f32,
    /// This pulse's height and period factor, and the next one's (its rising edge is smoothed before it begins).
    amp: f32,
    jit: f32,
    next_amp: f32,
    next_jit: f32,
    odd: bool,
    rng: Rng,
    dc_x: f32,
    dc_y: f32,
    dc_r: f32,
    st1: Stage,
    st2: Stage,
}

impl Motor {
    pub fn new(sample_rate: f32) -> Self {
        let top = 20000f32.min(0.45 * sample_rate);
        Motor {
            sample_rate,
            glide: ms_to_frames(GLIDE_MS, sample_rate),
            rate: Param::new(60.0, 0.5, 2000.0, true),
            duty: Param::new(0.3, 0.02, 0.98, false),
            body1: Param::new(220.0, 20.0, top, true),
            q1: Param::new(3.0, 0.3, 30.0, false),
            body2: Param::new(1400.0, 20.0, top, true),
            q2: Param::new(6.0, 0.3, 30.0, false),
            load: Param::new(0.0, 0.0, 1.0, false),
            level: Param::new(0.5, 0.0, 4.0, false),
            phase: 0.0,
            amp: 1.0,
            jit: 1.0,
            next_amp: 1.0,
            next_jit: 1.0,
            odd: false,
            rng: Rng::new(1),
            dc_x: 0.0,
            dc_y: 0.0,
            dc_r: (-TAU * 20.0 / sample_rate).exp(),
            st1: Stage::default(),
            st2: Stage::default(),
        }
    }

    /// Back to the defaults, at rest, with a fresh seed.
    pub fn reset(&mut self, seed: u32) {
        *self = Motor { rng: Rng::new(seed), ..Motor::new(self.sample_rate) };
    }

    pub fn set(&mut self, param: u32, value: f32, slew: u32) {
        match param {
            p::RATE => self.rate.set(value, slew.max(self.glide)),
            p::DUTY => self.duty.set(value, slew),
            p::BODY1 => self.body1.set(value, slew),
            p::BODY1_Q => self.q1.set(value, slew),
            p::BODY2 => self.body2.set(value, slew),
            p::BODY2_Q => self.q2.set(value, slew),
            p::LOAD => self.load.set(value, slew),
            p::LEVEL => self.level.set(value, slew),
            _ => {}
        }
    }

    /// Draws the next pulse's height and period factor from the load.
    fn draw(&mut self) {
        let load = self.load.value();
        self.odd = !self.odd;
        if load <= 0.0 {
            self.next_amp = 1.0;
            self.next_jit = 1.0;
            return;
        }
        let sub = if self.odd { 0.5 * load } else { 0.0 };
        self.next_amp = 1.0 - sub - 0.25 * load * self.rng.unit();
        self.next_jit = 1.0 + 0.03 * load * self.rng.bipolar();
    }

    /// Writes the block, mono, over `out`. Always sounding.
    pub fn render(&mut self, out: &mut [f32]) -> bool {
        let n = out.len() as u32;
        let fs = self.sample_rate;
        let (r0, r1) = self.rate.step(n);
        let (_, duty) = self.duty.step(n);
        let (lv0, lv1) = self.level.step(n);
        self.load.step(n);
        let coef = |f: f32, q: f32| ((PI * f / fs).tan(), 1.0 / q);
        let (g1, k1) = {
            let (_, f) = self.body1.step(n);
            let (_, q) = self.q1.step(n);
            coef(f, q)
        };
        let (g2, k2) = {
            let (_, f) = self.body2.step(n);
            let (_, q) = self.q2.step(n);
            coef(f, q)
        };
        // The rate moves geometrically across the block, a sample at a time.
        let mut rate = r0;
        let ratio = if r0 == r1 { 1.0 } else { (r1 / r0).powf(1.0 / n as f32) };
        let lv_step = (lv1 - lv0) / n as f32;
        let mut level = lv0;
        for s in out.iter_mut() {
            rate *= ratio;
            level += lv_step;
            let dt = (rate * self.jit / fs).min(0.5);
            self.phase += dt;
            if self.phase >= 1.0 {
                self.phase -= 1.0;
                self.amp = self.next_amp;
                self.jit = self.next_jit;
                self.draw();
            }
            let edge = dt * 1.5;
            let d = duty.clamp(0.02f32.max(edge), 0.98f32.min(1.0 - edge));
            let t = self.phase;
            let mut v = if t < d { self.amp } else { 0.0 };
            // The rising edge at phase 0: before it the next pulse's height, after it this one's.
            if t < dt {
                v += 0.5 * self.amp * poly_blep(t, dt);
            } else if t > 1.0 - dt {
                v += 0.5 * self.next_amp * poly_blep(t, dt);
            }
            // The falling edge at the duty.
            let mut tf = t - d;
            if tf < 0.0 {
                tf += 1.0;
            }
            v -= 0.5 * self.amp * poly_blep(tf, dt);
            // DC out, then the bodies.
            let y = v - self.dc_x + self.dc_r * self.dc_y;
            self.dc_x = v;
            self.dc_y = y;
            let b1 = self.st1.tick(y, g1, k1).1 * k1;
            let b2 = self.st2.tick(y, g2, k2).1 * k2;
            *s = level * (DRY * y + BODY1 * b1 + BODY2 * b2);
        }
        self.st1.flush();
        self.st2.flush();
        if self.dc_y.abs() < 1e-20 {
            self.dc_y = 0.0;
        }
        true
    }
}
