//! The place of a voice: where on the screen a sound happened, turned into what each ear hears.
//!
//! One `Place` belongs to each voice slot (twice the pool's size), so it stays small: a few floats and two short
//! rings for the interaural delay. Until `VOICE_PLACE` sets it, it is inactive and the voice is untouched. Once set,
//! `voice.rs` hands it each block of the voice, before the bus, and adds what `process` returns to the voice's first
//! send (a far sound is more of the room).
//!
//! A voice's block arrives panned to the centre (each side 0.707 of the mono). Then:
//! - Speakers (`space_mode::SPEAKERS`): an equal-power pan from `pan`, unity at the centre.
//! - Headphones (`space_mode::HEADPHONES`): the far ear hears the sound up to 0.65 ms later (at `pan` ±1), through a
//!   head-shadow low-pass that falls toward 1.8 kHz and 4 dB down; the near ear is untouched.
//! - Both: `distance` 0..1 lowers the level by up to 18 dB, low-passes toward 2.5 kHz and lifts the first send by
//!   up to `LIFT`; `occlusion` 0..1 is a second low-pass toward 600 Hz and 9 dB down.
//!
//! The four values (`pan`, `distance`, `occlusion`, and the delay that follows `pan`) travel in a straight line over
//! 20 ms, or over the `slew` given when it is longer; the first set of a voice lands at once. Gains move frame by
//! frame; the low-passes' coefficients once a block. What the interaural delay still holds when a voice ends is
//! dropped by `reset` (the voice's release has already faded it).

use crate::math::{TAU, db_to_gain, finite_or, pan_gains};
use core::f32::consts::SQRT_2;
use crate::ops::space_mode;

/// The longest interaural delay, at `pan` ±1.
const ITD_SECONDS: f32 = 0.00065;
/// The shortest travel of a place.
const MIN_SLEW_SECONDS: f32 = 0.02;
/// What `distance` 1 adds to the voice's first send.
pub const LIFT: f32 = 0.5;
const DISTANCE_DB: f32 = -18.0;
const DISTANCE_HZ: f32 = 2500.0;
const OCCLUSION_DB: f32 = -9.0;
const OCCLUSION_HZ: f32 = 600.0;
const SHADOW_DB: f32 = -4.0;
const SHADOW_HZ: f32 = 1800.0;
/// Below this a filter's state is flushed to zero, so a silent stretch never runs on denormals.
const FLUSH: f32 = 1e-20;

const PAN: usize = 0;
const DISTANCE: usize = 1;
const OCCLUSION: usize = 2;

/// The logarithm of a one-pole low-pass's coefficient at `hz`: a filter `amount` 0..1 of the way there has the
/// coefficient `exp(amount * ln)`, 1 (open) at 0.
fn ln_coef(hz: f32, sample_rate: f32) -> f32 {
    (1.0 - (-TAU * hz / sample_rate).exp()).ln()
}

pub struct Place {
    active: bool,
    /// Pan, distance, occlusion: where it is, where it is going, the step a frame, frames left.
    now: [f32; 3],
    target: [f32; 3],
    step: [f32; 3],
    left: u32,
    min_slew: u32,
    itd: f32,
    ln_distance: f32,
    ln_occlusion: f32,
    ln_shadow: f32,
    /// Each ear's filter states: distance, occlusion, shadow.
    lp: [[f32; 3]; 2],
    /// Each ear's interaural delay ring, `mask + 1` frames each, end to end.
    ring: Vec<f32>,
    mask: usize,
    w: usize,
    /// The mode of the last block: the rings are cleared on a change.
    mode: u32,
}

impl Place {
    /// A place for one voice slot. Called once per slot when the pool is built: allocate here, never later.
    pub fn new(sample_rate: f32) -> Self {
        let sample_rate = finite_or(sample_rate, 48000.0).max(8000.0);
        let itd = ITD_SECONDS * sample_rate;
        let size = (itd.ceil() as usize + 3).next_power_of_two();
        Place {
            active: false,
            now: [0.0; 3],
            target: [0.0; 3],
            step: [0.0; 3],
            left: 0,
            min_slew: (MIN_SLEW_SECONDS * sample_rate) as u32,
            itd,
            ln_distance: ln_coef(DISTANCE_HZ, sample_rate),
            ln_occlusion: ln_coef(OCCLUSION_HZ, sample_rate),
            ln_shadow: ln_coef(SHADOW_HZ, sample_rate),
            lp: [[0.0; 3]; 2],
            ring: vec![0.0; 2 * size],
            mask: size - 1,
            w: 0,
            mode: space_mode::SPEAKERS,
        }
    }

    /// Back to inactive with no history: the slot is starting another voice.
    pub fn reset(&mut self) {
        self.active = false;
        self.now = [0.0; 3];
        self.target = [0.0; 3];
        self.left = 0;
        self.lp = [[0.0; 3]; 2];
        self.ring.fill(0.0);
    }

    /// Whether the voice has been placed.
    #[inline]
    pub fn active(&self) -> bool {
        self.active
    }

