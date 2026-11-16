//! The babble voice: syllables handed over by the main thread, spoken as a carrier shaped by two formants and a
//! consonant's burst of noise.
//!
//! A voice's carrier is a buzz (a band-limited narrow pulse train at 140 Hz, the motor's pulses: every harmonic for
//! the formants to pick from) or, when `BABBLE_DEFINE` names one, a sample looped whole (read at its own rate, mono). A syllable plays the
//! carrier at its `pitch` ratio through two band-pass resonances at its formants (Q from each formant's bandwidth:
//! 90 Hz for the first, 120 Hz for the second, held to 2..12), with `noise` of a high-passed (3 kHz) burst at its
//! head (30 ms, or 40% of a short syllable, falling away). Its loudness rises over about 5 ms and falls over the
//! last 30% of its length (40 ms at most). Pitch glides 20 ms and the formants 15 ms from one syllable to the next,
//! so a line runs together; a syllable after silence starts where it is asked to.
//!
//! Syllables arrive one record each on the frame they start (`say` is called inside the block that contains it);
//! each answers with a `STEP` (`step_source::BABBLE`, `track` the voice, `index` the syllable) on that frame. A
//! syllable that starts while another sounds takes over from it. A voice holds up to 16 waiting syllables.
//!
//! A sample carrier is looked up in the table each block, so its memory is never read after it is freed; once
//! `release_sample` names a carrier the voice has played, it speaks on the buzz until it is defined again.

use crate::bus::Buses;
use crate::engine::Events;
use crate::fx::svf::Stage;
use crate::gens::{Rng, poly_blep};
use crate::math::{PI, finite_or, ms_to_frames, one_pole, pan_gains};
use crate::ops::{BABBLES, BabbleDefine, BabbleSay, BabbleStop, MAX_BLOCK, Step, step_source};
use crate::sample::SampleTable;

/// The buzz's pitch at a ratio of 1, and its pulses' share of a period (narrow, as a glottis: every harmonic up to
/// the seventh is strong, and no low one is missing).
const BUZZ_HZ: f32 = 140.0;
const BUZZ_DUTY: f32 = 0.13;
const QUEUE: usize = 16;
const ATTACK_S: f32 = 0.005;
const RELEASE_S: f32 = 0.012;
const FADE_SHARE: f32 = 0.3;
const FADE_MAX_MS: f32 = 40.0;
const BURST_MS: f32 = 30.0;
const BURST_SHARE: f32 = 0.4;
const BURST_HZ: f32 = 3000.0;
const PITCH_GLIDE_S: f32 = 0.020;
const FORMANT_GLIDE_S: f32 = 0.015;
/// The formants' bandwidths in Hz, and the second formant's share of the mix.
const BW1: f32 = 90.0;
const BW2: f32 = 120.0;
const F2_MIX: f32 = 0.6;
/// Brings the formant-filtered buzz up to about the carrier's own loudness.
const MAKEUP: f32 = 2.0;

#[derive(Clone, Copy, Default)]
struct Syllable {
    at: u64,
    line: u32,
    index: u32,
    length: u32,
    pitch: f32,
    f1: f32,
    f2: f32,
    noise: f32,
    level: f32,
}

struct Voice {
    defined: bool,
    sample: u32,
    /// The sample carrier has been found in the table at least once.
    held: bool,
    bus: u32,
    gl: f32,
    gr: f32,
    send_bus: u32,
    send: f32,
    queue: [Syllable; QUEUE],
    queued: usize,
    current: Option<Syllable>,
    elapsed: u32,
    stopped: Option<u32>,
    // The sound.
    phase: f32,
    pos: f64,
    pitch: f32,
    f1: f32,
    f2: f32,
    env: f32,
    burst_left: u32,
    burst_len: u32,
    burst_amp: f32,
    st1: Stage,
    st2: Stage,
    st_noise: Stage,
    rng: Rng,
}

impl Voice {
    fn new(seed: u32) -> Self {
        Voice {
            defined: false,
            sample: 0,
            held: false,
            bus: 0,
            gl: 0.0,
            gr: 0.0,
            send_bus: 0,
            send: 0.0,
            queue: [Syllable::default(); QUEUE],
            queued: 0,
            current: None,
            elapsed: 0,
            stopped: None,
            phase: 0.0,
            pos: 0.0,
            pitch: 1.0,
            f1: 700.0,
            f2: 1200.0,
            env: 0.0,
            burst_left: 0,
            burst_len: 1,
            burst_amp: 0.0,
            st1: Stage::default(),
            st2: Stage::default(),
            st_noise: Stage::default(),
            rng: Rng::new(seed),
        }
    }

    fn dropped(&self, line: u32) -> bool {
        self.stopped.is_some_and(|s| line <= s)
    }
}

