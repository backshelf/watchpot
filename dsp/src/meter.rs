//! The meters: each bus's peak, RMS and compressor gain reduction and the master's loudness, sent as a `METERS` event about 60 times a
//! second.
//!
//! Peaks and RMS gather over every frame since the last event (bus 0 is the master after the limiter; buses 1 to 15
//! after their faders). Loudness is the master's momentary loudness (ITU-R BS.1770: K-weighted, the two channels'
//! mean squares summed, over 400 ms), read in 40 bins of 10 ms so the window slides without a frame-length ring.

use crate::bus::Buses;
use crate::engine::Events;
use crate::ops::{MAX_BUSES, Meters as MetersEvent};

/// Bins in the loudness window, and their length.
const BINS: usize = 40;
const BIN_S: f32 = 0.010;
/// The fewest frames between two events.
const MIN_GAP: u32 = 735;
/// What silence reads, in LUFS.
const FLOOR_LUFS: f32 = -200.0;

/// A biquad in direct form 1, in f64: the 38 Hz high-pass of the K-weighting needs the precision at 96 kHz.
#[derive(Clone, Copy)]
struct Biquad {
    b: [f64; 3],
    a: [f64; 2],
    x: [f64; 2],
    y: [f64; 2],
}

impl Biquad {
    const fn new(b: [f64; 3], a: [f64; 2]) -> Self {
        Biquad { b, a, x: [0.0; 2], y: [0.0; 2] }
    }

    #[inline]
    fn run(&mut self, x: f64) -> f64 {
        let y = self.b[0] * x + self.b[1] * self.x[0] + self.b[2] * self.x[1] - self.a[0] * self.y[0] - self.a[1] * self.y[1];
        self.x = [x, self.x[0]];
        self.y = [y, self.y[0]];
        y
    }
}

/// The two stages of the K-weighting at `sample_rate`: the head's high shelf and the RLB high-pass, from the
/// analogue prototypes of BS.1770 (the form libebur128 uses), so any sample rate is exact.
fn k_weighting(sample_rate: f64) -> (Biquad, Biquad) {
    let pi = core::f64::consts::PI;
    let (f0, g, q) = (1681.974450955533, 3.999843853973347, 0.7071752369554196);
    let k = (pi * f0 / sample_rate).tan();
    let vh = 10f64.powf(g / 20.0);
    let vb = vh.powf(0.4996667741545416);
    let a0 = 1.0 + k / q + k * k;
    let shelf = Biquad::new(
        [(vh + vb * k / q + k * k) / a0, 2.0 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0],
        [2.0 * (k * k - 1.0) / a0, (1.0 - k / q + k * k) / a0],
    );
    let (f0, q) = (38.13547087602444, 0.5003270373238773);
    let k = (pi * f0 / sample_rate).tan();
    let a0 = 1.0 + k / q + k * k;
    let high_pass = Biquad::new([1.0, -2.0, 1.0], [2.0 * (k * k - 1.0) / a0, (1.0 - k / q + k * k) / a0]);
    (shelf, high_pass)
}

pub struct Meters {
    /// Frames between events.
    every: u32,
    /// Frames gathered since the last event.
    count: u32,
    /// Frames toward the next event, the last one's remainder included.
    clock: u32,
    peak: [f32; MAX_BUSES],
    squares: [f64; MAX_BUSES],
    /// The K-weighting, per channel.
    shelf: [Biquad; 2],
    high_pass: [Biquad; 2],
    bin_frames: u32,
    bin_count: u32,
    bin_sum: f64,
    bins: [f64; BINS],
    bin_at: usize,
    window_sum: f64,
    loudness: f32,
    /// The master's three bands, for the tap: under 150 Hz, between, over 4 kHz. Two one-pole low-passes split the
    /// mono sum; their squares gather between events.
    band_coef: [f32; 2],
    band_state: [f32; 2],
    band_squares: [f64; 3],
    /// Each bus's most gain reduction since the last event, dB.
    reduction: [f32; MAX_BUSES],
}

