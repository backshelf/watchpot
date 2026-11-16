//! The convolver: a recorded room (an impulse response) laid over the bus, by uniformly partitioned convolution.
//!
//! The response is cut into partitions of `PART` (256) frames, each held as its spectrum; the input's spectra of
//! the last blocks sit in a frequency-domain delay line, and each block of output is the sum of their products,
//! taken back to time by overlap-save. **Latency: exactly `PART` (256) frames** at any sample rate: a frame comes
//! out of the wet path 256 frames after it went in (5.3 ms at 48 kHz). The dry path is not delayed.
//!
//! The response arrives by `IR_LOAD` (`Fx::ir`), mono or stereo, at its own rate: it is resampled to the engine's,
//! cut to `MAX_SECONDS`, its silent tail trimmed, and scaled to unit energy (white noise in comes out at the same
//! power, whatever the room). A mono response serves both channels; a stereo one convolves left with left and right
//! with right. Loading a new one crossfades from the old over about 20 ms: both are convolved with the same input
//! history meanwhile, so the new room is whole from its first block. Loading allocates; nothing else does.
//!
//! Parameters (`ops::fx_param::conv`), and what the unit does before any `FX_SET`:
//! - `mix` 0..1, default 1 (all wet: a return effect on a send bus). Dry is `1 - mix`.
//! - `gain` dB on the wet path, -60..24, default 0.
//!
//! With no response loaded the wet path is silent.

use super::Fx;
use crate::fft::{Fft, multiply_add};
use crate::math::{db_to_gain, finite_or};
use crate::ops::fx_param::conv;

/// The partition, in frames: the convolver's latency.
pub const PART: usize = 256;
/// The FFT size: twice the partition.
const N: usize = 2 * PART;
/// The longest response kept, in seconds.
pub const MAX_SECONDS: f32 = 6.0;
/// How long a swap of responses crossfades.
const FADE_SECONDS: f32 = 0.02;
/// A response's tail below this, relative to its peak, is trimmed (-90 dB).
const TRIM: f32 = 3.2e-5;

/// One response's spectra: `channels` runs of `parts` partitions of `N` floats.
struct Response {
    spectra: Vec<f32>,
    channels: usize,
    parts: usize,
}

impl Response {
    const NONE: Response = Response { spectra: Vec::new(), channels: 0, parts: 0 };

    #[inline]
    fn part(&self, channel: usize, p: usize) -> &[f32] {
        let c = channel.min(self.channels - 1);
        let at = (c * self.parts + p) * N;
        &self.spectra[at..at + N]
    }
}

pub struct Conv {
    sample_rate: f32,
    fft: Fft,
    /// Each channel's last two partitions of input, time domain: `[previous | current]`.
    input: [Vec<f32>; 2],
    /// Each channel's wet output for the block now being read out.
    output: [Vec<f32>; 2],
    /// Frames of the current partition taken in (and of the output read out).
    pos: usize,
    /// Each channel's input spectra, a ring of `capacity` partitions; `head` is the newest.
    history: [Vec<f32>; 2],
    capacity: usize,
    head: usize,
    now: Response,
    old: Response,
    /// Partitions of crossfade still to run, and its length.
    fade_left: usize,
    fade_len: usize,
    acc: Vec<f32>,
    acc_old: Vec<f32>,
    mix: f32,
    mix_target: f32,
    gain: f32,
    gain_target: f32,
}

impl Conv {
    pub fn new(sample_rate: f32) -> Self {
        let sample_rate = finite_or(sample_rate, 48000.0).max(8000.0);
        let block = || vec![0.0; N];
        Conv {
            sample_rate,
            fft: Fft::new(N),
            input: [block(), block()],
            output: [vec![0.0; PART], vec![0.0; PART]],
            pos: 0,
            history: [Vec::new(), Vec::new()],
            capacity: 0,
            head: 0,
            now: Response::NONE,
            old: Response::NONE,
            fade_left: 0,
            fade_len: ((FADE_SECONDS * sample_rate / PART as f32).ceil() as usize).max(1),
            acc: block(),
            acc_old: block(),
            mix: 1.0,
            mix_target: 1.0,
            gain: 1.0,
            gain_target: 1.0,
        }
    }