pub struct Babble {
    sample_rate: f32,
    voices: Vec<Voice>,
    scratch: Vec<f32>,
    attack: f32,
    release: f32,
    pitch_glide: f32,
    formant_glide: f32,
}

impl Babble {
    pub fn new(sample_rate: f32) -> Self {
        Babble {
            sample_rate,
            voices: (0..BABBLES as u32).map(|i| Voice::new(0xBABB + i)).collect(),
            scratch: vec![0.0; MAX_BLOCK],
            attack: one_pole(ATTACK_S, sample_rate),
            release: one_pole(RELEASE_S, sample_rate),
            pitch_glide: one_pole(PITCH_GLIDE_S, sample_rate),
            // The formants move once a block.
            formant_glide: one_pole(FORMANT_GLIDE_S, sample_rate / MAX_BLOCK as f32),
        }
    }

    /// `BABBLE_DEFINE`: a voice's bus and carrier (a looped sample, or a pulse motor for sample 0).
    pub fn define(&mut self, b: &BabbleDefine, _samples: &SampleTable) {
        let Some(v) = self.voices.get_mut(b.babble as usize) else { return };
        let gain = finite_or(b.gain, 0.0).clamp(0.0, 16.0);
        let (l, r) = pan_gains(b.pan);
        v.defined = true;
        v.sample = b.sample;
        v.held = false;
        v.pos = 0.0;
        v.bus = b.bus;
        v.gl = l * gain;
        v.gr = r * gain;
        v.send_bus = b.send_bus1;
        v.send = finite_or(b.send1, 0.0).clamp(0.0, 4.0);
    }

    /// `BABBLE_SAY`: one syllable, starting on frame `at` (inside the block being rendered). A syllable of a line
    /// that was stopped is dropped.
    pub fn say(&mut self, s: &BabbleSay, at: u64) {
        let Some(v) = self.voices.get_mut(s.babble as usize) else { return };
        if !v.defined || v.dropped(s.line) || s.length == 0 || v.queued == QUEUE {
            return;
        }
        let syllable = Syllable {
            at,
            line: s.line,
            index: s.index,
            length: s.length,
            pitch: finite_or(s.pitch, 1.0).clamp(0.05, 16.0),
            f1: finite_or(s.formant1, 700.0).clamp(50.0, 8000.0),
            f2: finite_or(s.formant2, 1200.0).clamp(50.0, 12000.0),
            noise: finite_or(s.noise, 0.0).clamp(0.0, 1.0),
            level: finite_or(s.level, 1.0).clamp(0.0, 4.0),
        };
        // Kept in order of their frames.
        let mut i = v.queued;
        while i > 0 && v.queue[i - 1].at > at {
            v.queue[i] = v.queue[i - 1];
            i -= 1;
        }
        v.queue[i] = syllable;
        v.queued += 1;
    }

    /// `BABBLE_STOP`: ends the line being said; later syllables of it and of earlier lines are dropped.
    pub fn stop(&mut self, s: &BabbleStop) {
        let Some(v) = self.voices.get_mut(s.babble as usize) else { return };
        v.stopped = Some(v.stopped.map_or(s.line, |l| l.max(s.line)));
        let mut kept = 0;
        for i in 0..v.queued {
            if !v.dropped(v.queue[i].line) {
                v.queue[kept] = v.queue[i];
                kept += 1;
            }
        }
        v.queued = kept;
        if v.current.is_some_and(|c| v.dropped(c.line)) {
            v.current = None;
            v.burst_left = 0;
        }
    }

    /// Sample `sample` is being freed or replaced: a voice carried by it falls back to the motor now.
    pub fn release_sample(&mut self, sample: u32) {
        for v in &mut self.voices {
            if v.sample == sample && v.held {
                v.sample = 0;
                v.held = false;
            }
        }
    }

