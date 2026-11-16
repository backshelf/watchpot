//! The saturator: a tilt, drive into `tanh` at four times the sample rate, the tilt's inverse, a loudness match
//! and a dry/wet mix.
//!
//! - The tilt is a first-order shelf pair around 1 kHz: `tilt` dB brighter going in (half up top, half down
//!   below), so the drive bites the highs harder, and the exact inverse coming out, so the tone stays.
//! - Oversampling is two 2x stages, each a filter pair run polyphase. The outer stage goes up through a 63-tap
//!   half-band (Kaiser, about 80 dB down from 0.58 of the base rate) and down through an 89-tap low-pass whose
//!   stopband starts at half the base rate: a half-band is only 6 dB down there by construction, so on the way down
//!   it would fold a harmonic just over it back as an alias just under it. The inner stage is a 19-tap half-band
//!   both ways, whose wide transition is free because the outer stage cleans up after it.
//! - Why four times and not two: at full drive a sine is all but a square, whose harmonics fall only as 1/n. At
//!   2x the 15th harmonic of a 5 kHz tone folds to 21 kHz at about -37 dB whatever the filters; at 4x the first
//!   harmonic that folds into the band is the 35th, under -50 dB.
//! - The `tanh` is antiderivative-antialiased (first order, in f64), taking what folds at the quadrupled rate
//!   another 20 to 40 dB down.
//! - Drive must not make the bus louder: the wet side is matched to the dry side's power (30 ms envelopes; the
//!   gain falls in 2 ms and rises in 60 ms), so at any drive the output is within a dB of the input's loudness.
//! - The dry side is delayed by the filters' latency, `LATENCY` (42) frames, so mix blends without a comb.
//!
//! Defaults (before any `FX_SET`): drive 6 dB, tilt 0 dB, mix 1.
//!
//! Ranges: drive 0 to `MAX_DRIVE` (36) dB; tilt -12 to +12 dB; mix 0..1.

use super::Fx;
use crate::math::{PI, db_to_gain, one_pole};
use crate::ops::fx_param::sat;

/// The most drive, dB.
pub const MAX_DRIVE: f32 = 36.0;
/// The outer half-band's length.
const OUTER_UP: usize = 63;
/// The outer down filter's length and its cutoff, as a fraction of the doubled rate.
const OUTER_DOWN: usize = 89;
const OUTER_DOWN_CUTOFF: f64 = 21800.0 / 96000.0;
/// The inner half-band's length.
const INNER: usize = 19;
/// The filters' latency at the engine's rate, frames: the centres of the outer pair at the doubled rate, plus the
/// inner pair's at the quadrupled rate (half as long at the doubled), all halved.
pub const LATENCY: usize = ((OUTER_UP - 1) / 2 + (OUTER_DOWN - 1) / 2 + (INNER - 1) / 2) / 2;
const _: () = assert!(((OUTER_UP - 1) / 2 + (OUTER_DOWN - 1) / 2 + (INNER - 1) / 2) % 2 == 0, "a whole-frame latency");
/// Where the tilt pivots, Hz.
const TILT_HZ: f32 = 1000.0;
/// A ring's length: room for the longest history.
const RING: usize = 64;

/// A history of `RING` samples, newest first, readable as one slice.
#[derive(Clone, Copy)]
struct Ring {
    buf: [f32; 2 * RING],
    pos: usize,
}

impl Ring {
    const fn new() -> Self {
        Ring { buf: [0.0; 2 * RING], pos: 0 }
    }

    #[inline]
    fn push(&mut self, x: f32) {
        self.pos = (self.pos + RING - 1) % RING;
        self.buf[self.pos] = x;
        self.buf[self.pos + RING] = x;
    }

    /// The sample `k` pushes ago (0: the newest).
    #[inline]
    fn ago(&self, k: usize) -> f32 {
        self.buf[self.pos + k]
    }