    /// The wet path's latency in frames.
    pub const fn latency() -> usize {
        PART
    }

    /// Grows the input history to hold `parts` partitions, keeping what it holds in order.
    fn grow(&mut self, parts: usize) {
        if parts <= self.capacity {
            return;
        }
        for h in &mut self.history {
            let mut grown = vec![0.0; parts * N];
            // The partition `p` blocks old moves to slot `parts - 1 - p`: the newest ends up last, at the new head.
            for p in 0..self.capacity {
                let from = ((self.head + self.capacity - p) % self.capacity) * N;
                let to = (parts - 1 - p) * N;
                grown[to..to + N].copy_from_slice(&h[from..from + N]);
            }
            *h = grown;
        }
        self.head = parts - 1;
        self.capacity = parts;
    }

    /// One partition: the input's spectrum joins the history, and the next block of wet output is made.
    fn partition(&mut self) {
        self.head = if self.capacity == 0 { 0 } else { (self.head + 1) % self.capacity };
        let fading = self.fade_left > 0;
        for ch in 0..2 {
            if self.capacity > 0 {
                let at = self.head * N;
                let slot = &mut self.history[ch][at..at + N];
                slot.copy_from_slice(&self.input[ch]);
                self.fft.forward(slot);
            }
            convolve(&mut self.acc, &self.fft, &self.history[ch], self.capacity, self.head, &self.now, ch);
            if fading {
                convolve(&mut self.acc_old, &self.fft, &self.history[ch], self.capacity, self.head, &self.old, ch);
                // Old to new across the fade's partitions, a straight line frame by frame.
                let done = (self.fade_len - self.fade_left) as f32;
                let step = 1.0 / (self.fade_len * PART) as f32;
                for i in 0..PART {
                    let w = (done * PART as f32 + i as f32) * step;
                    self.output[ch][i] = self.acc_old[PART + i] + w * (self.acc[PART + i] - self.acc_old[PART + i]);
                }
            } else {
                self.output[ch].copy_from_slice(&self.acc[PART..N]);
            }
            // The current partition becomes the previous.
            self.input[ch].copy_within(PART..N, 0);
        }
        if fading {
            self.fade_left -= 1;
        }
    }
}

/// The wet block of channel `ch` against response `r`, into `acc` (time domain; the second half is the output).
fn convolve(acc: &mut [f32], fft: &Fft, history: &[f32], capacity: usize, head: usize, r: &Response, ch: usize) {
    acc.fill(0.0);
    if r.parts == 0 || capacity == 0 {
        return;
    }
    for p in 0..r.parts.min(capacity) {
        let at = ((head + capacity - p) % capacity) * N;
        multiply_add(acc, &history[at..at + N], r.part(ch, p));
    }
    fft.inverse(acc);
}

/// Resamples `x` from `from` Hz to `to` Hz with a Blackman-windowed sinc, low-passed below the lower Nyquist.
fn resample(x: &[f32], from: f32, to: f32) -> Vec<f32> {
    const HALF: f32 = 16.0;
    let ratio = from / to;
    let cutoff = (to / from).min(1.0) * 0.95;
    let reach = HALF / cutoff;
    let len = ((x.len() as f64) * to as f64 / from as f64).floor() as usize;
    (0..len)
        .map(|i| {
            let t = i as f32 * ratio;
            let lo = (t - reach).ceil().max(0.0) as usize;
            let hi = ((t + reach).floor() as usize).min(x.len().saturating_sub(1));
            let mut sum = 0.0;
            for (k, &xk) in x.iter().enumerate().take(hi + 1).skip(lo) {
                let d = t - k as f32;
                let arg = core::f32::consts::PI * cutoff * d;
                let sinc = if arg.abs() < 1e-6 { 1.0 } else { arg.sin() / arg };
                let u = core::f32::consts::PI * d / reach;
                let w = 0.42 + 0.5 * u.cos() + 0.08 * (2.0 * u).cos();
                sum += xk * cutoff * sinc * w;
            }
            sum
        })
        .collect()
}