impl Meters {
    pub fn new(sample_rate: f32) -> Self {
        let (shelf, high_pass) = k_weighting(sample_rate as f64);
        Meters {
            every: ((sample_rate / 60.0).ceil() as u32).max(MIN_GAP),
            count: 0,
            clock: 0,
            peak: [0.0; MAX_BUSES],
            squares: [0.0; MAX_BUSES],
            shelf: [shelf; 2],
            high_pass: [high_pass; 2],
            bin_frames: ((BIN_S * sample_rate).round() as u32).max(1),
            bin_count: 0,
            bin_sum: 0.0,
            bins: [0.0; BINS],
            bin_at: 0,
            window_sum: 0.0,
            loudness: FLOOR_LUFS,
            band_coef: [150.0f32, 4000.0].map(|hz| 1.0 - (-core::f32::consts::TAU * hz / sample_rate.max(8000.0)).exp()),
            band_state: [0.0; 2],
            band_squares: [0.0; 3],
            reduction: [0.0; MAX_BUSES],
        }
    }

    /// The master's momentary loudness as of the last block, in LUFS.
    pub fn loudness(&self) -> f32 {
        self.loudness
    }

    /// Reads one block: the buses as `mix` left them, each bus's most gain reduction in it (`reduction`, dB), and
    /// the master (`l`, `r`) after the limiter, starting at frame `now`. Writes a `METERS` event when one is due.
    pub fn run(
        &mut self,
        buses: &Buses,
        reduction: &[f32; MAX_BUSES],
        l: &[f32],
        r: &[f32],
        now: u64,
        events: &mut Events,
    ) {
        let frames = l.len().min(r.len());
        if frames == 0 {
            return;
        }
        for (most, &now) in self.reduction.iter_mut().zip(reduction) {
            *most = most.max(now);
        }
        self.gather(0, &l[..frames], &r[..frames]);
        for bus in 1..MAX_BUSES {
            if buses.touched(bus) {
                let (bl, br) = buses.output(bus);
                self.gather(bus, &bl[..frames], &br[..frames]);
            }
        }
        self.weigh(&l[..frames], &r[..frames]);
        self.split(&l[..frames], &r[..frames]);
        self.count += frames as u32;
        self.clock += frames as u32;
        if self.clock >= self.every && self.count >= MIN_GAP {
            // The remainder carries, so events average `every` apart, and none comes sooner than `MIN_GAP`.
            self.clock -= self.every;
            let n = 2.0 * self.count as f64;
            events.push(&MetersEvent {
                frame: (now + frames as u64) as u32,
                loudness: self.loudness,
                peak: self.peak,
                rms: core::array::from_fn(|b| (self.squares[b] / n).sqrt() as f32),
                bands: core::array::from_fn(|b| (self.band_squares[b] / self.count as f64).sqrt() as f32),
                reduction: self.reduction,
            });
            self.reduction = [0.0; MAX_BUSES];
            self.band_squares = [0.0; 3];
            self.count = 0;
            self.peak = [0.0; MAX_BUSES];
            self.squares = [0.0; MAX_BUSES];
        }
    }

    fn gather(&mut self, bus: usize, l: &[f32], r: &[f32]) {
        let mut peak = self.peak[bus];
        let mut squares = 0.0f32;
        for (&a, &b) in l.iter().zip(r) {
            peak = peak.max(a.abs()).max(b.abs());
            squares += a * a + b * b;
        }
        self.peak[bus] = peak;
        self.squares[bus] += squares as f64;
    }