    /// `taps[k]` times the sample `k` pushes ago, summed.
    #[inline]
    fn dot<const N: usize>(&self, taps: &[f32; N]) -> f32 {
        let h = &self.buf[self.pos..self.pos + N];
        let mut acc = 0.0;
        for k in 0..N {
            acc += taps[k] * h[k];
        }
        acc
    }
}

/// A half-band of `2T - 1` taps by its even-indexed taps (`T`); its centre is 0.5 and its other odd taps zero.
struct HalfBand<const T: usize> {
    taps: [f32; T],
}

impl<const T: usize> HalfBand<T> {
    /// How many inputs back the centre tap sits on the odd phase.
    const DELAY: usize = (T - 1) / 2;

    fn new<const L: usize>(beta: f64) -> Self {
        let h: [f64; L] = low_pass(0.25, beta);
        // The side taps sum to 0.5, so with its centre at 0.5 the filter passes DC at exactly 1.
        let side: f64 = (0..T).map(|k| h[2 * k]).sum();
        HalfBand { taps: core::array::from_fn(|k| (h[2 * k] * 0.5 / side) as f32) }
    }

    /// One input in, two out: the even phase is the side taps, the odd phase the centre tap (a delay).
    #[inline]
    fn up(&self, ring: &mut Ring, x: f32) -> (f32, f32) {
        ring.push(x);
        (2.0 * ring.dot(&self.taps), ring.ago(Self::DELAY))
    }

    /// Two inputs in (even, then odd), one out.
    #[inline]
    fn down(&self, even: &mut Ring, odd: &mut Ring, v0: f32, v1: f32) -> f32 {
        even.push(v0);
        odd.push(v1);
        even.dot(&self.taps) + 0.5 * odd.ago(Self::DELAY + 1)
    }
}

/// A first-order section, stereo.
#[derive(Clone, Copy, Default)]
struct FirstOrder {
    b0: f32,
    b1: f32,
    a1: f32,
    x1: [f32; 2],
    y1: [f32; 2],
}

impl FirstOrder {
    /// Bilinear transform of `(n1 s + n0) / (d1 s + d0)`, where `s` is normalised to the pivot `hz`.
    fn design(&mut self, sample_rate: f32, hz: f32, n1: f32, n0: f32, d1: f32, d0: f32) {
        let k = 1.0 / (PI * hz / sample_rate).tan();
        let a0 = d1 * k + d0;
        self.b0 = (n1 * k + n0) / a0;
        self.b1 = (n0 - n1 * k) / a0;
        self.a1 = (d0 - d1 * k) / a0;
    }

    #[inline]
    fn tick(&mut self, ch: usize, x: f32) -> f32 {
        let y = self.b0 * x + self.b1 * self.x1[ch] - self.a1 * self.y1[ch];
        self.x1[ch] = x;
        self.y1[ch] = if y.abs() < 1e-20 { 0.0 } else { y };
        y
    }

    fn clear(&mut self) {
        self.x1 = [0.0; 2];
        self.y1 = [0.0; 2];
    }
}

/// `ln(cosh(x))`, `tanh`'s antiderivative, without overflow.
#[inline]
fn log_cosh(x: f64) -> f64 {
    let a = x.abs();
    a + (-2.0 * a).exp().ln_1p() - core::f64::consts::LN_2
}

/// A `tanh` that remembers its last input: first-order antiderivative antialiasing.
#[derive(Clone, Copy)]
struct Shaper {
    x1: f64,
    f1: f64,
}

impl Shaper {
    #[inline]
    fn tick(&mut self, x: f32) -> f32 {
        let x = x as f64;
        let f = log_cosh(x);
        let dx = x - self.x1;
        let y = if dx.abs() > 1e-6 { (f - self.f1) / dx } else { (0.5 * (x + self.x1)).tanh() };
        self.x1 = x;
        self.f1 = f;
        y as f32
    }
}