    /// Adds every voice's block into its bus and send, and writes a `STEP` (`step_source::BABBLE`) for each
    /// syllable that starts in it. After the buses are cleared, before the voices render.
    pub fn run(&mut self, samples: &SampleTable, buses: &mut Buses, now: u64, frames: usize, events: &mut Events) {
        let n = frames.min(MAX_BLOCK);
        if n == 0 {
            return;
        }
        let fs = self.sample_rate;
        for (track, v) in self.voices.iter_mut().enumerate() {
            if !v.defined || (v.current.is_none() && v.queued == 0 && v.env < 1e-5) {
                v.env = 0.0;
                continue;
            }
            let carrier = if v.sample != 0 { samples.get(v.sample) } else { None };
            if carrier.is_some() {
                v.held = true;
            }
            // The formants glide once a block, toward what the syllable sounding at its start asks for.
            if let Some(c) = v.current {
                v.f1 += self.formant_glide * (c.f1 - v.f1);
                v.f2 += self.formant_glide * (c.f2 - v.f2);
            }
            let top = 0.45 * fs;
            let coef = |f: f32, bw: f32| {
                let f = f.min(top);
                ((PI * f / fs).tan(), 1.0 / (f / bw).clamp(2.0, 12.0))
            };
            let (g1, k1) = coef(v.f1, BW1);
            let (g2, k2) = coef(v.f2, BW2);
            let g_noise = (PI * BURST_HZ.min(top) / fs).tan();
            let out = &mut self.scratch[..n];
            for (i, s) in out.iter_mut().enumerate() {
                let frame = now + i as u64;
                while v.queued > 0 && v.queue[0].at <= frame {
                    let next = v.queue[0];
                    v.queue.copy_within(1..v.queued, 0);
                    v.queued -= 1;
                    let track = track as u32;
                    events.push(&Step { frame: frame as u32, source: step_source::BABBLE, track, index: next.index });
                    if v.env < 1e-3 {
                        // From silence a syllable starts where it is asked to.
                        v.pitch = next.pitch;
                        v.f1 = next.f1;
                        v.f2 = next.f2;
                    }
                    v.current = Some(next);
                    v.elapsed = 0;
                    v.burst_len = (ms_to_frames(BURST_MS, fs)).min(((next.length as f32 * BURST_SHARE) as u32).max(1));
                    v.burst_left = if next.noise > 0.0 { v.burst_len } else { 0 };
                    v.burst_amp = next.noise * next.level;
                }
                let mut target = 0.0;
                let mut want_pitch = v.pitch;
                if let Some(c) = v.current {
                    let fade = ((c.length as f32 * FADE_SHARE) as u32).min(ms_to_frames(FADE_MAX_MS, fs));
                    if v.elapsed < c.length.saturating_sub(fade) {
                        target = c.level;
                    }
                    want_pitch = c.pitch;
                    v.elapsed += 1;
                    if v.elapsed >= c.length {
                        v.current = None;
                    }
                }
                let c = if target > v.env { self.attack } else { self.release };
                v.env += c * (target - v.env);
                v.pitch += self.pitch_glide * (want_pitch - v.pitch);
                // The carrier.
                let x = match carrier {
                    Some(smp) if smp.frames > 1 => {
                        let data = smp.data();
                        let len = smp.frames as usize;
                        let ch = smp.channels as usize;
                        let at = v.pos as usize % len;
                        let t = (v.pos - v.pos.floor()) as f32;
                        let b = (at + 1) % len;
                        let read = |k: usize| {
                            if ch == 2 {
                                (data[2 * k] as f32 + data[2 * k + 1] as f32) * (0.5 / 32768.0)
                            } else {
                                data[k] as f32 * (1.0 / 32768.0)
                            }
                        };
                        let y = read(at) + (read(b) - read(at)) * t;
                        v.pos += (smp.rate / fs * v.pitch) as f64;
                        if v.pos >= len as f64 {
                            v.pos -= len as f64 * (v.pos / len as f64).floor();
                        }
                        y
                    }
                    _ => {
                        let dt = (BUZZ_HZ * v.pitch / fs).min(0.5);
                        v.phase += dt;
                        if v.phase >= 1.0 {
                            v.phase -= 1.0;
                        }
                        let t = v.phase;
                        let mut tf = t - BUZZ_DUTY;
                        if tf < 0.0 {
                            tf += 1.0;
                        }
                        let pulse = if t < BUZZ_DUTY { 1.0 } else { 0.0 };
                        2.0 * (pulse + 0.5 * poly_blep(t, dt) - 0.5 * poly_blep(tf, dt) - BUZZ_DUTY)
                    }
                };
                let b1 = v.st1.tick(x, g1, k1).1 * k1;
                let b2 = v.st2.tick(x, g2, k2).1 * k2;
                let mut y = (b1 + F2_MIX * b2) * MAKEUP * v.env;
                if v.burst_left > 0 {
                    let fall = v.burst_left as f32 / v.burst_len as f32;
                    v.burst_left -= 1;
                    let hiss = v.st_noise.tick(v.rng.bipolar(), g_noise, core::f32::consts::SQRT_2).2;
                    y += hiss * v.burst_amp * fall * fall;
                }
                *s = y;
            }
            v.st1.flush();
            v.st2.flush();
            v.st_noise.flush();
            let (bl, br) = buses.input(v.bus as usize);
            for ((l, r), s) in bl.iter_mut().zip(br.iter_mut()).zip(out.iter()) {
                *l += s * v.gl;
                *r += s * v.gr;
            }
            if v.send > 0.0 {
                let (gl, gr) = (v.gl * v.send, v.gr * v.send);
                let (bl, br) = buses.input(v.send_bus as usize);
                for ((l, r), s) in bl.iter_mut().zip(br.iter_mut()).zip(out.iter()) {
                    *l += s * gl;
                    *r += s * gr;
                }
            }
        }
    }
}
