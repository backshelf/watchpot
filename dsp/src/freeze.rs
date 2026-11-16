//! The spectral freeze: an effect (`fx_kind::FREEZE`) that holds its bus's spectrum as a sustained wash, or
//! stutters the last slice of a bar. Its parameters are `ops::fx_param::freeze`. A unit like any other in `fx/`:
//! built by `Freeze::new(sample_rate)`, driven through `Fx`; the transport reaches it through `Fx::tempo`.
//!
//! Latency: none. The live signal is never delayed and never passes through a transform: with `amount` at 0 and
//! `stutter` off the unit only remembers what goes by, and its output is its input to the sample.
//!
//! The freeze. The moment `amount` leaves 0 the last 2048 frames of the bus are analysed (a Hann window, with a
//! second frame 512 frames earlier to tell how fast each part of the spectrum turns) and held. From then on a
//! 2048-point frame is resynthesised every 512 frames (75% overlap, Hann again) and overlap-added: the held
//! magnitudes, with phases advanced by what each turned between the two analysed frames, plus a small random walk.
//! The spectrum is cut into regions round its peaks and each region turns as one, by its peak's increment and its
//! own walk, both sides alike: a partial keeps its shape and its place in the stereo field, so a held tone stays a
//! tone (it does not flutter as its bins drift apart) and the walk is heard as a slow shimmer between partials
//! instead of a buzz at the frame rate. The first frames continue the bus from where it was, so a sustained sound
//! runs into its own wash without a seam. `amount` then crossfades, linearly, from the live signal (0) to the wash
//! (1), smoothed over 10 ms; back at 0 the wash is let go, and the next engage holds a new spectrum. Engaged over
//! silence it holds silence.
//!
//! The stutter. While `stutter` is a division of the bar (8, 16 or 32; any whole number from 1 to 64 is taken) the
//! unit stops listening and repeats the last 1/division of a bar it heard, from the block the parameter landed on,
//! in place of everything else (the wash included). The bar is the transport's (`Fx::tempo`); a slice longer than a
//! second is halved until it fits. Each repeat's last 3 ms crossfade into the audio that led up to the slice, so
//! the seam is as smooth as the bus was; the stutter itself fades in and out over 3 ms. A new division or tempo
//! takes effect when the slice next comes round, keeping the slice's end.
//!
//! Defaults: amount 0, stutter 0 (off). Everything is sized in `new`: nothing allocates after.

use crate::fft::Fft;
use crate::fx::Fx;
use crate::math::one_pole;
use crate::ops::fx_param::freeze;

/// The transform's size and its hop (75% overlap).
pub const SIZE: usize = 2048;
pub const HOP: usize = SIZE / 4;
/// Frames the unit delays the live signal by.
pub const LATENCY: usize = 0;

const BINS: usize = SIZE / 2;
/// A peak stands above the two bins on each side, so peaks are at least three bins apart.
const MAX_PEAKS: usize = BINS / 3 + 2;
/// Hann squared, overlapped four times, sums to this.
const OVERLAP_GAIN: f32 = 1.5;
/// The most a region's phase strays in one hop at 48 kHz, radians either way.
const WALK: f32 = 0.2;
/// A bin under this power (unscaled) is silence: no peak is made of it.
const FLOOR: f32 = 1e-10;
/// The smoothing of `amount`, seconds.
const SMOOTH: f32 = 0.01;
/// The stutter's seam and its fade in and out, seconds.
const SEAM: f32 = 0.003;
/// The longest slice, seconds.
const MAX_SLICE: f32 = 1.0;
const MIN_SLICE: usize = 64;

pub struct Freeze {
    /// What the bus played, a side each: `mask + 1` frames, written at `write`.
    ring: [Vec<f32>; 2],
    mask: usize,
    write: usize,

    fft: Fft,
    window: Vec<f32>,
    /// The held spectrum of each side, packed as `Fft` packs.
    held: [Vec<f32>; 2],
    work: [Vec<f32>; 2],
    /// Per bin, the later analysed frame times the conjugate of the earlier, both sides summed: how the bin turned.
    turn: Vec<f32>,
    power: Vec<f32>,
    /// The regions: each ends (exclusive) at `edges[p]`, turns by `step[p]` a hop and has turned `rotor[p]`.
    edges: Vec<u16>,
    step: Vec<(f32, f32)>,
    rotor: Vec<(f32, f32)>,
    peaks: usize,
    /// The overlap-add of each side: `SIZE` frames, the next to play at `head + cursor`.
    acc: [Vec<f32>; 2],
    head: usize,
    cursor: usize,

