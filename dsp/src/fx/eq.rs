//! The four-band EQ: a low shelf, two peaks and a high shelf, each a biquad (the cookbook's), in transposed direct
//! form II. A band's coefficients are worked out again only when one of its parameters changes, at the top of the
//! next block.
//!
//! Defaults (before any `FX_SET`): every gain 0 dB, so the EQ is flat. Low shelf 100 Hz; peak one 500 Hz, Q 1;
//! peak two 2.5 kHz, Q 1; high shelf 8 kHz. Shelves have a slope of 1 (no overshoot).
//!
//! Ranges: frequencies 20 Hz to 20 kHz (held under 0.45 of the sample rate), gains -24 to +24 dB, Qs 0.1 to 18.

use super::Fx;
use crate::math::{PI, db_to_gain};
use crate::ops::fx_param::eq;

/// The kinds of band a biquad here can be.
#[derive(Clone, Copy, PartialEq)]
enum Shape {
    LowShelf,
    Peak,
    HighShelf,
}

/// One biquad's coefficients (normalised: `a0` is 1) and a stereo pair of states.
#[derive(Clone, Copy)]
struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    s: [[f32; 2]; 2],
}

impl Biquad {
    const fn flat() -> Self {
        Biquad { b0: 1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0, s: [[0.0; 2]; 2] }
    }

    /// Works out the coefficients for `shape` at `freq` Hz, `gain_db` and `q` (the shelves take a slope of 1 and
    /// ignore `q`).
    fn design(&mut self, shape: Shape, sample_rate: f32, freq: f32, gain_db: f32, q: f32) {
        let f = freq.clamp(20.0, 20000.0).min(0.45 * sample_rate);
        let w = 2.0 * PI * f / sample_rate;
        let (sin, cos) = w.sin_cos();
        let a = db_to_gain(gain_db.clamp(-24.0, 24.0) * 0.5);
        let (b0, b1, b2, a0, a1, a2);
        match shape {
            Shape::Peak => {
                let alpha = sin / (2.0 * q.clamp(0.1, 18.0));
                b0 = 1.0 + alpha * a;
                b1 = -2.0 * cos;
                b2 = 1.0 - alpha * a;
                a0 = 1.0 + alpha / a;
                a1 = -2.0 * cos;
                a2 = 1.0 - alpha / a;
            }
            Shape::LowShelf | Shape::HighShelf => {
                let alpha = sin * core::f32::consts::FRAC_1_SQRT_2;
                let k = 2.0 * a.sqrt() * alpha;
                let sign = if shape == Shape::LowShelf { 1.0 } else { -1.0 };
                // The cookbook's shelves: the high shelf is the low one with the cosine's sign turned.
                let (ap, am) = (a + 1.0, a - 1.0);
                b0 = a * (ap - sign * am * cos + k);
                b1 = sign * 2.0 * a * (am - sign * ap * cos);
                b2 = a * (ap - sign * am * cos - k);
                a0 = ap + sign * am * cos + k;
                a1 = -sign * 2.0 * (am + sign * ap * cos);
                a2 = ap + sign * am * cos - k;
            }
        }
        let inv = 1.0 / a0;
        self.b0 = b0 * inv;
        self.b1 = b1 * inv;
        self.b2 = b2 * inv;
        self.a1 = a1 * inv;
        self.a2 = a2 * inv;
    }

    #[inline]
    fn tick(&mut self, ch: usize, x: f32) -> f32 {
        let s = &mut self.s[ch];
        let y = self.b0 * x + s[0];
        s[0] = self.b1 * x - self.a1 * y + s[1];
        s[1] = self.b2 * x - self.a2 * y;
        y
    }

    fn run(&mut self, ch: usize, buf: &mut [f32]) {
        for x in buf.iter_mut() {
            *x = self.tick(ch, *x);
        }
        for v in self.s[ch].iter_mut() {
            if v.abs() < 1e-20 {
                *v = 0.0;
            }
        }
    }

    fn clear(&mut self) {
        self.s = [[0.0; 2]; 2];
    }
}

#[derive(Clone, Copy)]
struct Band {
    shape: Shape,
    freq: f32,
    gain: f32,
    q: f32,
    dirty: bool,
    filter: Biquad,
}

pub struct Eq {
    sample_rate: f32,
    bands: [Band; 4],
}

impl Eq {
    pub fn new(sample_rate: f32) -> Self {
        let band = |shape, freq, q| Band { shape, freq, gain: 0.0, q, dirty: true, filter: Biquad::flat() };
        let mut e = Eq {
            sample_rate,
            bands: [
                band(Shape::LowShelf, 100.0, 0.707),
                band(Shape::Peak, 500.0, 1.0),
                band(Shape::Peak, 2500.0, 1.0),
                band(Shape::HighShelf, 8000.0, 0.707),
            ],
        };
        e.redesign();
        e
    }

    fn redesign(&mut self) {
        for b in self.bands.iter_mut().filter(|b| b.dirty) {
            b.filter.design(b.shape, self.sample_rate, b.freq, b.gain, b.q);
            b.dirty = false;
        }
    }
}

impl Fx for Eq {
    fn set(&mut self, param: u16, value: f32) {
        let (band, field) = match param {
            eq::LOW_FREQ => (0, 0),
            eq::LOW_GAIN => (0, 1),
            eq::MID1_FREQ => (1, 0),
            eq::MID1_GAIN => (1, 1),
            eq::MID1_Q => (1, 2),
            eq::MID2_FREQ => (2, 0),
            eq::MID2_GAIN => (2, 1),
            eq::MID2_Q => (2, 2),
            eq::HIGH_FREQ => (3, 0),
            eq::HIGH_GAIN => (3, 1),
            _ => return,
        };
        let b = &mut self.bands[band];
        let slot = match field {
            0 => &mut b.freq,
            1 => &mut b.gain,
            _ => &mut b.q,
        };
        if *slot != value {
            *slot = value;
            b.dirty = true;
        }
    }

    fn process(&mut self, l: &mut [f32], r: &mut [f32], _key: Option<(&[f32], &[f32])>) {
        self.redesign();
        for b in &mut self.bands {
            b.filter.run(0, l);
            b.filter.run(1, r);
        }
    }

    fn reset(&mut self) {
        for b in &mut self.bands {
            b.filter.clear();
        }
    }
}
