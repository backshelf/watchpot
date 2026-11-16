//! Shaped noise: white or pink through a band, tilted, gated in bursts.
//!
//! The source is seeded white noise crossfaded with a pink one (Paul Kellet's three-pole filter on the same white)
//! by `color`. It passes a band, a 24 dB high-pass at `centre - width / 2` and a 24 dB low-pass at
//! `centre + width / 2` (held to 20 Hz and 0.45 of the sample rate), then a first-order tilt about 1 kHz, and a
//! gate that opens for `duty` of each of `grid` bursts a second (0: always open), its edges smoothed over 1.5 ms.
//!
//! Parameters (`ops::gen_param::noise`), defaults and ranges:
//! - `color` 1 (pink), 0 white to 1 pink;
//! - `centre` 1,500 Hz, 20 Hz to 20 kHz; `width` 2,500 Hz, 10 Hz to 40 kHz;
//! - `grid` 0 bursts a second, 0 to 60; `duty` 0.5, 0 to 1;
//! - `tilt` 0 dB an octave, -6 to 6 (a shelf pair: the slope holds over the three octaves either side of 1 kHz
//!   and levels off past them);
//! - `level` 0.3 linear, 0 to 4.

use super::{Param, Rng};
use crate::fx::svf::Stage;
use crate::math::{PI, TAU, db_to_gain, one_pole};
use crate::ops::gen_param::noise as p;

/// Kellet's pink filter, brought to about the white source's loudness.
const PINK_GAIN: f32 = 0.25;
/// The tilt's pivot, and how many octaves of slope each shelf stands for.
const PIVOT_HZ: f32 = 1000.0;
const TILT_OCTAVES: f32 = 3.0;
const GATE_S: f32 = 0.0015;

pub struct Noise {
    sample_rate: f32,
    color: Param,
    centre: Param,
    width: Param,
    grid: Param,
    duty: Param,
    tilt: Param,
    level: Param,
    rng: Rng,
    pink: [f32; 3],
    hp: [Stage; 2],
    lp: [Stage; 2],
    tilt_lp: f32,
    tilt_c: f32,
    gate_phase: f32,
    gate: f32,
    gate_c: f32,
}

impl Noise {
    pub fn new(sample_rate: f32) -> Self {
        Noise {
            sample_rate,
            color: Param::new(1.0, 0.0, 1.0, false),
            centre: Param::new(1500.0, 20.0, 20000.0, true),
            width: Param::new(2500.0, 10.0, 40000.0, true),
            grid: Param::new(0.0, 0.0, 60.0, false),
            duty: Param::new(0.5, 0.0, 1.0, false),
            tilt: Param::new(0.0, -6.0, 6.0, false),
            level: Param::new(0.3, 0.0, 4.0, false),
            rng: Rng::new(1),
            pink: [0.0; 3],
            hp: [Stage::default(); 2],
            lp: [Stage::default(); 2],
            tilt_lp: 0.0,
            tilt_c: 1.0 - (-TAU * PIVOT_HZ / sample_rate).exp(),
            gate_phase: 0.0,
            gate: 1.0,
            gate_c: one_pole(GATE_S, sample_rate),
        }
    }

    /// Back to the defaults, at rest, with a fresh seed.
    pub fn reset(&mut self, seed: u32) {
        *self = Noise { rng: Rng::new(seed), ..Noise::new(self.sample_rate) };
    }

    pub fn set(&mut self, param: u32, value: f32, slew: u32) {
        match param {
            p::COLOR => self.color.set(value, slew),
            p::CENTRE => self.centre.set(value, slew),
            p::WIDTH => self.width.set(value, slew),
            p::GRID => self.grid.set(value, slew),
            p::DUTY => self.duty.set(value, slew),
            p::TILT => self.tilt.set(value, slew),
            p::LEVEL => self.level.set(value, slew),
            _ => {}
        }
    }

    /// Writes the block, mono, over `out`. Always sounding.
    pub fn render(&mut self, out: &mut [f32]) -> bool {
        let n = out.len() as u32;
        let fs = self.sample_rate;
        let (_, color) = self.color.step(n);
        let (_, centre) = self.centre.step(n);
        let (_, width) = self.width.step(n);
        let (_, grid) = self.grid.step(n);
        let (_, duty) = self.duty.step(n);
        let (_, tilt) = self.tilt.step(n);
        let (lv0, lv1) = self.level.step(n);
        let top = 0.45 * fs;
        let lo = (centre - 0.5 * width).clamp(20.0, top);
        let hi = (centre + 0.5 * width).clamp(lo, top);
        let g_hp = (PI * lo / fs).tan();
        let g_lp = (PI * hi / fs).tan();
        // Butterworth fourth order: two stages a side.
        let k = [1.0 / 0.541_196_1, 1.0 / 1.306_563];
        let shelf = tilt * TILT_OCTAVES;
        let (gl, gh) = (db_to_gain(-shelf), db_to_gain(shelf));
        let inc = grid / fs;
        let lv_step = (lv1 - lv0) / n as f32;
        let mut level = lv0;
        for s in out.iter_mut() {
            level += lv_step;
            let w = self.rng.bipolar();
            let [b0, b1, b2] = &mut self.pink;
            *b0 = 0.99765 * *b0 + w * 0.099_046;
            *b1 = 0.963 * *b1 + w * 0.296_516_4;
            *b2 = 0.57 * *b2 + w * 1.052_691_3;
            let pink = (*b0 + *b1 + *b2 + w * 0.1848) * PINK_GAIN;
            let mut x = w + (pink - w) * color;
            for (st, k) in self.hp.iter_mut().zip(k) {
                x = st.tick(x, g_hp, k).2;
            }
            for (st, k) in self.lp.iter_mut().zip(k) {
                x = st.tick(x, g_lp, k).0;
            }
            self.tilt_lp += self.tilt_c * (x - self.tilt_lp);
            x = self.tilt_lp * gl + (x - self.tilt_lp) * gh;
            let target = if grid <= 0.0 {
                1.0
            } else {
                self.gate_phase += inc;
                if self.gate_phase >= 1.0 {
                    self.gate_phase -= 1.0;
                }
                if self.gate_phase < duty { 1.0 } else { 0.0 }
            };
            self.gate += self.gate_c * (target - self.gate);
            *s = x * self.gate * level;
        }
        for st in self.hp.iter_mut().chain(self.lp.iter_mut()) {
            st.flush();
        }
        true
    }
}