    amount: f32,
    amount_now: f32,
    smooth: f32,
    /// True while the wash is made: from an engage until `amount` has faded back to nothing.
    frozen: bool,
    /// An engage waits for the next block to analyse.
    capture: bool,
    /// True until the first block: a setting lands at once.
    fresh: bool,
    rng: u32,
    walk: f32,

    /// The bar's division asked for (0: off), and the bar in frames.
    division: u32,
    bar: f32,
    max_slice: usize,
    /// True while the slice repeats (through its fade out): the ring holds still.
    stuttering: bool,
    slice: usize,
    slice_pos: usize,
    seam: usize,
    seam_max: usize,
    stutter_gain: f32,
    stutter_step: f32,
}

impl Freeze {
    pub fn new(sample_rate: f32) -> Self {
        let max_slice = (MAX_SLICE * sample_rate) as usize;
        let seam_max = ((SEAM * sample_rate) as usize).max(1);
        let ring = (max_slice + seam_max + SIZE + HOP).next_power_of_two();
        let buffer = || vec![0.0; SIZE];
        Freeze {
            ring: [vec![0.0; ring], vec![0.0; ring]],
            mask: ring - 1,
            write: 0,
            fft: Fft::new(SIZE),
            window: (0..SIZE).map(|i| 0.5 - 0.5 * (core::f32::consts::TAU * i as f32 / SIZE as f32).cos()).collect(),
            held: [buffer(), buffer()],
            work: [buffer(), buffer()],
            turn: buffer(),
            power: vec![0.0; BINS + 1],
            edges: vec![0; MAX_PEAKS],
            step: vec![(1.0, 0.0); MAX_PEAKS],
            rotor: vec![(1.0, 0.0); MAX_PEAKS],
            peaks: 0,
            acc: [buffer(), buffer()],
            head: 0,
            cursor: 0,
            amount: 0.0,
            amount_now: 0.0,
            smooth: one_pole(SMOOTH, sample_rate),
            frozen: false,
            capture: false,
            fresh: true,
            rng: 0x2545_f491,
            // The same wander a second at any rate: a hop is shorter at a higher one.
            walk: WALK * (48000.0 / sample_rate).sqrt(),
            division: 0,
            bar: 2.0 * sample_rate,
            max_slice,
            stuttering: false,
            slice: MIN_SLICE,
            slice_pos: 0,
            seam: 1,
            seam_max,
            stutter_gain: 0.0,
            stutter_step: 1.0 / seam_max as f32,
        }
    }

    /// The slice the division and the bar ask for, in frames.
    fn slice_frames(&self) -> usize {
        let mut frames = self.bar / self.division.max(1) as f32;
        while frames > self.max_slice as f32 {
            frames *= 0.5;
        }
        (frames.round() as usize).max(MIN_SLICE)
    }

    /// Analyses the last frames the bus played and holds their spectrum: the magnitudes, the regions round the
    /// peaks, and how each region turns in a hop.
    fn analyse(&mut self) {
        self.turn.fill(0.0);
        self.power.fill(0.0);
        for c in 0..2 {
            let (ring, mask) = (&self.ring[c], self.mask);
            let earlier = &mut self.work[0];
            let later = &mut self.held[c];
            let from = self.write.wrapping_sub(SIZE);
            for (i, w) in self.window.iter().enumerate() {
                earlier[i] = w * ring[from.wrapping_sub(HOP).wrapping_add(i) & mask];
                later[i] = w * ring[from.wrapping_add(i) & mask];
            }
            self.fft.forward(earlier);
            self.fft.forward(later);
            // The wash carries no DC and nothing at Nyquist.
            later[0] = 0.0;
            later[1] = 0.0;
            for k in 1..BINS {
                let (ar, ai) = (earlier[2 * k], earlier[2 * k + 1]);
                let (br, bi) = (later[2 * k], later[2 * k + 1]);
                self.turn[2 * k] += br * ar + bi * ai;
                self.turn[2 * k + 1] += bi * ar - br * ai;
                self.power[k] += br * br + bi * bi;
            }
        }

        // The peaks, and between each two the quietest bin, where one region ends and the next begins.
        let power = &self.power;
        let mut peaks = 0;
        let (mut low, mut low_power) = (1, f32::INFINITY);
        for k in 1..BINS {
            let p = power[k];
            if p < low_power {
                (low, low_power) = (k, p);
            }
            let above = |j: usize| j == 0 || j >= BINS || p > power[j];
            if p > FLOOR && above(k - 1) && above(k + 1) && above(k.wrapping_sub(2).min(BINS)) && above(k + 2) && peaks < MAX_PEAKS {
                if peaks > 0 {
                    self.edges[peaks - 1] = low as u16;
                }
                peaks += 1;
                low_power = f32::INFINITY;
            }
        }
        self.peaks = peaks;
        if peaks == 0 {
            return;
        }
        self.edges[peaks - 1] = BINS as u16;

        // A region turns by what its bins turned between the two frames, the loud ones counting most.
        let mut lo = 1;
        for p in 0..peaks {
            let hi = self.edges[p] as usize;
            let (mut re, mut im) = (0.0f32, 0.0f32);
            for k in lo..hi {
                re += self.turn[2 * k];
                im += self.turn[2 * k + 1];
            }
            let size = re.hypot(im);
            self.step[p] = if size > 1e-20 { (re / size, im / size) } else { (1.0, 0.0) };
            self.rotor[p] = (1.0, 0.0);
            lo = hi;
        }
    }