impl Fx for Conv {
    fn set(&mut self, param: u16, value: f32) {
        let value = finite_or(value, 0.0);
        match param {
            conv::MIX => self.mix_target = value.clamp(0.0, 1.0),
            conv::GAIN => self.gain_target = db_to_gain(value.clamp(-60.0, 24.0)),
            _ => {}
        }
    }

    fn process(&mut self, l: &mut [f32], r: &mut [f32], _key: Option<(&[f32], &[f32])>) {
        let frames = l.len().min(r.len());
        if frames == 0 {
            return;
        }
        let inv = 1.0 / frames as f32;
        let (dm, dg) = ((self.mix_target - self.mix) * inv, (self.gain_target - self.gain) * inv);
        for i in 0..frames {
            self.mix += dm;
            self.gain += dg;
            let (xl, xr) = (l[i], r[i]);
            self.input[0][PART + self.pos] = xl;
            self.input[1][PART + self.pos] = xr;
            let wet = self.mix * self.gain;
            let dry = 1.0 - self.mix;
            l[i] = dry * xl + wet * self.output[0][self.pos];
            r[i] = dry * xr + wet * self.output[1][self.pos];
            self.pos += 1;
            if self.pos == PART {
                self.pos = 0;
                self.partition();
            }
        }
        self.mix = self.mix_target;
        self.gain = self.gain_target;
    }

    fn reset(&mut self) {
        for ch in 0..2 {
            self.input[ch].fill(0.0);
            self.output[ch].fill(0.0);
            self.history[ch].fill(0.0);
        }
        self.pos = 0;
        self.fade_left = 0;
    }

    fn ir(&mut self, pcm: &[i16], channels: u32, rate: f32) {
        let channels_in = (channels as usize).max(1);
        let keep = channels_in.min(2);
        let frames = pcm.len() / channels_in;
        let mut chans: Vec<Vec<f32>> = (0..keep)
            .map(|c| (0..frames).map(|i| pcm[i * channels_in + c] as f32 / 32768.0).collect())
            .collect();
        let rate = finite_or(rate, self.sample_rate);
        if rate > 0.0 && (rate / self.sample_rate - 1.0).abs() > 1e-4 {
            for c in &mut chans {
                *c = resample(c, rate, self.sample_rate);
            }
        }
        let max_len = (MAX_SECONDS * self.sample_rate) as usize;
        let peak = chans.iter().flatten().fold(0.0f32, |m, s| m.max(s.abs()));
        let len = chans
            .iter()
            .map(|c| c.iter().rposition(|s| s.abs() > peak * TRIM).map_or(0, |i| i + 1))
            .max()
            .unwrap_or(0)
            .min(max_len);
        let energy = chans.iter().map(|c| c[..len].iter().map(|s| s * s).sum::<f32>()).sum::<f32>() / keep as f32;
        let next = if len == 0 || energy <= 0.0 || !energy.is_finite() {
            Response::NONE
        } else {
            let scale = 1.0 / energy.sqrt();
            let parts = len.div_ceil(PART);
            let mut spectra = vec![0.0; keep * parts * N];
            for (c, x) in chans.iter().enumerate() {
                for p in 0..parts {
                    let at = (c * parts + p) * N;
                    let block = &mut spectra[at..at + N];
                    let from = p * PART;
                    for (i, s) in x[from..len.min(from + PART)].iter().enumerate() {
                        block[i] = s * scale;
                    }
                    self.fft.forward(block);
                }
            }
            Response { spectra, channels: keep, parts }
        };
        self.grow(next.parts);
        self.old = core::mem::replace(&mut self.now, next);
        if self.old.parts == 0 {
            // From no room: the new one hears from here, at once (no tail of what came before to jump in).
            self.history.iter_mut().for_each(|h| h.fill(0.0));
            self.fade_left = 0;
        } else {
            self.fade_left = self.fade_len;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resampling_keeps_a_low_tone_and_its_length() {
        let x: Vec<f32> = (0..9600).map(|i| (i as f32 * 0.01).sin()).collect();
        let y = resample(&x, 96000.0, 48000.0);
        assert_eq!(y.len(), 4800);
        for (i, s) in y.iter().enumerate().skip(100).take(4000) {
            assert!((s - (i as f32 * 0.02).sin()).abs() < 0.01, "{i}: {s}");
        }
    }
}
