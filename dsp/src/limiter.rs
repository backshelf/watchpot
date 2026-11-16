//! The master limiter: nothing leaves above the ceiling.
//!
//! Stereo-linked, with a 5 ms lookahead. Each incoming frame asks for the gain that would bring its louder side to
//! the ceiling; the minimum of those over the lookahead window (a sliding minimum, held for `L + 1` frames), eased
//! back up with an 80 ms release, is averaged over the last `L` frames and applied to the frame `L` frames old.
//! The average of a window that lies wholly inside the hold of a frame can never rise above what that frame asked
//! for, so no sample exceeds the ceiling, and the average makes the gain fall as a smooth ramp over the lookahead
//! rather than a step. The cost is `L` frames of latency on the master (`latency()`).

use crate::math::{db_to_gain, one_pole};

const LOOKAHEAD_S: f32 = 0.005;
const RELEASE_S: f32 = 0.080;

pub struct Limiter {
    ceiling: f32,
    /// The lookahead, in frames: the delay, and the length of the average.
    look: usize,
    delay_l: Vec<f32>,
    delay_r: Vec<f32>,
    /// The sliding minimum of the asked-for gains: a ring of (frame, gain) with gains rising from the head.
    hold_at: Vec<u64>,
    hold_gain: Vec<f32>,
    hold_head: usize,
    hold_len: usize,
    /// The released gain, and the ring the average runs over.
    released: f32,
    release: f32,
    avg: Vec<f32>,
    avg_sum: f64,
    /// Where the delay and the average write next.
    at: usize,
    frame: u64,
}

impl Limiter {
    pub fn new(sample_rate: f32) -> Self {
        let look = ((LOOKAHEAD_S * sample_rate).round() as usize).max(1);
        Limiter {
            ceiling: db_to_gain(-1.0),
            look,
            delay_l: vec![0.0; look],
            delay_r: vec![0.0; look],
            hold_at: vec![0; look + 2],
            hold_gain: vec![1.0; look + 2],
            hold_head: 0,
            hold_len: 0,
            released: 1.0,
            release: one_pole(RELEASE_S, sample_rate),
            avg: vec![1.0; look],
            avg_sum: look as f64,
            at: 0,
            frame: 0,
        }
    }

    /// Sets the ceiling, linear (default -1 dBFS).
    pub fn set_ceiling(&mut self, ceiling: f32) {
        if ceiling.is_finite() && ceiling > 0.0 {
            self.ceiling = ceiling.min(1.0);
        }
    }

    /// The ceiling, linear.
    pub fn ceiling(&self) -> f32 {
        self.ceiling
    }

    /// Frames between a sample entering the master and leaving the core.
    pub fn latency(&self) -> usize {
        self.look
    }

    /// Limits one block of the master in place.
    pub fn process(&mut self, l: &mut [f32], r: &mut [f32]) {
        let cap = self.hold_at.len();
        let window = self.look as u64 + 1;
        let inv_look = 1.0 / self.look as f64;
        let ceiling = self.ceiling;
        for (xl, xr) in l.iter_mut().zip(r.iter_mut()) {
            // A non-finite sample is silence: one NaN would otherwise poison every gain after it.
            let il = if xl.is_finite() { *xl } else { 0.0 };
            let ir = if xr.is_finite() { *xr } else { 0.0 };
            let peak = il.abs().max(ir.abs());
            let want = if peak > ceiling { ceiling / peak } else { 1.0 };

            // The sliding minimum over the last `look + 1` frames.
            while self.hold_len > 0 {
                let back = (self.hold_head + self.hold_len - 1) % cap;
                if self.hold_gain[back] >= want {
                    self.hold_len -= 1;
                } else {
                    break;
                }
            }
            let back = (self.hold_head + self.hold_len) % cap;
            self.hold_at[back] = self.frame;
            self.hold_gain[back] = want;
            self.hold_len += 1;
            if self.frame - self.hold_at[self.hold_head] >= window {
                self.hold_head = (self.hold_head + 1) % cap;
                self.hold_len -= 1;
            }
            let held = self.hold_gain[self.hold_head];

            // Down at once, up over the release: never above `held`.
            self.released = if held < self.released { held } else { self.released + (held - self.released) * self.release };

            // The average of the last `look` released gains.
            let i = self.at;
            self.avg_sum += (self.released - self.avg[i]) as f64;
            self.avg[i] = self.released;
            let gain = (self.avg_sum * inv_look) as f32;

            let dl = self.delay_l[i];
            let dr = self.delay_r[i];
            self.delay_l[i] = il;
            self.delay_r[i] = ir;
            // The clamp only catches rounding in the average.
            *xl = (dl * gain).clamp(-ceiling, ceiling);
            *xr = (dr * gain).clamp(-ceiling, ceiling);

            self.at += 1;
            if self.at == self.look {
                self.at = 0;
                // Re-sum once a lap so rounding never accumulates.
                self.avg_sum = self.avg.iter().map(|&g| g as f64).sum();
            }
            self.frame += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_loud_burst_stays_under_the_ceiling_and_comes_out_smooth() {
        let mut lim = Limiter::new(48000.0);
        let ceiling = lim.ceiling();
        let src: Vec<f32> = (0..48000).map(|i| if (1000..1200).contains(&i) { 4.0 } else { 0.5 }).collect();
        let mut l = src.clone();
        let mut r = l.clone();
        for (cl, cr) in l.chunks_mut(128).zip(r.chunks_mut(128)) {
            lim.process(cl, cr);
        }
        assert!(l.iter().chain(&r).all(|s| s.abs() <= ceiling));
        // The gain (what came out over what went in) moves as a ramp, never a step.
        let d = lim.latency();
        let gain: Vec<f32> = (d..48000).map(|i| l[i] / src[i - d]).collect();
        assert!(gain.windows(2).all(|w| (w[1] - w[0]).abs() < 0.01));
        assert!(gain.iter().any(|g| *g < 0.25));
        // Well past the 80 ms release the signal is back where it was.
        assert!((l[47999] - 0.5).abs() < 0.01);
    }

    #[test]
    fn quiet_material_passes_untouched_but_late() {
        let mut lim = Limiter::new(48000.0);
        let mut l: Vec<f32> = (0..1000).map(|i| (i as f32 * 0.01).sin() * 0.5).collect();
        let src = l.clone();
        let mut r = l.clone();
        lim.process(&mut l, &mut r);
        let d = lim.latency();
        assert!(l[..d].iter().all(|s| *s == 0.0));
        assert!(l[d..].iter().zip(&src).all(|(a, b)| (a - b).abs() < 1e-6));
    }

    #[test]
    fn a_nan_does_not_poison_the_gain() {
        let mut lim = Limiter::new(48000.0);
        let mut l = vec![0.5; 512];
        l[10] = f32::NAN;
        let mut r = l.clone();
        lim.process(&mut l, &mut r);
        assert!(l.iter().all(|s| s.is_finite()));
        assert!((l[500] - 0.5).abs() < 1e-6);
    }
}
