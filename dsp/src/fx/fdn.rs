//! The morphing reverb: an 8-line feedback delay network whose room can be played live (a room that grows).
//!
//! The input passes a pre-delay line, which is also the tapped line the early reflections read. The network's eight
//! lines have mutually prime lengths scaled by `size`, and mix through a Householder matrix (orthogonal: it moves
//! energy between the lines, never adds any). Each line's feedback passes a one-pole low-pass whose gain at DC sets
//! the decay and whose gain at Nyquist sets the damping, both below 1, so the loop never exceeds unity gain. Two
//! lines are slowly modulated (fractional reads, linear interpolation: never above unity either) to smear the
//! modes.
//!
//! A change of `size` does not move a read position. The unit crossfades, in a straight line over 50 ms, from the
//! reads at the old lengths to the reads at the new (each a prime), so the room changes without a pitch swoop; a
//! size that keeps moving is followed in 50 ms steps. A straight-line crossfade of two reads is never louder than
//! the louder read, so the network stays below unity while it moves.
//!
//! The level is normalised: the input to the network is scaled so that its tail carries about the energy that went
//! in (white noise in comes out at about the same power, for a short room or a long one), like the convolver.
//!
//! Parameters (`ops::fx_param::fdn`), and what the unit does before any `FX_SET`:
//! - `size` 0..1, default 0.5: the lines' lengths (about 6 to 74 ms) and, with `decay`, the decay time.
//! - `decay` seconds, 0.1..30, default 2: the decay time (RT60) at `size` 0.5. The decay time is
//!   `decay * 40^(size - 0.5)`, so the default spans about 0.3 s at `size` 0 to 12.6 s at `size` 1.
//! - `damping` 0..1, default 0.5: how much faster the highs decay (at 1 they die in 15% of the time).
//! - `predelay` seconds, 0..0.5, default 0.02. A change glides over about 50 ms.
//! - `width` 0..1, default 1: the stereo width of the tail and the reflections (0 is mono).
//! - `mod` 0..1, default 0.3: the depth of the two lines' slow modulation (up to 0.4 ms).
//! - `early` 0..1, default 0.5: the level of the early reflections.
//! - `mix` 0..1, default 1 (all wet: a return effect on a send bus). Dry is `1 - mix`.

use super::Fx;
use crate::math::{TAU, finite_or, lerp, one_pole};
use crate::ops::fx_param::fdn;

const LINES: usize = 8;
/// Each line's length at `size` 1, in ms (the primes are found at the engine's rate).
const LINE_MS: [f32; LINES] = [31.3, 37.9, 41.9, 47.3, 53.1, 61.7, 67.3, 73.9];
/// Each early reflection's delay after the pre-delay at `size` 1, in ms.
const TAP_MS: [f32; LINES] = [7.3, 11.9, 17.1, 23.3, 29.9, 37.1, 43.7, 53.3];
/// Each early reflection's gain before normalisation.
const TAP_GAIN: [f32; LINES] = [1.0, 0.92, 0.85, 0.77, 0.7, 0.62, 0.55, 0.47];
/// How the input enters the lines (even lines take the left, odd the right).
const IN_SIGN: [f32; LINES] = [1.0, 1.0, -1.0, 1.0, 1.0, -1.0, -1.0, -1.0];
/// The two outputs: orthogonal rows, scaled by `1 / sqrt(8)` at use.
const OUT_L: [f32; LINES] = [1.0, -1.0, 1.0, -1.0, 1.0, -1.0, 1.0, -1.0];
const OUT_R: [f32; LINES] = [1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, -1.0];
/// The modulated lines, their rates in Hz, and the deepest modulation in ms.
const MOD_LINES: [usize; 2] = [2, 6];
const MOD_HZ: [f32; 2] = [0.37, 0.61];
const MOD_MS: f32 = 0.4;
const MAX_PREDELAY: f32 = 0.5;
const FADE_SECONDS: f32 = 0.05;
/// Below this a value is flushed to zero, so a silent tail never runs on denormals.
const FLUSH: f32 = 1e-20;

/// The lengths of one room: each line's and each reflection's, in frames.
#[derive(Clone, Copy, PartialEq)]
struct Geometry {
    lines: [usize; LINES],
    taps: [usize; LINES],
}