/// One channel's histories.
#[derive(Clone, Copy)]
struct Channel {
    dry: Ring,
    outer_up: Ring,
    inner_up: Ring,
    inner_even: Ring,
    inner_odd: Ring,
    outer_even: Ring,
    outer_odd: Ring,
    shaper: Shaper,
}

impl Channel {
    const fn new() -> Self {
        let r = Ring::new();
        Channel {
            dry: r,
            outer_up: r,
            inner_up: r,
            inner_even: r,
            inner_odd: r,
            outer_even: r,
            outer_odd: r,
            shaper: Shaper { x1: 0.0, f1: 0.0 },
        }
    }
}

/// The modified Bessel function of the first kind, order 0, by its series.
fn bessel_i0(x: f64) -> f64 {
    let mut sum = 1.0;
    let mut term = 1.0;
    let q = x * x / 4.0;
    for k in 1..100 {
        term *= q / (k * k) as f64;
        sum += term;
        if term < sum * 1e-12 {
            break;
        }
    }
    sum
}

/// A Kaiser-windowed sinc low-pass of `L` taps (odd), cutoff `cutoff` of the sample rate, scaled to pass DC at
/// exactly 1.
fn low_pass<const L: usize>(cutoff: f64, beta: f64) -> [f64; L] {
    let centre = (L - 1) as f64 / 2.0;
    let norm = bessel_i0(beta);
    let mut h = [0.0f64; L];
    for (m, tap) in h.iter_mut().enumerate() {
        let n = m as f64 - centre;
        let sinc = if n == 0.0 { 2.0 * cutoff } else { (2.0 * core::f64::consts::PI * cutoff * n).sin() / (core::f64::consts::PI * n) };
        let r = n / centre;
        *tap = sinc * bessel_i0(beta * (1.0 - r * r).max(0.0).sqrt()) / norm;
    }
    let sum: f64 = h.iter().sum();
    for tap in &mut h {
        *tap /= sum;
    }
    h
}

const OUTER_TAPS: usize = (OUTER_UP + 1) / 2;
const INNER_TAPS: usize = (INNER + 1) / 2;
const DOWN_EVEN: usize = (OUTER_DOWN + 1) / 2;
const DOWN_ODD: usize = OUTER_DOWN / 2;

pub struct Sat {
    sample_rate: f32,
    outer: HalfBand<OUTER_TAPS>,
    inner: HalfBand<INNER_TAPS>,
    down_even: [f32; DOWN_EVEN],
    down_odd: [f32; DOWN_ODD],
    channels: [Channel; 2],
    pre: FirstOrder,
    post: FirstOrder,
    drive: f32,
    drive_now: f32,
    mix: f32,
    mix_now: f32,
    /// True until the first block: a setting lands at once rather than gliding from the default.
    fresh: bool,
    glide: f32,
    env_coef: f32,
    fall_coef: f32,
    rise_coef: f32,
    in_env: f32,
    out_env: f32,
    match_gain: f32,
}

/// What the envelopes read as silence: biased so that silence asks for the gain a quiet signal needs.
const QUIET: f32 = 1e-12;

impl Sat {
    pub fn new(sample_rate: f32) -> Self {
        let down: [f64; OUTER_DOWN] = low_pass(OUTER_DOWN_CUTOFF, 6.76);
        let mut s = Sat {
            sample_rate,
            outer: HalfBand::new::<OUTER_UP>(7.86),
            inner: HalfBand::new::<INNER>(6.76),
            down_even: core::array::from_fn(|j| down[2 * j] as f32),
            down_odd: core::array::from_fn(|j| down[2 * j + 1] as f32),
            channels: [Channel::new(); 2],
            pre: FirstOrder::default(),
            post: FirstOrder::default(),
            drive: 1.0,
            drive_now: 1.0,
            mix: 1.0,
            mix_now: 1.0,
            fresh: true,
            glide: one_pole(0.01, sample_rate),
            env_coef: one_pole(0.03, sample_rate),
            fall_coef: one_pole(0.002, sample_rate),
            rise_coef: one_pole(0.06, sample_rate),
            in_env: 0.0,
            out_env: 0.0,
            match_gain: 1.0,
        };
        s.set(sat::DRIVE, 6.0);
        s.set(sat::TILT, 0.0);
        s
    }
}