    /// Splits the master's mono sum into three bands and gathers each one's squares.
    fn split(&mut self, l: &[f32], r: &[f32]) {
        let [a_low, a_high] = self.band_coef;
        let [mut low, mut mid_low] = self.band_state;
        let mut squares = [0.0f32; 3];
        for (&a, &b) in l.iter().zip(r) {
            let x = 0.5 * (a + b);
            low += a_low * (x - low);
            mid_low += a_high * (x - mid_low);
            let high = x - mid_low;
            let mid = mid_low - low;
            squares[0] += low * low;
            squares[1] += mid * mid;
            squares[2] += high * high;
        }
        // A silent stretch must not leave the filters running on denormals.
        self.band_state = [low, mid_low].map(|s| if s.abs() < 1e-20 { 0.0 } else { s });
        for (sum, s) in self.band_squares.iter_mut().zip(squares) {
            *sum += s as f64;
        }
    }

    /// Feeds the master through the K-weighting into the loudness bins.
    fn weigh(&mut self, l: &[f32], r: &[f32]) {
        let mut i = 0;
        while i < l.len() {
            let n = ((self.bin_frames - self.bin_count) as usize).min(l.len() - i);
            let mut sum = 0.0;
            for j in i..i + n {
                let wl = self.high_pass[0].run(self.shelf[0].run(l[j] as f64));
                let wr = self.high_pass[1].run(self.shelf[1].run(r[j] as f64));
                sum += wl * wl + wr * wr;
            }
            self.bin_sum += sum;
            self.bin_count += n as u32;
            i += n;
            if self.bin_count == self.bin_frames {
                self.window_sum += self.bin_sum - self.bins[self.bin_at];
                self.bins[self.bin_at] = self.bin_sum;
                self.bin_at = (self.bin_at + 1) % BINS;
                if self.bin_at == 0 {
                    self.window_sum = self.bins.iter().sum();
                }
                self.bin_sum = 0.0;
                self.bin_count = 0;
                let mean = self.window_sum.max(0.0) / (BINS as f64 * self.bin_frames as f64);
                self.loudness = if mean > 1e-20 { (-0.691 + 10.0 * mean.log10()) as f32 } else { FLOOR_LUFS };
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A 1 kHz sine at -20 dBFS peak, in both channels, reads close to -20 LUFS (+3 dB for two channels, -3 dB
    /// for a sine's RMS, and the K-weighting is near 0 dB at 1 kHz).
    #[test]
    fn a_reference_tone_reads_its_loudness() {
        for rate in [44100.0f32, 48000.0, 96000.0] {
            let mut m = Meters::new(rate);
            let tone: Vec<f32> = (0..rate as usize)
                .map(|i| (i as f32 * core::f32::consts::TAU * 1000.0 / rate).sin() * 0.1)
                .collect();
            m.weigh(&tone, &tone);
            assert!((m.loudness() - -20.0).abs() < 0.5, "{} at {rate}", m.loudness());
        }
    }

    #[test]
    fn the_reduction_is_the_most_since_the_last_event_not_the_last_blocks() {
        use crate::ops::Record;
        let mut m = Meters::new(48000.0);
        let buses = Buses::new(48000.0);
        let mut events = Events::new();
        let mut sent = Vec::new();
        let silence = [0.0f32; 128];
        for b in 0..40u64 {
            let mut reduction = [0.0; MAX_BUSES];
            // One block of 9 dB on bus 4 just after the first event, then 1 dB.
            reduction[4] = if b == 7 { 9.0 } else if b > 7 { 1.0 } else { 0.0 };
            events.clear();
            m.run(&buses, &reduction, &silence, &silence, b * 128, &mut events);
            if let Some(e) = MetersEvent::read(events.bytes()) {
                sent.push(e.reduction);
            }
        }
        assert!(sent.len() >= 3);
        assert_eq!(sent[0], [0.0; MAX_BUSES]);
        assert_eq!(sent[1][4], 9.0);
        assert_eq!(sent[2][4], 1.0);
        assert!(sent.iter().all(|r| r.iter().enumerate().all(|(b, v)| b == 4 || *v == 0.0)));
    }

    #[test]
    fn silence_reads_the_floor() {
        let mut m = Meters::new(48000.0);
        m.weigh(&[0.0; 4800], &[0.0; 4800]);
        assert_eq!(m.loudness(), FLOOR_LUFS);
    }
}
