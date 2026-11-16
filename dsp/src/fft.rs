//! A real FFT and its inverse, for the convolver and (in wave 3) the spectral freeze.
//!
//! `Fft::new(n)` builds the tables for one power-of-two size from 256 to 4096 (the only allocation); `forward` and
//! `inverse` then work in place on `n` floats and never allocate. The real transform of size `n` is a complex
//! radix-2 transform of size `n / 2` over the even and odd samples, untangled after.
//!
//! The spectrum is packed into the same `n` floats: `[X0.re, X(n/2).re, X1.re, X1.im, X2.re, X2.im, ...]` (bin 0
//! and the Nyquist bin are real). `forward` is unscaled; `inverse` scales, so `inverse(forward(x)) == x`.

use core::f32::consts::TAU;

/// The smallest and largest sizes `Fft::new` takes.
pub const MIN_SIZE: usize = 256;
pub const MAX_SIZE: usize = 4096;

pub struct Fft {
    n: usize,
    /// The complex transform's twiddles, `e^(-i 2 pi k / (n/2))` for `k < n/4`, as (cos, sin) pairs.
    twiddle: Vec<(f32, f32)>,
    /// The real untangling's twiddles, `e^(-i 2 pi k / n)` for `k <= n/4`.
    split: Vec<(f32, f32)>,
    /// Bit-reversed index of each complex sample, over `n / 2`.
    reverse: Vec<u32>,
}

impl Fft {
    /// The tables for size `n`, a power of two from `MIN_SIZE` to `MAX_SIZE` (clamped to the nearest such).
    pub fn new(n: usize) -> Self {
        let n = n.clamp(MIN_SIZE, MAX_SIZE).next_power_of_two();
        let m = n / 2;
        let bits = m.trailing_zeros();
        let angle = |k: usize, of: usize| {
            // Computed in f64 so the large tables stay exact to f32's precision.
            let a = -(TAU as f64) * k as f64 / of as f64;
            (a.cos() as f32, a.sin() as f32)
        };
        Fft {
            n,
            twiddle: (0..m / 2).map(|k| angle(k, m)).collect(),
            split: (0..=m / 2).map(|k| angle(k, n)).collect(),
            reverse: (0..m as u32).map(|i| i.reverse_bits() >> (32 - bits)).collect(),
        }
    }

    /// The size this was built for.
    #[inline]
    pub fn size(&self) -> usize {
        self.n
    }

    /// The complex transform of `n / 2` interleaved points in place, forward or inverse (unscaled).
    fn complex(&self, buf: &mut [f32], inverse: bool) {
        let m = self.n / 2;
        for (i, &j) in self.reverse.iter().enumerate() {
            let j = j as usize;
            if j > i {
                buf.swap(2 * i, 2 * j);
                buf.swap(2 * i + 1, 2 * j + 1);
            }
        }
        let mut half = 1;
        while half < m {
            let stride = m / (2 * half);
            let mut start = 0;
            while start < m {
                for k in 0..half {
                    let (c, s) = self.twiddle[k * stride];
                    let s = if inverse { -s } else { s };
                    let a = 2 * (start + k);
                    let b = 2 * (start + k + half);
                    let (br, bi) = (buf[b], buf[b + 1]);
                    let tr = br * c - bi * s;
                    let ti = br * s + bi * c;
                    let (ar, ai) = (buf[a], buf[a + 1]);
                    buf[a] = ar + tr;
                    buf[a + 1] = ai + ti;
                    buf[b] = ar - tr;
                    buf[b + 1] = ai - ti;
                }
                start += 2 * half;
            }
            half *= 2;
        }
    }

    /// `n` real samples to their packed spectrum, in place. Unscaled.
    pub fn forward(&self, buf: &mut [f32]) {
        let n = self.n;
        let m = n / 2;
        let buf = &mut buf[..n];
        self.complex(buf, false);
        let (r0, i0) = (buf[0], buf[1]);
        buf[0] = r0 + i0;
        buf[1] = r0 - i0;
        for k in 1..=m / 2 {
            let j = m - k;
            let (ar, ai) = (buf[2 * k], buf[2 * k + 1]);
            let (br, bi) = (buf[2 * j], -buf[2 * j + 1]); // conj Z[m - k]
            // Fe = (A + B) / 2, Fo = -i (A - B) / 2.
            let (er, ei) = (0.5 * (ar + br), 0.5 * (ai + bi));
            let (or, oi) = (0.5 * (ai - bi), -0.5 * (ar - br));
            let (c, s) = self.split[k];
            let (wr, wi) = (or * c - oi * s, or * s + oi * c);
            buf[2 * k] = er + wr;
            buf[2 * k + 1] = ei + wi;
            if j != k {
                // X[m - k] = conj(Fe - W^k Fo)
                buf[2 * j] = er - wr;
                buf[2 * j + 1] = -(ei - wi);
            }
        }
    }

    /// A packed spectrum back to its `n` real samples, in place, scaled so `inverse(forward(x)) == x`.
    pub fn inverse(&self, buf: &mut [f32]) {
        let n = self.n;
        let m = n / 2;
        let buf = &mut buf[..n];
        let (x0, xm) = (buf[0], buf[1]);
        buf[0] = 0.5 * (x0 + xm);
        buf[1] = 0.5 * (x0 - xm);
        for k in 1..=m / 2 {
            let j = m - k;
            let (ar, ai) = (buf[2 * k], buf[2 * k + 1]);
            let (br, bi) = (buf[2 * j], -buf[2 * j + 1]); // conj X[m - k]
            let (er, ei) = (0.5 * (ar + br), 0.5 * (ai + bi));
            let (dr, di) = (0.5 * (ar - br), 0.5 * (ai - bi));
            // Fo = D * conj(W^k)
            let (c, s) = self.split[k];
            let (or, oi) = (dr * c + di * s, di * c - dr * s);
            // Z[k] = Fe + i Fo; Z[m - k] = conj(Fe) + i conj(Fo)
            buf[2 * k] = er - oi;
            buf[2 * k + 1] = ei + or;
            if j != k {
                buf[2 * j] = er + oi;
                buf[2 * j + 1] = -ei + or;
            }
        }
        self.complex(buf, true);
        let scale = 1.0 / m as f32;
        for x in buf.iter_mut() {
            *x *= scale;
        }
    }
}

/// Multiplies packed spectrum `a` by `b` and adds the product into `acc` (all `n` floats, packed as `Fft` packs):
/// the inner loop of a convolution.
#[inline]
pub fn multiply_add(acc: &mut [f32], a: &[f32], b: &[f32]) {
    let n = acc.len().min(a.len()).min(b.len());
    acc[0] += a[0] * b[0];
    acc[1] += a[1] * b[1];
    let (acc, a, b) = (&mut acc[2..n], &a[2..n], &b[2..n]);
    let (acc, a, b) = (acc.as_chunks_mut::<2>().0, a.as_chunks::<2>().0, b.as_chunks::<2>().0);
    for ((o, x), y) in acc.iter_mut().zip(a).zip(b) {
        o[0] += x[0] * y[0] - x[1] * y[1];
        o[1] += x[0] * y[1] + x[1] * y[0];
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_cosine_lands_in_its_bin() {
        let fft = Fft::new(256);
        let mut x: Vec<f32> = (0..256).map(|i| (TAU * 5.0 * i as f32 / 256.0).cos()).collect();
        fft.forward(&mut x);
        assert!((x[10] - 128.0).abs() < 1e-3, "{}", x[10]);
        assert!(x[11].abs() < 1e-3);
        assert!(x[0].abs() < 1e-3 && x[1].abs() < 1e-3);
    }
}
