//! A slewed value: a number that travels to its target over a count of frames, along a straight line or along a
//! straight line in its logarithm (the natural path of a frequency or a time). Every effect parameter is one.

use crate::ops::curve;

#[derive(Clone, Copy, Debug)]
pub struct Slew {
    pub value: f32,
    target: f32,
    /// Frames until `value` is `target`; 0 when it is.
    left: u32,
    /// Added each frame (a line), or multiplied in each frame (a line in the logarithm).
    step: f32,
    exp: bool,
    /// False until the first `go`: the first one lands at once, wherever it is asked to travel from.
    known: bool,
}

impl Slew {
    /// A value nothing has set yet.
    pub const fn unset() -> Self {
        Slew { value: 0.0, target: 0.0, left: 0, step: 0.0, exp: false, known: false }
    }

    /// A value already at `value`.
    pub const fn at(value: f32) -> Self {
        Slew { value, target: value, left: 0, step: 0.0, exp: false, known: true }
    }

    /// Heads for `target`, arriving in `frames` frames along `curve` (`ops::curve`). The first `go` of an unset
    /// value, a `frames` of 0 and a non-finite target land at once (the last keeps the value). An exponential path
    /// needs both ends above zero; otherwise it is a line.
    pub fn go(&mut self, target: f32, frames: u32, curve: u32) {
        if !target.is_finite() {
            return;
        }
        self.target = target;
        if !self.known || frames == 0 || target == self.value {
            self.known = true;
            self.value = target;
            self.left = 0;
            return;
        }
        self.left = frames;
        self.exp = curve == curve::EXP && self.value > 0.0 && target > 0.0;
        self.step = if self.exp {
            (target / self.value).powf(1.0 / frames as f32)
        } else {
            (target - self.value) / frames as f32
        };
    }

    /// Moves on `n` frames. True when the value changed.
    pub fn advance(&mut self, n: u32) -> bool {
        if self.left == 0 {
            return false;
        }
        if n >= self.left {
            self.value = self.target;
            self.left = 0;
        } else {
            self.value = if self.exp { self.value * self.step.powi(n as i32) } else { self.value + self.step * n as f32 };
            self.left -= n;
        }
        true
    }

    #[inline]
    pub fn moving(&self) -> bool {
        self.left > 0
    }

    #[inline]
    pub fn target(&self) -> f32 {
        self.target
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_go_lands_at_once_and_later_ones_travel() {
        let mut s = Slew::unset();
        s.go(100.0, 480, curve::LIN);
        assert_eq!(s.value, 100.0);
        assert!(!s.moving());
        s.go(200.0, 100, curve::LIN);
        assert!(s.advance(50));
        assert!((s.value - 150.0).abs() < 1e-3);
        s.advance(50);
        assert_eq!(s.value, 200.0);
        assert!(!s.advance(10));
    }

    #[test]
    fn an_exponential_path_passes_the_geometric_mean_at_its_middle() {
        let mut s = Slew::at(100.0);
        s.go(10000.0, 1000, curve::EXP);
        s.advance(500);
        assert!((s.value - 1000.0).abs() < 5.0, "{}", s.value);
        s.advance(500);
        assert_eq!(s.value, 10000.0);
    }

    #[test]
    fn an_exponential_path_from_zero_is_a_line_and_a_nan_is_ignored() {
        let mut s = Slew::at(0.0);
        s.go(1.0, 10, curve::EXP);
        s.advance(5);
        assert!((s.value - 0.5).abs() < 1e-6);
        s.go(f32::NAN, 0, curve::LIN);
        assert!((s.target() - 1.0).abs() < 1e-6);
    }
}
