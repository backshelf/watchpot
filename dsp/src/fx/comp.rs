//! The compressor: feed-forward, a soft knee, attack and release on the gain reduction, makeup, a floor on how far
//! it reduces (`range`) and a dry/wet mix. With a key bus (named at `FX_DEFINE`) it listens to that bus instead of
//! its own: a pulse on the key ducks or pumps the bus it sits on.
//!
//! The detector takes the louder channel's peak (instant attack, a 10 ms fall so a low note's troughs do not open
//! it), turns it into dB and runs the gain computer; the reduction it asks for, held to `range`, is smoothed with
//! the attack going down and the release coming back. Attack and release are the times to cover 90% of a step.
//! Silence in the detector reads as -200 dB, so a silent key changes nothing and never divides by zero.
//!
//! Defaults (before any `FX_SET`): threshold -24 dB, ratio 4, attack 10 ms, release 150 ms, knee 6 dB, makeup
//! 0 dB, range 24 dB, mix 1.
//!
//! Ranges: threshold -80 to 0 dB; ratio 1 to 50; attack 0.1 ms to 1 s; release 1 ms to 5 s; knee 0 to 24 dB;
//! makeup -24 to +24 dB; range 0 to 80 dB; mix 0..1.

use super::Fx;
use crate::math::{gain_to_db, one_pole};
use crate::ops::fx_param::comp;

/// ln(10): a one-pole covers 90% of a step in `t` when its time constant is `t / LN_10`.
const LN_10: f32 = core::f32::consts::LN_10;
/// The detector's fall time constant, seconds.
const DETECT_FALL: f32 = 0.01;
/// How fast makeup and mix glide, seconds.
const GLIDE: f32 = 0.005;

pub struct Comp {
    sample_rate: f32,
    threshold: f32,
    ratio: f32,
    knee: f32,
    range: f32,
    makeup: f32,
    mix: f32,
    attack_coef: f32,
    release_coef: f32,
    detect_fall: f32,
    glide: f32,
    /// The detector's peak, linear.
    peak: f32,
    /// The smoothed gain reduction, dB (0 or more).
    reduction: f32,
    /// The most of it during the last block, dB.
    most: f32,
    /// Makeup as a gain, and mix, as they glide.
    makeup_now: f32,
    mix_now: f32,
    /// True until the first block: a setting lands at once rather than gliding from the default.
    fresh: bool,
}

impl Comp {
    pub fn new(sample_rate: f32) -> Self {
        let mut c = Comp {
            sample_rate,
            threshold: -24.0,
            ratio: 4.0,
            knee: 6.0,
            range: 24.0,
            makeup: 0.0,
            mix: 1.0,
            attack_coef: 0.0,
            release_coef: 0.0,
            detect_fall: (-1.0 / (DETECT_FALL * sample_rate)).exp(),
            glide: one_pole(GLIDE, sample_rate),
            peak: 0.0,
            reduction: 0.0,
            most: 0.0,
            makeup_now: 1.0,
            mix_now: 1.0,
            fresh: true,
        };
        c.set(comp::ATTACK, 0.01);
        c.set(comp::RELEASE, 0.15);
        c
    }

    /// The time to cover 90% of a step, as a one-pole's coefficient.
    fn coef(&self, seconds: f32) -> f32 {
        one_pole(seconds / LN_10, self.sample_rate)
    }

    /// The gain reduction the computer asks for at `level` dB, held to the range.
    #[inline]
    fn computer(&self, level: f32) -> f32 {
        let over = level - self.threshold;
        let slope = 1.0 - 1.0 / self.ratio;
        let half = self.knee * 0.5;
        let reduction = if over <= -half {
            0.0
        } else if over < half {
            let x = over + half;
            slope * x * x / (2.0 * self.knee)
        } else {
            slope * over
        };
        reduction.min(self.range)
    }
}

impl Fx for Comp {
    fn set(&mut self, param: u16, value: f32) {
        match param {
            comp::THRESHOLD => self.threshold = value.clamp(-80.0, 0.0),
            comp::RATIO => self.ratio = value.clamp(1.0, 50.0),
            comp::ATTACK => self.attack_coef = self.coef(value.clamp(0.0001, 1.0)),
            comp::RELEASE => self.release_coef = self.coef(value.clamp(0.001, 5.0)),
            comp::KNEE => self.knee = value.clamp(0.0, 24.0),
            comp::MAKEUP => self.makeup = value.clamp(-24.0, 24.0),
            comp::RANGE => self.range = value.clamp(0.0, 80.0),
            comp::MIX => self.mix = value.clamp(0.0, 1.0),
            _ => {}
        }
        if self.fresh {
            self.makeup_now = crate::math::db_to_gain(self.makeup);
            self.mix_now = self.mix;
        }
    }

    fn process(&mut self, l: &mut [f32], r: &mut [f32], key: Option<(&[f32], &[f32])>) {
        self.fresh = false;
        let n = l.len().min(r.len());
        let makeup = crate::math::db_to_gain(self.makeup);
        let mut most = 0.0f32;
        for i in 0..n {
            let (kl, kr) = match key {
                Some((kl, kr)) => (kl.get(i).copied().unwrap_or(0.0), kr.get(i).copied().unwrap_or(0.0)),
                None => (l[i], r[i]),
            };
            let x = kl.abs().max(kr.abs());
            self.peak = if x > self.peak { x } else { self.peak * self.detect_fall };
            let want = self.computer(gain_to_db(self.peak));
            let coef = if want > self.reduction { self.attack_coef } else { self.release_coef };
            self.reduction += coef * (want - self.reduction);
            most = most.max(self.reduction);
            self.makeup_now += self.glide * (makeup - self.makeup_now);
            self.mix_now += self.glide * (self.mix - self.mix_now);
            // 10^(-dB/20) without a powf.
            let gain = (-self.reduction * (LN_10 / 20.0)).exp() * self.makeup_now;
            let g = 1.0 - self.mix_now + self.mix_now * gain;
            l[i] *= g;
            r[i] *= g;
        }
        self.most = most;
        if self.peak < 1e-20 {
            self.peak = 0.0;
        }
        if self.reduction < 1e-9 {
            self.reduction = 0.0;
        }
    }

    fn reset(&mut self) {
        self.peak = 0.0;
        self.reduction = 0.0;
        self.most = 0.0;
    }

    fn reduction(&self) -> f32 {
        self.most
    }
}