fn is_prime(n: usize) -> bool {
    if n < 4 {
        return n >= 2;
    }
    if n.is_multiple_of(2) {
        return false;
    }
    let mut d = 3;
    while d * d <= n {
        if n.is_multiple_of(d) {
            return false;
        }
        d += 2;
    }
    true
}

fn scale(size: f32) -> f32 {
    0.2 + 0.8 * size.clamp(0.0, 1.0)
}

impl Geometry {
    fn of(size: f32, sample_rate: f32) -> Self {
        let s = scale(size);
        let mut lines = [0; LINES];
        for i in 0..LINES {
            let mut n = ((LINE_MS[i] * s * 0.001 * sample_rate) as usize).max(17);
            while !is_prime(n) || lines[..i].contains(&n) {
                n += 1;
            }
            lines[i] = n;
        }
        let mut taps = [0; LINES];
        for (t, ms) in taps.iter_mut().zip(TAP_MS) {
            *t = ((ms * s * 0.001 * sample_rate) as usize).max(1);
        }
        Geometry { lines, taps }
    }
}

/// A delay line of a power-of-two size, read behind a shared write position.
struct Line {
    buf: Vec<f32>,
    mask: usize,
}

impl Line {
    fn new(frames: usize) -> Self {
        let size = frames.next_power_of_two();
        Line { buf: vec![0.0; size], mask: size - 1 }
    }

    #[inline]
    fn at(&self, w: usize, delay: usize) -> f32 {
        self.buf[w.wrapping_sub(delay) & self.mask]
    }

    #[inline]
    fn frac(&self, w: usize, delay: f32) -> f32 {
        let whole = delay as usize;
        let t = delay - whole as f32;
        let a = self.at(w, whole);
        a + t * (self.at(w, whole + 1) - a)
    }
}

pub struct Fdn {
    sample_rate: f32,
    lines: [Line; LINES],
    pre: [Line; 2],
    /// The write position, shared by every line.
    w: usize,
    /// The room heard now (`a`), the room faded to (`b`), how far (0..1), and the room the parameters ask for.
    a: Geometry,
    b: Geometry,
    t: f32,
    fading: bool,
    wanted: Geometry,
    fade_step: f32,
    /// Each line's feedback filter: gain at DC, pole, state.
    gain: [f32; LINES],
    pole: [f32; LINES],
    state: [f32; LINES],
    /// The modulators: a phasor each (cos, sin) and its rotation per frame.
    lfo: [(f32, f32); 2],
    turn: [(f32, f32); 2],
    /// The scale of the input into the network, now and at the end of the block.
    in_scale: f32,
    predelay: f32,
    predelay_target: f32,
    predelay_coef: f32,
    tap_gain: [f32; LINES],
    size: f32,
    decay: f32,
    damping: f32,
    // Played values: now, and the target a block ramps to.
    width: (f32, f32),
    depth: (f32, f32),
    early: (f32, f32),
    mix: (f32, f32),
}

impl Fdn {
    pub fn new(sample_rate: f32) -> Self {
        let sample_rate = finite_or(sample_rate, 48000.0).max(8000.0);
        let ms = |ms: f32| (ms * 0.001 * sample_rate).ceil() as usize;
        let longest = ms(LINE_MS[LINES - 1]) + ms(MOD_MS) + 4;
        let pre_frames = (MAX_PREDELAY * sample_rate) as usize + ms(TAP_MS[LINES - 1]) + 4;
        // Each side's reflections (taps alternate sides) carry half the energy of a unit impulse at `early` 1.
        let side: f32 = TAP_GAIN.iter().map(|g| g * g).sum::<f32>() / 2.0;
        let norm = (0.5 / side).sqrt();
        let geometry = Geometry::of(0.5, sample_rate);
        let turn = MOD_HZ.map(|hz| {
            let a = TAU * hz / sample_rate;
            (a.cos(), a.sin())
        });
        let mut unit = Fdn {
            sample_rate,
            lines: core::array::from_fn(|_| Line::new(longest)),
            pre: core::array::from_fn(|_| Line::new(pre_frames)),
            w: 0,
            a: geometry,
            b: geometry,
            t: 0.0,
            fading: false,
            wanted: geometry,
            fade_step: 1.0 / (FADE_SECONDS * sample_rate),
            gain: [0.0; LINES],
            pole: [0.0; LINES],
            state: [0.0; LINES],
            lfo: [(1.0, 0.0), (0.0, 1.0)],
            turn,
            in_scale: 0.0,
            predelay: 0.02 * sample_rate,
            predelay_target: 0.02 * sample_rate,
            predelay_coef: one_pole(FADE_SECONDS / 3.0, sample_rate),
            tap_gain: TAP_GAIN.map(|g| g * norm),
            size: 0.5,
            decay: 2.0,
            damping: 0.5,
            width: (1.0, 1.0),
            depth: (0.3, 0.3),
            early: (0.5, 0.5),
            mix: (1.0, 1.0),
        };
        unit.in_scale = unit.tune();
        unit
    }