    /// Heads for a place over `slew` frames (at least 20 ms): `pan` -1..1, `distance` 0..1, `occlusion` 0..1. The
    /// first set of a voice lands at once.
    pub fn set(&mut self, pan: f32, distance: f32, occlusion: f32, slew: u32) {
        self.target = [
            finite_or(pan, 0.0).clamp(-1.0, 1.0),
            finite_or(distance, 0.0).clamp(0.0, 1.0),
            finite_or(occlusion, 0.0).clamp(0.0, 1.0),
        ];
        if !self.active {
            self.active = true;
            self.now = self.target;
            self.left = 0;
            return;
        }
        self.left = slew.max(self.min_slew).max(1);
        for k in 0..3 {
            self.step[k] = (self.target[k] - self.now[k]) / self.left as f32;
        }
    }

    /// Moves the place on `frames` frames.
    fn advance(&mut self, frames: u32) {
        if self.left == 0 {
            return;
        }
        let k = frames.min(self.left);
        self.left -= k;
        for i in 0..3 {
            self.now[i] = if self.left == 0 { self.target[i] } else { self.now[i] + self.step[i] * k as f32 };
        }
    }

    /// Each ear's gain, and in headphones each ear's delay and shadow amount (0..1), at a place.
    fn ears(&self, mode: u32, p: &[f32; 3]) -> ([f32; 2], [f32; 2]) {
        let level = db_to_gain(DISTANCE_DB * p[DISTANCE] + OCCLUSION_DB * p[OCCLUSION]);
        if mode == space_mode::HEADPHONES {
            let far = [p[PAN].max(0.0), (-p[PAN]).max(0.0)];
            (far.map(|f| level * db_to_gain(SHADOW_DB * f)), far)
        } else {
            let (gl, gr) = pan_gains(p[PAN]);
            ([SQRT_2 * gl * level, SQRT_2 * gr * level], [0.0; 2])
        }
    }

    /// Places one block of the voice in place (`mode` is `ops::space_mode`). Returns the level to add to the
    /// voice's first send for this block.
    pub fn process(&mut self, mode: u32, l: &mut [f32], r: &mut [f32]) -> f32 {
        let frames = l.len().min(r.len());
        if mode != self.mode {
            self.mode = mode;
            self.ring.fill(0.0);
        }
        let start = self.now;
        self.advance(frames as u32);
        let end = self.now;
        let (g0, f0) = self.ears(mode, &start);
        let (g1, f1) = self.ears(mode, &end);
        let mid = [0.5 * (start[DISTANCE] + end[DISTANCE]), 0.5 * (start[OCCLUSION] + end[OCCLUSION])];
        let a_distance = (mid[0] * self.ln_distance).exp();
        let a_occlusion = (mid[1] * self.ln_occlusion).exp();
        let headphones = mode == space_mode::HEADPHONES;
        let inv = if frames > 0 { 1.0 / frames as f32 } else { 0.0 };
        let size = self.mask + 1;
        for (ear, buf) in [&mut *l, &mut *r].into_iter().enumerate() {
            let dg = (g1[ear] - g0[ear]) * inv;
            let dd = (f1[ear] - f0[ear]) * self.itd * inv;
            let a_shadow = (0.5 * (f0[ear] + f1[ear]) * self.ln_shadow).exp();
            let (mut g, mut delay) = (g0[ear], f0[ear] * self.itd);
            let [mut s_distance, mut s_occlusion, mut s_shadow] = self.lp[ear];
            let ring = &mut self.ring[ear * size..(ear + 1) * size];
            let mut w = self.w;
            for x in buf[..frames].iter_mut() {
                g += dg;
                s_distance += a_distance * (*x * g - s_distance);
                s_occlusion += a_occlusion * (s_distance - s_occlusion);
                let mut y = s_occlusion;
                if headphones {
                    delay += dd;
                    ring[w & self.mask] = y;
                    let whole = delay as usize;
                    let t = delay - whole as f32;
                    let a = ring[w.wrapping_sub(whole) & self.mask];
                    let b = ring[w.wrapping_sub(whole + 1) & self.mask];
                    s_shadow += a_shadow * (a + t * (b - a) - s_shadow);
                    y = s_shadow;
                    w = w.wrapping_add(1);
                }
                *x = y;
            }
            self.lp[ear] = [s_distance, s_occlusion, s_shadow].map(|s| (s + FLUSH) - FLUSH);
        }
        if headphones {
            self.w = self.w.wrapping_add(frames);
        }
        LIFT * end[DISTANCE]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_later_set_travels_and_the_first_lands() {
        let mut p = Place::new(48000.0);
        p.set(1.0, 0.0, 0.0, 0);
        assert_eq!(p.now[PAN], 1.0);
        p.set(-1.0, 1.0, 0.0, 0);
        p.advance(480);
        assert!((p.now[PAN] - 0.0).abs() < 1e-4 && (p.now[DISTANCE] - 0.5).abs() < 1e-4);
        p.advance(480);
        assert_eq!(p.now, [-1.0, 1.0, 0.0]);
    }
}
