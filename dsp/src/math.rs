//! Small numeric helpers every module shares.

pub const PI: f32 = core::f32::consts::PI;
pub const TAU: f32 = core::f32::consts::TAU;

/// Decibels to a linear gain.
#[inline]
pub fn db_to_gain(db: f32) -> f32 {
    10f32.powf(db / 20.0)
}

/// A linear gain to decibels; silence is -200 dB.
#[inline]
pub fn gain_to_db(gain: f32) -> f32 {
    20.0 * gain.abs().max(1e-10).log10()
}

#[inline]
pub fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

/// 4-point, third-order Hermite interpolation between `y0` and `y1` at `t` in 0..1 (`ym1` and `y2` are their
/// neighbours).
#[inline]
pub fn hermite(ym1: f32, y0: f32, y1: f32, y2: f32, t: f32) -> f32 {
    let c1 = 0.5 * (y1 - ym1);
    let c2 = ym1 - 2.5 * y0 + 2.0 * y1 - 0.5 * y2;
    let c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1);
    ((c3 * t + c2) * t + c1) * t + y0
}

/// Equal-power pan: the left and right gains for `pan` in -1..1 (0 is 0.707 each).
#[inline]
pub fn pan_gains(pan: f32) -> (f32, f32) {
    let angle = (finite_or(pan, 0.0).clamp(-1.0, 1.0) + 1.0) * (PI / 4.0);
    (angle.cos(), angle.sin())
}

/// A cheap `tanh`: within 0.03 of the real one, exactly ±1 past ±3.
#[inline]
pub fn fast_tanh(x: f32) -> f32 {
    let x = x.clamp(-3.0, 3.0);
    let x2 = x * x;
    x * (27.0 + x2) / (27.0 + 9.0 * x2)
}

/// `x` when it is finite, else `fallback`.
#[inline]
pub fn finite_or(x: f32, fallback: f32) -> f32 {
    if x.is_finite() { x } else { fallback }
}

/// Milliseconds as whole frames at `sample_rate`, at least 1.
#[inline]
pub fn ms_to_frames(ms: f32, sample_rate: f32) -> u32 {
    ((ms * 0.001 * sample_rate).round() as u32).max(1)
}

/// The per-sample coefficient of a one-pole smoother that covers 63% of a step in `seconds`.
#[inline]
pub fn one_pole(seconds: f32, sample_rate: f32) -> f32 {
    if seconds <= 0.0 { 1.0 } else { 1.0 - (-1.0 / (seconds * sample_rate)).exp() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decibels_round_trip() {
        for db in [-60.0, -6.0, 0.0, 12.0] {
            assert!((gain_to_db(db_to_gain(db)) - db).abs() < 1e-3);
        }
        assert!((db_to_gain(-6.0206) - 0.5).abs() < 1e-4);
    }

    #[test]
    fn hermite_passes_through_its_points_and_follows_a_line() {
        assert_eq!(hermite(3.0, 1.0, 2.0, 5.0, 0.0), 1.0);
        assert!((hermite(3.0, 1.0, 2.0, 5.0, 1.0) - 2.0).abs() < 1e-6);
        assert!((hermite(0.0, 1.0, 2.0, 3.0, 0.25) - 1.25).abs() < 1e-6);
    }

    #[test]
    fn pan_keeps_power() {
        for pan in [-1.0, -0.3, 0.0, 0.5, 1.0] {
            let (l, r) = pan_gains(pan);
            assert!((l * l + r * r - 1.0).abs() < 1e-5);
        }
        assert!(pan_gains(-1.0).1.abs() < 1e-6);
        assert!(pan_gains(f32::NAN).0 > 0.7);
    }

    #[test]
    fn fast_tanh_stays_close_and_bounded() {
        let mut x = -6.0f32;
        while x < 6.0 {
            assert!((fast_tanh(x) - x.tanh()).abs() < 0.03);
            assert!(fast_tanh(x).abs() <= 1.0);
            x += 0.01;
        }
    }
}