    /// Resynthesises the next frame and overlap-adds it at the head, leaving out its first `skip` frames (they
    /// fall before the head: only the frames that open a wash skip any).
    fn frame(&mut self, skip: usize) {
        if self.peaks == 0 {
            return;
        }
        let mut lo = 1;
        for p in 0..self.peaks {
            self.rng ^= self.rng << 13;
            self.rng ^= self.rng >> 17;
            self.rng ^= self.rng << 5;
            let d = self.walk * (self.rng as i32 as f32 * (1.0 / 2_147_483_648.0));
            // The hop's turn and the walk's step, then the rotor pulled back onto the unit circle.
            let (sr, si) = self.step[p];
            let (ur, ui) = (sr * (1.0 - 0.5 * d * d) - si * d, sr * d + si * (1.0 - 0.5 * d * d));
            let (rr, ri) = self.rotor[p];
            let (nr, ni) = (rr * ur - ri * ui, rr * ui + ri * ur);
            let fix = 1.5 - 0.5 * (nr * nr + ni * ni);
            let (nr, ni) = (nr * fix, ni * fix);
            self.rotor[p] = (nr, ni);
            let hi = self.edges[p] as usize;
            for c in 0..2 {
                let (held, out) = (&self.held[c][2 * lo..2 * hi], &mut self.work[c][2 * lo..2 * hi]);
                for (o, x) in out.as_chunks_mut::<2>().0.iter_mut().zip(held.as_chunks::<2>().0) {
                    o[0] = x[0] * nr - x[1] * ni;
                    o[1] = x[0] * ni + x[1] * nr;
                }
            }
            lo = hi;
        }
        for c in 0..2 {
            let out = &mut self.work[c];
            out[0] = 0.0;
            out[1] = 0.0;
            self.fft.inverse(out);
            let acc = &mut self.acc[c];
            for i in skip..SIZE {
                acc[(self.head + i - skip) & (SIZE - 1)] += out[i] * self.window[i] * (1.0 / OVERLAP_GAIN);
            }
        }
    }

    /// Crossfades the block towards the wash by `amount`, making the wash's frames as they come due.
    fn wash(&mut self, l: &mut [f32], r: &mut [f32]) {
        let n = l.len();
        let mut i = 0;
        while i < n {
            let run = (n - i).min(HOP - self.cursor);
            let at = self.head + self.cursor;
            let (wl, wr) = (&self.acc[0][at..at + run], &self.acc[1][at..at + run]);
            for (((yl, yr), wl), wr) in l[i..i + run].iter_mut().zip(&mut r[i..i + run]).zip(wl).zip(wr) {
                self.amount_now += self.smooth * (self.amount - self.amount_now);
                let a = self.amount_now;
                *yl = *yl * (1.0 - a) + wl * a;
                *yr = *yr * (1.0 - a) + wr * a;
            }
            // The smoother closes in for ever: the last ten-thousandth is a step nobody hears.
            if (self.amount - self.amount_now).abs() < 1e-4 {
                self.amount_now = self.amount;
            }
            self.cursor += run;
            i += run;
            if self.cursor == HOP {
                for acc in &mut self.acc {
                    acc[self.head..self.head + HOP].fill(0.0);
                }
                self.head = (self.head + HOP) & (SIZE - 1);
                self.cursor = 0;
                self.frame(0);
            }
        }
        if self.amount == 0.0 && self.amount_now == 0.0 {
            self.frozen = false;
        }
    }