    /// The decay time now, in seconds.
    pub fn rt60(&self) -> f32 {
        (self.decay * 40f32.powf(self.size - 0.5)).clamp(0.05, 60.0)
    }

    /// Sets each line's feedback filter for the lengths heard now; returns the input scale that normalises the tail.
    fn tune(&mut self) -> f32 {
        let rt60 = self.rt60();
        let rt60_high = rt60 * (1.0 - 0.85 * self.damping);
        let mut energy = 0.0;
        for i in 0..LINES {
            let len = if self.fading { lerp(self.a.lines[i] as f32, self.b.lines[i] as f32, self.t) } else { self.a.lines[i] as f32 };
            let per = -3.0 * len / self.sample_rate;
            let g = 10f32.powf(per / rt60);
            let g_high = 10f32.powf(per / rt60_high);
            let ratio = g_high / g;
            self.gain[i] = g;
            self.pole[i] = (1.0 - ratio) / (1.0 + ratio);
            energy += g * g;
        }
        // An impulse puts `4 s^2` into the lines; each channel hears an eighth of what circulates, `1 / (1 - g^2)` times.
        (2.0 * (1.0 - energy / LINES as f32)).max(0.0).sqrt()
    }
}

impl Fx for Fdn {
    fn set(&mut self, param: u16, value: f32) {
        if !value.is_finite() {
            return;
        }
        match param {
            fdn::SIZE => {
                self.size = value.clamp(0.0, 1.0);
                self.wanted = Geometry::of(self.size, self.sample_rate);
            }
            fdn::DECAY => self.decay = value.clamp(0.1, 30.0),
            fdn::DAMPING => self.damping = value.clamp(0.0, 1.0),
            fdn::PREDELAY => self.predelay_target = value.clamp(0.0, MAX_PREDELAY) * self.sample_rate,
            fdn::WIDTH => self.width.1 = value.clamp(0.0, 1.0),
            fdn::MOD => self.depth.1 = value.clamp(0.0, 1.0),
            fdn::EARLY => self.early.1 = value.clamp(0.0, 1.0),
            fdn::MIX => self.mix.1 = value.clamp(0.0, 1.0),
            _ => {}
        }
    }

