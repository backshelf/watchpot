//! The stereo delay: a time in seconds, or in beats (of the transport, or of a tempo of its own when it is given
//! one), feedback through a low-pass in the loop, ping-pong, and a dry/wet mix.
//!
//! A time change crossfades from the old tap to the new one over 30 ms, so a moved time is heard as the echoes
//! jumping, not as a pitch swoop; a change that arrives mid-fade waits for the fade and then fades to the latest
//! time. With `glide` set, the time instead travels (a 150 ms one-pole) and the tap is read between samples, so the
//! echoes bend in pitch as it moves, the way a tape delay does. Ping-pong sends the input's mono sum into the left
//! line and crosses the feedback between the lines; it glides in over 20 ms rather than clicking.
//!
//! Defaults (before any `FX_SET`): time 0.25 s, beats 0 (off), tempo 0 (the transport's), feedback 0.35, loop filter 6 kHz,
//! ping-pong off, glide off, mix 0.25.
//!
//! Ranges: time 1 ms to 4 s (`MAX_SECONDS`); beats 0 to 16, as a time held under 4 s; tempo 0 or 20 to 400 bpm;
//! feedback 0 to 0.95; filter 200 Hz to 20 kHz; mix 0..1. The lines are sized for 4 s at construction.

use super::Fx;
use crate::math::{PI, hermite, one_pole};
use crate::ops::fx_param::delay;

/// The longest time, seconds.
pub const MAX_SECONDS: f32 = 4.0;
/// The crossfade between taps, seconds.
const FADE: f32 = 0.03;
/// The glide's time constant, seconds.
const GLIDE: f32 = 0.15;

/// Zero for what would decay into denormals: a dying tail stays cheap.
#[inline]
fn flush(x: f32) -> f32 {
    if x.abs() < 1e-20 { 0.0 } else { x }
}

pub struct Delay {
    sample_rate: f32,
    /// Two lines, `mask + 1` frames each.
    lines: [Vec<f32>; 2],
    mask: usize,
    write: usize,
    time: f32,
    beats: f32,
    tempo: f32,
    /// Frames in a beat of the transport, as last heard.
    beat: f32,
    feedback: f32,
    pingpong: f32,
    glide: bool,
    mix: f32,
    lp_coef: f32,
    /// What the time parameters ask for, frames.
    target: f32,
    /// The tap being read, and the one being faded to (frames).
    tap: f32,
    next_tap: f32,
    /// 0..1 through a crossfade; 0 when none runs.
    fade: f32,
    fade_step: f32,
    glide_coef: f32,
    smooth: f32,
    feedback_now: f32,
    pingpong_now: f32,
    mix_now: f32,
    /// True until the first block: a setting lands at once rather than gliding from the default.
    fresh: bool,
    lp: [f32; 2],
}

impl Delay {
    pub fn new(sample_rate: f32) -> Self {
        let frames = (MAX_SECONDS * sample_rate) as usize + 8;
        let size = frames.next_power_of_two();
        let mut d = Delay {
            sample_rate,
            lines: [vec![0.0; size], vec![0.0; size]],
            mask: size - 1,
            write: 0,
            time: 0.25,
            beats: 0.0,
            tempo: 0.0,
            beat: 0.5 * sample_rate,
            feedback: 0.35,
            pingpong: 0.0,
            glide: false,
            mix: 0.25,
            lp_coef: 0.0,
            target: 0.0,
            tap: 0.0,
            next_tap: 0.0,
            fade: 0.0,
            fade_step: 1.0 / (FADE * sample_rate).max(1.0),
            glide_coef: one_pole(GLIDE, sample_rate),
            smooth: one_pole(0.02, sample_rate),
            feedback_now: 0.35,
            pingpong_now: 0.0,
            mix_now: 0.25,
            fresh: true,
            lp: [0.0; 2],
        };
        d.set(delay::FILTER, 6000.0);
        d.retime();
        d.tap = d.target;
        d.next_tap = d.target;
        d
    }

    fn retime(&mut self) {
        let frames = if self.beats <= 0.0 {
            self.time * self.sample_rate
        } else if self.tempo > 0.0 {
            self.beats * 60.0 / self.tempo * self.sample_rate
        } else {
            self.beats * self.beat
        };
        self.target = frames.clamp(0.001 * self.sample_rate, MAX_SECONDS * self.sample_rate);
    }