impl Fx for Sat {
    fn set(&mut self, param: u16, value: f32) {
        match param {
            sat::DRIVE => self.drive = db_to_gain(value.clamp(0.0, MAX_DRIVE)),
            sat::TILT => {
                let tilt = value.clamp(-12.0, 12.0);
                let (lo, hi) = (db_to_gain(-0.5 * tilt), db_to_gain(0.5 * tilt));
                self.pre.design(self.sample_rate, TILT_HZ, hi, lo, 1.0, 1.0);
                self.post.design(self.sample_rate, TILT_HZ, 1.0, 1.0, hi, lo);
            }
            sat::MIX => self.mix = value.clamp(0.0, 1.0),
            _ => {}
        }
        if self.fresh {
            self.drive_now = self.drive;
            self.mix_now = self.mix;
            self.match_gain = 1.0 / self.drive;
        }
    }

    fn process(&mut self, l: &mut [f32], r: &mut [f32], _key: Option<(&[f32], &[f32])>) {
        self.fresh = false;
        let n = l.len().min(r.len());
        let (outer, inner) = (&self.outer, &self.inner);
        for i in 0..n {
            self.drive_now += self.glide * (self.drive - self.drive_now);
            self.mix_now += self.glide * (self.mix - self.mix_now);
            let g = self.drive_now;
            let mut wet = [0.0f32; 2];
            let mut dry = [0.0f32; 2];
            for (ch, x) in [l[i], r[i]].into_iter().enumerate() {
                let c = &mut self.channels[ch];
                c.dry.push(x);
                dry[ch] = c.dry.ago(LATENCY);
                let (u0, u1) = outer.up(&mut c.outer_up, self.pre.tick(ch, x) * g);
                let mut m = [0.0f32; 2];
                for (k, u) in [u0, u1].into_iter().enumerate() {
                    let (a, b) = inner.up(&mut c.inner_up, u);
                    let (sa, sb) = (c.shaper.tick(a), c.shaper.tick(b));
                    m[k] = inner.down(&mut c.inner_even, &mut c.inner_odd, sa, sb);
                }
                // The outer low-pass: the output lines up with the even phase; the odd phase is heard a frame later.
                c.outer_even.push(m[0]);
                let down = c.outer_even.dot(&self.down_even) + c.outer_odd.dot(&self.down_odd);
                c.outer_odd.push(m[1]);
                wet[ch] = self.post.tick(ch, down);
            }
            let p_in = 0.5 * (dry[0] * dry[0] + dry[1] * dry[1]);
            let p_out = 0.5 * (wet[0] * wet[0] + wet[1] * wet[1]);
            self.in_env += self.env_coef * (p_in - self.in_env);
            self.out_env += self.env_coef * (p_out - self.out_env);
            let want = ((self.in_env + QUIET) / (self.out_env + QUIET * g * g)).sqrt().clamp(1e-3, 2.0);
            let coef = if want < self.match_gain { self.fall_coef } else { self.rise_coef };
            self.match_gain += coef * (want - self.match_gain);
            let m = self.mix_now;
            let k = m * self.match_gain;
            l[i] = dry[0] * (1.0 - m) + wet[0] * k;
            r[i] = dry[1] * (1.0 - m) + wet[1] * k;
        }
    }

    fn reset(&mut self) {
        self.channels = [Channel::new(); 2];
        self.pre.clear();
        self.post.clear();
        self.in_env = 0.0;
        self.out_env = 0.0;
        self.match_gain = 1.0 / self.drive;
    }
}