    fn process(&mut self, l: &mut [f32], r: &mut [f32], _key: Option<(&[f32], &[f32])>) {
        let frames = l.len().min(r.len());
        if frames == 0 {
            return;
        }
        if !self.fading && self.wanted != self.a {
            self.b = self.wanted;
            self.t = 0.0;
            self.fading = true;
        }
        let in_end = self.tune();
        let inv = 1.0 / frames as f32;
        let ramp = |v: (f32, f32)| (v.0, (v.1 - v.0) * inv);
        let (mut in_scale, d_in) = ((self.in_scale), (in_end - self.in_scale) * inv);
        let (mut width, d_width) = ramp(self.width);
        let (mut depth, d_depth) = ramp(self.depth);
        let (mut early, d_early) = ramp(self.early);
        let (mut mix, d_mix) = ramp(self.mix);
        let mod_frames = MOD_MS * 0.001 * self.sample_rate;
        let out_norm = 1.0 / (LINES as f32).sqrt();

        for i in 0..frames {
            in_scale += d_in;
            width += d_width;
            depth += d_depth;
            early += d_early;
            mix += d_mix;
            let w = self.w;
            let (xl, xr) = (l[i], r[i]);
            self.pre[0].buf[w & self.pre[0].mask] = xl;
            self.pre[1].buf[w & self.pre[1].mask] = xr;
            self.predelay += (self.predelay_target - self.predelay) * self.predelay_coef;
            let pd = self.predelay;
            let into = [self.pre[0].frac(w, pd), self.pre[1].frac(w, pd)];

            // The early reflections: even taps stay on their side, the second four cross over.
            let mut refl = [0.0f32; 2];
            for k in 0..LINES {
                let src = k & 1;
                let dst = if k < 4 { src } else { 1 - src };
                let tap = if self.fading { lerp(self.a.taps[k] as f32, self.b.taps[k] as f32, self.t) } else { self.a.taps[k] as f32 };
                refl[dst] += self.tap_gain[k] * self.pre[src].frac(w, pd + tap);
            }

            // The lines: read (the two rooms crossfaded while the size moves), filter, mix, write.
            let mut z = [0.0f32; LINES];
            let mut offset = [0.0f32; LINES];
            for (m, &line) in MOD_LINES.iter().enumerate() {
                offset[line] = depth * mod_frames * (0.5 + 0.5 * self.lfo[m].1);
            }
            for j in 0..LINES {
                let line = &self.lines[j];
                let read = |len: usize| {
                    if offset[j] > 0.0 { line.frac(w, len as f32 + offset[j]) } else { line.at(w, len) }
                };
                let y = if self.fading {
                    let ya = read(self.a.lines[j]);
                    ya + self.t * (read(self.b.lines[j]) - ya)
                } else {
                    read(self.a.lines[j])
                };
                let p = self.pole[j];
                let s = self.gain[j] * (1.0 - p) * y + p * self.state[j];
                let s = (s + FLUSH) - FLUSH;
                self.state[j] = s;
                z[j] = s;
            }
            let sum: f32 = z.iter().sum::<f32>() * (2.0 / LINES as f32);
            let (mut tl, mut tr) = (0.0, 0.0);
            for j in 0..LINES {
                tl += OUT_L[j] * z[j];
                tr += OUT_R[j] * z[j];
                let v = z[j] - sum + IN_SIGN[j] * into[j & 1] * in_scale;
                self.lines[j].buf[w & self.lines[j].mask] = (v + FLUSH) - FLUSH;
            }
            let wl = tl * out_norm + early * refl[0];
            let wr = tr * out_norm + early * refl[1];
            let mid = 0.5 * (wl + wr);
            let side = 0.5 * (wl - wr) * width;
            l[i] = (1.0 - mix) * xl + mix * (mid + side);
            r[i] = (1.0 - mix) * xr + mix * (mid - side);

            self.w = w.wrapping_add(1);
            for m in 0..2 {
                let (c, s) = self.lfo[m];
                let (tc, ts) = self.turn[m];
                self.lfo[m] = (c * tc - s * ts, c * ts + s * tc);
            }
            if self.fading {
                self.t += self.fade_step;
                if self.t >= 1.0 {
                    self.a = self.b;
                    self.t = 0.0;
                    self.fading = false;
                    if self.wanted != self.a {
                        self.b = self.wanted;
                        self.fading = true;
                    }
                }
            }
        }
        // Keep the phasors on the unit circle.
        for p in &mut self.lfo {
            let n = 1.0 / (p.0 * p.0 + p.1 * p.1).sqrt();
            *p = (p.0 * n, p.1 * n);
        }
        self.in_scale = in_end;
        self.width.0 = self.width.1;
        self.depth.0 = self.depth.1;
        self.early.0 = self.early.1;
        self.mix.0 = self.mix.1;
    }

    fn reset(&mut self) {
        for line in self.lines.iter_mut().chain(self.pre.iter_mut()) {
            line.buf.fill(0.0);
        }
        self.state = [0.0; LINES];
        self.a = self.wanted;
        self.b = self.wanted;
        self.t = 0.0;
        self.fading = false;
        self.predelay = self.predelay_target;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_room_has_distinct_prime_lines_that_fit() {
        for rate in [44100.0, 48000.0, 96000.0] {
            let unit = Fdn::new(rate);
            for size in [0.0, 0.3, 1.0] {
                let g = Geometry::of(size, rate);
                for (i, &n) in g.lines.iter().enumerate() {
                    assert!(is_prime(n) && !g.lines[..i].contains(&n));
                    assert!(n + (MOD_MS * 0.001 * rate) as usize + 2 < unit.lines[i].buf.len());
                }
            }
        }
    }
}