    /// Reads line `ch` `back` frames behind the write head (fractional).
    #[inline]
    fn read(&self, ch: usize, back: f32) -> f32 {
        let line = &self.lines[ch];
        let pos = self.write as f32 - back;
        let base = pos.floor();
        let t = pos - base;
        let i = base as isize as usize;
        let m = self.mask;
        hermite(line[i.wrapping_sub(1) & m], line[i & m], line[i.wrapping_add(1) & m], line[i.wrapping_add(2) & m], t)
    }
}

impl Fx for Delay {
    fn set(&mut self, param: u16, value: f32) {
        match param {
            delay::TIME => self.time = value,
            delay::BEATS => self.beats = value.clamp(0.0, 16.0),
            delay::TEMPO => self.tempo = if value > 0.0 { value.clamp(20.0, 400.0) } else { 0.0 },
            delay::FEEDBACK => self.feedback = value.clamp(0.0, 0.95),
            delay::FILTER => {
                let fc = value.clamp(200.0, 20000.0).min(0.45 * self.sample_rate);
                self.lp_coef = 1.0 - (-2.0 * PI * fc / self.sample_rate).exp();
            }
            delay::PINGPONG => self.pingpong = if value >= 0.5 { 1.0 } else { 0.0 },
            delay::GLIDE => self.glide = value >= 0.5,
            delay::MIX => self.mix = value.clamp(0.0, 1.0),
            _ => return,
        }
        self.retime();
        if self.fresh {
            self.feedback_now = self.feedback;
            self.pingpong_now = self.pingpong;
            self.mix_now = self.mix;
            self.tap = self.target;
            self.next_tap = self.target;
        }
    }

    fn tempo(&mut self, frames_per_beat: f32, _beats_per_bar: u32) {
        if !(frames_per_beat.is_finite() && frames_per_beat > 0.0) {
            return;
        }
        self.beat = frames_per_beat;
        self.retime();
        if self.fresh {
            self.tap = self.target;
            self.next_tap = self.target;
        }
    }

    fn process(&mut self, l: &mut [f32], r: &mut [f32], _key: Option<(&[f32], &[f32])>) {
        self.fresh = false;
        let n = l.len().min(r.len());
        for i in 0..n {
            // Where the tap is.
            if self.glide {
                self.fade = 0.0;
                self.tap += self.glide_coef * (self.target - self.tap);
                self.next_tap = self.tap;
            } else if self.fade == 0.0 && (self.target - self.tap).abs() >= 0.5 {
                self.next_tap = self.target;
                self.fade = self.fade_step;
            }
            let (mut wl, mut wr) = (self.read(0, self.tap), self.read(1, self.tap));
            if self.fade > 0.0 {
                let (nl, nr) = (self.read(0, self.next_tap), self.read(1, self.next_tap));
                // Equal-gain: the taps are the same signal, a moment apart.
                wl += self.fade * (nl - wl);
                wr += self.fade * (nr - wr);
                self.fade += self.fade_step;
                if self.fade >= 1.0 {
                    self.fade = 0.0;
                    self.tap = self.next_tap;
                }
            }

            self.feedback_now += self.smooth * (self.feedback - self.feedback_now);
            self.pingpong_now += self.smooth * (self.pingpong - self.pingpong_now);
            self.mix_now += self.smooth * (self.mix - self.mix_now);
            let p = self.pingpong_now;

            // The loop's filter, on what comes back.
            self.lp[0] += self.lp_coef * (wl - self.lp[0]);
            self.lp[1] += self.lp_coef * (wr - self.lp[1]);
            let (fl, fr) = (self.lp[0], self.lp[1]);

            let (dl, dr) = (l[i], r[i]);
            let mono = 0.5 * (dl + dr);
            let back_l = fl + p * (fr - fl);
            let back_r = fr + p * (fl - fr);
            let in_l = dl + p * (mono - dl);
            let in_r = dr * (1.0 - p);
            let w = self.write;
            self.lines[0][w] = flush(in_l + self.feedback_now * back_l);
            self.lines[1][w] = flush(in_r + self.feedback_now * back_r);
            self.write = (w + 1) & self.mask;

            let m = self.mix_now;
            l[i] = dl + m * (wl - dl);
            r[i] = dr + m * (wr - dr);
        }
        for v in &mut self.lp {
            if v.abs() < 1e-20 {
                *v = 0.0;
            }
        }
    }

    fn reset(&mut self) {
        for line in &mut self.lines {
            line.fill(0.0);
        }
        self.lp = [0.0; 2];
        self.fade = 0.0;
        self.tap = self.target;
        self.next_tap = self.target;
    }
}