    /// Crossfades the block towards the repeating slice.
    fn stutter(&mut self, l: &mut [f32], r: &mut [f32]) {
        let target = if self.division > 0 { 1.0 } else { 0.0 };
        let mask = self.mask;
        for (yl, yr) in l.iter_mut().zip(r.iter_mut()) {
            self.stutter_gain = if target > self.stutter_gain {
                (self.stutter_gain + self.stutter_step).min(1.0)
            } else {
                (self.stutter_gain - self.stutter_step).max(target)
            };
            // The slice ends where the ring stopped.
            let at = self.write.wrapping_sub(self.slice).wrapping_add(self.slice_pos);
            let (mut sl, mut sr) = (self.ring[0][at & mask], self.ring[1][at & mask]);
            let seam_from = self.slice - self.seam;
            if self.slice_pos >= seam_from {
                // Into what led up to the slice, which runs on into its first frame.
                let t = (self.slice_pos - seam_from + 1) as f32 / (self.seam + 1) as f32;
                let before = at.wrapping_sub(self.slice) & mask;
                sl += t * (self.ring[0][before] - sl);
                sr += t * (self.ring[1][before] - sr);
            }
            // In this shape a gain of 1 is the slice to the bit, and one of 0 the bus.
            let g = self.stutter_gain;
            *yl = *yl * (1.0 - g) + sl * g;
            *yr = *yr * (1.0 - g) + sr * g;
            self.slice_pos += 1;
            if self.slice_pos >= self.slice {
                self.slice_pos = 0;
                if self.division > 0 {
                    self.slice = self.slice_frames();
                    self.seam = self.seam_max.min(self.slice / 4);
                }
            }
        }
        if target == 0.0 && self.stutter_gain == 0.0 {
            self.stuttering = false;
        }
    }
}

impl Fx for Freeze {
    fn set(&mut self, param: u16, value: f32) {
        match param {
            freeze::AMOUNT => {
                let amount = if value.is_finite() { value.clamp(0.0, 1.0) } else { return };
                if amount > 0.0 && self.amount == 0.0 {
                    self.capture = true;
                }
                self.amount = amount;
                if self.fresh {
                    self.amount_now = amount;
                }
            }
            freeze::STUTTER => {
                self.division = if value.is_finite() && value >= 0.5 { value.round().min(64.0) as u32 } else { 0 };
            }
            _ => {}
        }
    }

    fn process(&mut self, l: &mut [f32], r: &mut [f32], _key: Option<(&[f32], &[f32])>) {
        self.fresh = false;
        let n = l.len().min(r.len());
        let (l, r) = (&mut l[..n], &mut r[..n]);

        if self.capture {
            self.capture = false;
            if self.amount > 0.0 {
                self.analyse();
                if !self.frozen {
                    // The frames that would already be sounding, so the wash opens at full strength, in step
                    // with the bus.
                    self.frozen = true;
                    for acc in &mut self.acc {
                        acc.fill(0.0);
                    }
                    self.head = 0;
                    self.cursor = 0;
                    for skip in [SIZE - HOP, SIZE - 2 * HOP, SIZE - 3 * HOP, 0] {
                        self.frame(skip);
                    }
                }
            }
        }
        if self.division > 0 && !self.stuttering {
            self.stuttering = true;
            self.slice = self.slice_frames();
            self.seam = self.seam_max.min(self.slice / 4);
            self.slice_pos = 0;
        }

        if !self.stuttering {
            for (ring, x) in self.ring.iter_mut().zip([&*l, &*r]) {
                let at = self.write & self.mask;
                let head = x.len().min(ring.len() - at);
                ring[at..at + head].copy_from_slice(&x[..head]);
                ring[..x.len() - head].copy_from_slice(&x[head..]);
            }
            self.write = self.write.wrapping_add(n);
        }
        if self.frozen {
            self.wash(l, r);
        }
        if self.stuttering {
            self.stutter(l, r);
        }
    }

    fn reset(&mut self) {
        for buffer in self.ring.iter_mut().chain(&mut self.acc) {
            buffer.fill(0.0);
        }
        self.peaks = 0;
        self.head = 0;
        self.cursor = 0;
        self.capture = false;
        // Still engaged, it holds the silence it was just given.
        self.frozen = self.amount > 0.0;
        self.amount_now = self.amount;
        self.stuttering = false;
        self.stutter_gain = 0.0;
        self.slice_pos = 0;
    }

    fn tempo(&mut self, frames_per_beat: f32, beats_per_bar: u32) {
        let bar = frames_per_beat * beats_per_bar.max(1) as f32;
        if bar.is_finite() && bar > 0.0 {
            self.bar = bar;
        }
    }
}
