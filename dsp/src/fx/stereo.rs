//! The stereo unit: how wide a bus is, and where it sits across the field.
//!
//! `width` scales the difference between the sides about their middle: 0 is mono (both sides the mid), 1 leaves the
//! bus as it is, 2 doubles the side signal. `pan` then moves the whole bus: a balance, unity on both sides at the
//! centre, the far side falling to nothing at ±1 along a cosine while the near side stays where it was, so a centred
//! bus is untouched and a panned mono bus is a mono source at that place.
//!
//! Defaults (before any `FX_SET`): width 1, pan 0: the bus passes untouched.
//!
//! Ranges: width 0 to 2; pan -1 to 1. Both glide over 10 ms, so a move never zips.

use super::Fx;
use crate::math::{PI, one_pole};
use crate::ops::fx_param::stereo;

pub struct Stereo {
    width: f32,
    pan: f32,
    width_now: f32,
    pan_now: f32,
    glide: f32,
    /// True until the first block: a setting lands at once rather than gliding from the default.
    fresh: bool,
}

impl Stereo {
    pub fn new(sample_rate: f32) -> Self {
        Stereo { width: 1.0, pan: 0.0, width_now: 1.0, pan_now: 0.0, glide: one_pole(0.01, sample_rate), fresh: true }
    }
}

impl Fx for Stereo {
    fn set(&mut self, param: u16, value: f32) {
        if !value.is_finite() {
            return;
        }
        match param {
            stereo::WIDTH => self.width = value.clamp(0.0, 2.0),
            stereo::PAN => self.pan = value.clamp(-1.0, 1.0),
            _ => {}
        }
        if self.fresh {
            self.width_now = self.width;
            self.pan_now = self.pan;
        }
    }

    fn process(&mut self, l: &mut [f32], r: &mut [f32], _key: Option<(&[f32], &[f32])>) {
        self.fresh = false;
        let n = l.len().min(r.len());
        let still = (self.width_now - self.width).abs() < 1e-6 && (self.pan_now - self.pan).abs() < 1e-6;
        if still && self.width == 1.0 && self.pan == 0.0 {
            return;
        }
        for i in 0..n {
            self.width_now += self.glide * (self.width - self.width_now);
            self.pan_now += self.glide * (self.pan - self.pan_now);
            let mid = 0.5 * (l[i] + r[i]);
            let side = 0.5 * (l[i] - r[i]) * self.width_now;
            // The far side's gain: 1 at the centre, 0 at the edge.
            let far = (0.5 * PI * self.pan_now.abs()).cos();
            let (gl, gr) = if self.pan_now > 0.0 { (far, 1.0) } else { (1.0, far) };
            l[i] = (mid + side) * gl;
            r[i] = (mid - side) * gr;
        }
    }

    fn reset(&mut self) {
        self.width_now = self.width;
        self.pan_now = self.pan;
    }
}
