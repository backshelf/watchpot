//! The granulator and the spectral freeze, natively: a cloud through `Engine`, the freeze through the `Fx` trait.
//!
//! Assertions are ranges, orderings and invariants, never exact samples (but for the two things that are exact by
//! design: a seed, and a freeze that is not engaged). The test binary counts allocations per thread, so a test can
//! prove a cloud and a freeze allocate nothing once built.

use watchpot_dsp::Engine;
use watchpot_dsp::fft::Fft;
use watchpot_dsp::freeze::{Freeze, LATENCY};
use watchpot_dsp::fx::Fx;
use watchpot_dsp::grain::MAX_GRAINS;
use watchpot_dsp::ops::fx_param::freeze;
use watchpot_dsp::ops::{FxDefine, FxSet, GrainSet, GrainStart, GrainStop, MAX_BLOCK, Record, SampleFree, curve, fx_kind, grain_param};
use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;
use std::time::Instant;

struct Counting;

thread_local! {
    static ALLOCATIONS: Cell<usize> = const { Cell::new(0) };
}

// SAFETY: forwards to the system allocator; the count is a plain thread-local cell.
unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        ALLOCATIONS.with(|n| n.set(n.get() + 1));
        // SAFETY: the caller's contract.
        unsafe { System.alloc(layout) }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        // SAFETY: the caller's contract.
        unsafe { System.dealloc(ptr, layout) }
    }
}

#[global_allocator]
static COUNTING: Counting = Counting;

fn allocations() -> usize {
    ALLOCATIONS.with(|n| n.get())
}

const RATE: f32 = 48000.0;
const TAU: f32 = core::f32::consts::TAU;

fn tone_pcm(hz: f32, seconds: f32, level: f32, rate: f32) -> Vec<i16> {
    (0..(seconds * rate) as usize).map(|i| ((TAU * hz * i as f32 / rate).sin() * level * 32767.0) as i16).collect()
}

/// A seeded white noise, -1..1.
struct Noise(u32);

impl Noise {
    fn next(&mut self) -> f32 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        (self.0 as i32) as f32 / 2_147_483_648.0
    }
    fn fill(&mut self, frames: usize, level: f32) -> Vec<f32> {
        (0..frames).map(|_| level * self.next()).collect()
    }
}

fn noise_pcm(frames: usize, level: f32) -> Vec<i16> {
    Noise(0x1234_5678).fill(frames, level).iter().map(|s| (s * 32767.0) as i16).collect()
}

fn sine(hz: f32, amp: f32, frames: usize) -> Vec<f32> {
    (0..frames).map(|i| amp * (TAU * hz * i as f32 / RATE).sin()).collect()
}

fn rms(x: &[f32]) -> f32 {
    (x.iter().map(|s| (*s as f64) * (*s as f64)).sum::<f64>() / x.len().max(1) as f64).sqrt() as f32
}

fn db(x: f32) -> f32 {
    20.0 * x.max(1e-12).log10()
}

/// The largest jump between two neighbouring frames.
fn step(x: &[f32]) -> f32 {
    x.windows(2).map(|w| (w[1] - w[0]).abs()).fold(0.0, f32::max)
}

/// The quietest and the loudest stretch of `window` frames, as RMS.
fn span(x: &[f32], window: usize) -> (f32, f32) {
    x.chunks_exact(window).map(rms).fold((f32::INFINITY, 0.0), |(lo, hi), v| (lo.min(v), hi.max(v)))
}

/// The magnitude of `x` at `hz` (a Hann-windowed single-bin DFT).
fn magnitude(x: &[f32], hz: f32, rate: f32) -> f32 {
    let n = x.len();
    let (mut re, mut im) = (0.0f64, 0.0f64);
    for (i, s) in x.iter().enumerate() {
        let w = 0.5 - 0.5 * (std::f64::consts::TAU * i as f64 / n as f64).cos();
        let ph = std::f64::consts::TAU * hz as f64 * i as f64 / rate as f64;
        re += w * *s as f64 * ph.cos();
        im -= w * *s as f64 * ph.sin();
    }
    (re.hypot(im) / n as f64) as f32
}

/// Where the spectrum of `x` peaks, in Hz: the loudest bin of its 4096-point spectrum averaged over every
/// half-overlapped frame, placed between bins by the parabola through it and its neighbours (in the logarithm).
fn peak_hz(x: &[f32], rate: f32) -> f32 {
    let fft = Fft::new(4096);
    let mut power = vec![0.0f32; 2048];
    for chunk in x.windows(4096).step_by(2048) {
        let mut buf: Vec<f32> = chunk.iter().enumerate().map(|(i, s)| s * (0.5 - 0.5 * (TAU * i as f32 / 4096.0).cos())).collect();
        fft.forward(&mut buf);
        for k in 1..2048 {
            power[k] += buf[2 * k] * buf[2 * k] + buf[2 * k + 1] * buf[2 * k + 1];
        }
    }
    let bin = (2..2046).max_by(|a, b| power[*a].total_cmp(&power[*b])).unwrap();
    let [a, b, c] = [power[bin - 1], power[bin], power[bin + 1]].map(|p| p.max(1e-30).ln());
    (bin as f32 + 0.5 * (a - c) / (a - 2.0 * b + c)) * rate / 4096.0
}

/// The last frame of `x` louder than a hundredth of its peak.
fn last_sound(x: &[f32]) -> usize {
    let floor = 0.01 * x.iter().fold(0.0f32, |m, s| m.max(s.abs()));
    x.iter().rposition(|s| s.abs() > floor).unwrap_or(0)
}

fn start(e: &mut Engine, cloud: u32, sample: u32, seed: u32) {
    e.command(&GrainStart { at_frame: 0, cloud, sample, bus: 1, pan: 0.0, send_bus1: 0, send1: 0.0, send_bus2: 0, send2: 0.0, seed }.bytes());
}

fn set(e: &mut Engine, cloud: u32, params: &[(u32, f32)], slew: u32) {
    for &(param, value) in params {
        e.command(&GrainSet { at_frame: 0, cloud, param, value, slew }.bytes());
    }
}

/// An engine holding one mono sample (id 1) with cloud 0 over it at `params`.
fn cloud_at(rate: f32, pcm: &[i16], params: &[(u32, f32)], seed: u32) -> Engine {
    let mut e = Engine::new(rate, 8);
    e.load_sample(1, pcm, 1, rate);
    start(&mut e, 0, 1, seed);
    set(&mut e, 0, params, 0);
    e
}

/// What a mono sample of amplitude `amp` played straight through the centre measures a side, as RMS.
fn centre_rms(amp: f32) -> f32 {
    amp * core::f32::consts::FRAC_1_SQRT_2 * core::f32::consts::FRAC_1_SQRT_2
}

// The granulator.

#[test]
fn a_cloud_at_half_rate_keeps_the_pitch_and_lasts_twice_as_long() {
    let pcm = tone_pcm(440.0, 1.0, 0.5, RATE);
    let mut e = cloud_at(RATE, &pcm, &[(grain_param::RATE, 0.5)], 7);
    let out = e.render(4 * 48000);
    let hz = peak_hz(&out.l[12000..84000], RATE);
    assert!((hz - 440.0).abs() < 0.02 * 440.0, "{hz} Hz");
    let seconds = last_sound(&out.l) as f32 / RATE;
    assert!((1.9..2.3).contains(&seconds), "{seconds} s");
    // As loud as the sample played straight, give or take.
    let level = db(rms(&out.l[12000..84000]) / centre_rms(0.5));
    assert!(level.abs() < 2.0, "{level} dB");

    // At a quarter of the rate and an octave up: twice the pitch, four times as long.
    let mut e = cloud_at(RATE, &pcm, &[(grain_param::RATE, 0.25), (grain_param::PITCH, 2.0)], 7);
    let out = e.render(6 * 48000);
    let hz = peak_hz(&out.l[12000..84000], RATE);
    assert!((hz - 880.0).abs() < 0.02 * 880.0, "{hz} Hz");
    let seconds = last_sound(&out.l) as f32 / RATE;
    assert!((3.8..4.4).contains(&seconds), "{seconds} s");
}

#[test]
fn a_clouds_level_holds_as_density_and_size_move() {
    let level = |pcm: &[i16], params: &[(u32, f32)]| {
        let mut e = cloud_at(RATE, pcm, params, 3);
        e.render(24000);
        db(rms(&e.render(4 * 48000).l))
    };
    let spread = |levels: &[f32]| levels.iter().fold(f32::MIN, |m, v| m.max(*v)) - levels.iter().fold(f32::MAX, |m, v| m.min(*v));

    // A held texture over noise.
    let noise = noise_pcm(96000, 0.5);
    let held = |density: f32, size: f32| {
        level(&noise, &[(grain_param::POSITION, 0.5), (grain_param::SPRAY, 0.2), (grain_param::DENSITY, density), (grain_param::SIZE, size)])
    };
    let by_density = [held(10.0, 100.0), held(20.0, 100.0), held(50.0, 100.0), held(100.0, 100.0)];
    assert!(spread(&by_density) < 2.0, "{by_density:?}");
    let by_size = [held(40.0, 30.0), held(40.0, 100.0), held(40.0, 250.0), held(40.0, 500.0)];
    assert!(spread(&by_size) < 2.0, "{by_size:?}");
    // And as loud as the noise itself (uniform noise of peak 0.5, through the centre).
    let straight = db(centre_rms(0.5) * (2.0f32 / 3.0).sqrt());
    assert!((by_density[2] - straight).abs() < 2.0, "{} against {straight}", by_density[2]);

    // A tone stretched to a quarter of its speed.
    let tone = tone_pcm(440.0, 20.0, 0.5, RATE);
    let stretched = |density: f32| level(&tone, &[(grain_param::RATE, 0.25), (grain_param::DENSITY, density)]);
    let by_density = [stretched(10.0), stretched(30.0), stretched(100.0)];
    assert!(spread(&by_density) < 2.0, "{by_density:?}");
}

#[test]
fn a_sample_played_straight_through_a_cloud_comes_back_whole() {
    let pcm = tone_pcm(440.0, 3.0, 0.5, RATE);
    for density in [20.0, 40.0, 100.0] {
        let mut e = cloud_at(RATE, &pcm, &[(grain_param::RATE, 1.0), (grain_param::DENSITY, density)], 5);
        let out = e.render(2 * 48000);
        let body = &out.l[24000..72000];
        let level = db(rms(body) / centre_rms(0.5));
        assert!(level.abs() < 0.5, "density {density}: {level} dB");
        // Tiled by its windows, it does not flutter.
        let (lo, hi) = span(body, 480);
        assert!(db(hi / lo) < 0.5, "density {density}: {} dB of flutter", db(hi / lo));
        let hz = peak_hz(body, RATE);
        assert!((hz - 440.0).abs() < 2.0, "{hz} Hz");
    }
}

#[test]
fn a_playhead_thrown_about_cuts_no_grain_mid_window() {
    let pcm = tone_pcm(220.0, 2.0, 0.5, RATE);
    let mut e = cloud_at(RATE, &pcm, &[(grain_param::POSITION, 0.1), (grain_param::DENSITY, 80.0)], 11);
    let mut out = Vec::new();
    let mut noise = Noise(99);
    for _ in 0..200 {
        set(&mut e, 0, &[(grain_param::POSITION, 0.5 + 0.45 * noise.next())], 0);
        out.extend(e.render(3 * MAX_BLOCK).l);
    }
    // A 220 Hz tone moves 3% of its amplitude a frame; a grain cut off would step by up to all of it.
    let peak = out.iter().fold(0.0f32, |m, s| m.max(s.abs()));
    assert!(peak > 0.1);
    assert!(step(&out) < 0.08 * peak, "{} of {peak}", step(&out));
    // And every grain started where the playhead had just been put: the cloud keeps sounding.
    let (lo, _) = span(&out[4800..], 4800);
    assert!(lo > 0.05, "{lo}");
}

#[test]
fn a_scrub_follows_its_slew_and_the_rate_runs_on_from_where_it_ends() {
    // A sample whose level says where in it a grain read: silence, then a tone from the middle on.
    let mut pcm = vec![0i16; 48000];
    pcm.extend(tone_pcm(440.0, 1.0, 0.5, RATE));
    let mut e = cloud_at(RATE, &pcm, &[(grain_param::POSITION, 0.0)], 2);
    let quiet = e.render(24000);
    assert!(rms(&quiet.l[2400..]) < 1e-4);
    // Half way there in a second: still in the silence until the slew passes the middle.
    set(&mut e, 0, &[(grain_param::POSITION, 0.75)], 72000);
    let early = e.render(40000);
    let late = e.render(40000);
    assert!(rms(&early.l[..36000]) < 1e-3, "{}", rms(&early.l[..36000]));
    assert!(rms(&late.l[20000..]) > 0.1);
    // Held at 0.75 it goes on sounding; then the rate carries it to the end, and it falls silent.
    let held = e.render(48000);
    assert!(rms(&held.l[24000..]) > 0.1);
    set(&mut e, 0, &[(grain_param::RATE, 1.0)], 0);
    let ran = e.render(96000);
    assert!(rms(&ran.l[..12000]) > 0.1);
    assert!(rms(&ran.l[48000..]) < 1e-4, "{}", rms(&ran.l[48000..]));
    assert_eq!(e.grains.sounding(0), 0);
    // Put back, it sounds again.
    set(&mut e, 0, &[(grain_param::RATE, 0.0), (grain_param::POSITION, 0.6)], 0);
    assert!(rms(&e.render(24000).l[12000..]) > 0.1);
}

#[test]
fn a_cloud_is_its_seed() {
    let pcm = noise_pcm(48000, 0.5);
    let params = [(grain_param::POSITION, 0.5), (grain_param::SPRAY, 0.3), (grain_param::SPREAD, 1.0)];
    let render = |seed: u32| cloud_at(RATE, &pcm, &params, seed).render(24000);
    let (a, b, c) = (render(42), render(42), render(43));
    assert_eq!(a.l, b.l);
    assert_eq!(a.r, b.r);
    assert_ne!(a.l, c.l);
    // Spread throws the grains apart: the sides differ.
    assert_ne!(a.l, a.r);
    let narrow = cloud_at(RATE, &pcm, &params[..2], 42).render(24000);
    assert_eq!(narrow.l, narrow.r);
}

#[test]
fn a_stopped_cloud_fades_over_its_release_or_lets_its_grains_finish() {
    let pcm = tone_pcm(330.0, 2.0, 0.5, RATE);
    let params = [(grain_param::POSITION, 0.3), (grain_param::SIZE, 400.0), (grain_param::DENSITY, 20.0)];

    let mut e = cloud_at(RATE, &pcm, &params, 1);
    e.render(48000);
    e.command(&GrainStop { at_frame: 0, cloud: 0, release: 2400 }.bytes());
    let out = e.render(24000);
    assert!(step(&out.l) < 0.05, "{}", step(&out.l));
    // Gone after the release and the limiter's 5 ms.
    assert!(rms(&out.l[..1200]) > 0.02);
    assert!(rms(&out.l[2400 + 480..]) < 1e-5, "{}", rms(&out.l[2400 + 480..]));
    assert_eq!(e.grains.sounding(0), 0);

    let mut e = cloud_at(RATE, &pcm, &params, 1);
    e.render(48000);
    e.command(&GrainStop { at_frame: 0, cloud: 0, release: 0 }.bytes());
    let out = e.render(48000);
    assert!(step(&out.l) < 0.05);
    // A 400 ms grain that had just begun is still sounding 200 ms on, and done by 400 ms.
    assert!(rms(&out.l[7200..9600]) > 1e-3);
    assert!(rms(&out.l[19200 + 480..]) < 1e-5);
}

#[test]
fn a_start_on_a_cloud_still_sounding_takes_it_over_without_a_click() {
    let low = tone_pcm(110.0, 2.0, 0.5, RATE);
    let high = tone_pcm(1760.0, 2.0, 0.25, RATE);
    for stop in [Some(4800), Some(0), None] {
        let mut e = cloud_at(RATE, &low, &[(grain_param::POSITION, 0.3), (grain_param::SIZE, 200.0)], 1);
        e.load_sample(2, &high, 1, RATE);
        e.render(24000);
        if let Some(release) = stop {
            e.command(&GrainStop { at_frame: 0, cloud: 0, release }.bytes());
            e.render(1280);
        }
        start(&mut e, 0, 2, 9);
        set(&mut e, 0, &[(grain_param::POSITION, 0.5), (grain_param::LEVEL, 0.5)], 0);
        let out = e.render(24000);
        // The low tone moves under 1% of its amplitude a frame and the high one a quarter of its own.
        assert!(step(&out.l) < 0.04, "{stop:?}: {}", step(&out.l));
        // The old cloud is heard out for a moment, then only the new one is left.
        assert!(magnitude(&out.l[..2400], 110.0, RATE) > 0.005, "{stop:?}");
        assert!(magnitude(&out.l[14400..], 110.0, RATE) < 1e-4, "{stop:?}");
        assert!(rms(&out.l[14400..]) > 0.03, "{stop:?}");
    }
}

#[test]
fn a_cloud_whose_sample_is_freed_falls_silent_at_once_and_eight_full_clouds_stay_finite() {
    let pcm = noise_pcm(24000, 0.5);
    let mut e = Engine::new(RATE, 8);
    e.load_sample(1, &pcm, 1, RATE);
    let stereo: Vec<i16> = pcm.iter().flat_map(|s| [*s, s / 2]).collect();
    e.load_sample(2, &stereo, 2, 44100.0);
    for cloud in 0..8 {
        start(&mut e, cloud, 1 + cloud % 2, cloud);
        set(
            &mut e,
            cloud,
            &[
                (grain_param::POSITION, 0.4),
                (grain_param::SPRAY, 0.3),
                (grain_param::SPREAD, 1.0),
                (grain_param::SIZE, 500.0),
                (grain_param::DENSITY, 1000.0),
                // The even clouds read slowly and never run out of sample; the odd ones run off its end.
                (grain_param::PITCH, if cloud % 2 == 0 { 0.25 } else { 16.0 }),
            ],
            0,
        );
    }
    // A ninth cloud, a sample nobody holds and a parameter nobody has are all ignored.
    start(&mut e, 8, 1, 0);
    start(&mut e, 3, 77, 0);
    set(&mut e, 2, &[(99, 1.0), (grain_param::LEVEL, f32::NAN)], 0);
    let out = e.render(48000);
    assert!(out.l.iter().chain(&out.r).all(|s| s.is_finite()));
    assert_eq!(e.grains.sounding(0), MAX_GRAINS);
    assert_eq!(e.grains.sounding(3), 0);

    e.command(&SampleFree { at_frame: 0, sample: 1 }.bytes());
    e.command(&SampleFree { at_frame: 0, sample: 2 }.bytes());
    e.render(MAX_BLOCK);
    assert!((0..8).all(|c| e.grains.sounding(c) == 0));
    let out = e.render(4800);
    assert!(rms(&out.l[480..]) < 1e-6);
}

#[test]
fn a_cloud_sounds_the_same_at_any_engine_rate() {
    for rate in [44100.0, 48000.0, 96000.0] {
        // A sample recorded at 48 kHz, whatever the engine runs at.
        let pcm = tone_pcm(440.0, 2.0, 0.5, 48000.0);
        let mut e = Engine::new(rate, 8);
        e.load_sample(1, &pcm, 1, 48000.0);
        start(&mut e, 0, 1, 4);
        set(&mut e, 0, &[(grain_param::RATE, 0.5)], 0);
        let out = e.render((4.5 * rate) as usize);
        let body = &out.l[(0.5 * rate) as usize..(2.5 * rate) as usize];
        let hz = peak_hz(body, rate);
        assert!((hz - 440.0).abs() < 0.02 * 440.0, "{rate}: {hz} Hz");
        let level = db(rms(body) / centre_rms(0.5));
        assert!(level.abs() < 2.0, "{rate}: {level} dB");
        let seconds = last_sound(&out.l) as f32 / rate;
        assert!((3.8..4.4).contains(&seconds), "{rate}: {seconds} s");
    }
}

#[test]
fn a_cloud_allocates_nothing_once_built_and_a_full_one_costs_a_sliver_of_realtime() {
    let pcm = noise_pcm(96000, 0.3);
    let mut e = Engine::new(RATE, 8);
    e.load_sample(1, &pcm, 1, RATE);
    e.render(MAX_BLOCK);
    // Counted across the blocks only: building a record allocates, taking one does not.
    let mut allocated = 0;
    let mut blocks_of = |e: &mut Engine, blocks: usize| {
        let before = allocations();
        for _ in 0..blocks {
            e.process(MAX_BLOCK);
        }
        allocated += allocations() - before;
    };
    start(&mut e, 0, 1, 1);
    // 64 grains at once: 128 a second, half a second each.
    set(
        &mut e,
        0,
        &[(grain_param::POSITION, 0.5), (grain_param::SPRAY, 0.4), (grain_param::SPREAD, 1.0), (grain_param::SIZE, 500.0), (grain_param::DENSITY, 128.0)],
        0,
    );
    blocks_of(&mut e, 400);
    set(&mut e, 0, &[(grain_param::POSITION, 0.2), (grain_param::PITCH, 1.5)], 4800);
    assert!(e.grains.sounding(0) > 56, "{}", e.grains.sounding(0));
    let blocks = 10 * RATE as usize / MAX_BLOCK;
    let t = Instant::now();
    blocks_of(&mut e, blocks);
    let cloud = t.elapsed().as_secs_f64();
    e.command(&GrainStop { at_frame: 0, cloud: 0, release: 480 }.bytes());
    start(&mut e, 0, 1, 2);
    blocks_of(&mut e, 40);
    e.command(&SampleFree { at_frame: 0, sample: 1 }.bytes());
    blocks_of(&mut e, 4);
    assert_eq!(allocated, 0);

    let mut idle = Engine::new(RATE, 8);
    let t = Instant::now();
    for _ in 0..blocks {
        idle.process(MAX_BLOCK);
    }
    let empty = t.elapsed().as_secs_f64();
    println!("a 64-grain cloud, 10 s natively: {:.4} s ({:.2}% of realtime; the empty engine {:.4} s)", cloud, 10.0 * cloud, empty);
    assert!(cloud < 0.5, "{cloud} s");
}

// The freeze.

/// Runs a unit over `l` and `r` a block at a time, as the rack does.
fn run(unit: &mut dyn Fx, l: &mut [f32], r: &mut [f32]) {
    for (bl, br) in l.chunks_mut(MAX_BLOCK).zip(r.chunks_mut(MAX_BLOCK)) {
        unit.process(bl, br, None);
    }
}

/// Feeds `x` to both sides and returns the left.
fn feed(unit: &mut dyn Fx, x: &[f32]) -> Vec<f32> {
    let (mut l, mut r) = (x.to_vec(), x.to_vec());
    run(unit, &mut l, &mut r);
    l
}

#[test]
fn a_freeze_that_is_not_engaged_passes_its_bus_untouched() {
    assert_eq!(LATENCY, 0);
    let mut unit = Freeze::new(RATE);
    let x = Noise(5).fill(48000, 0.5);
    assert_eq!(feed(&mut unit, &x), x);
    // Told to be at 0, and back at 0 after a hold, it is the bus again: no latency, 0 dB.
    unit.set(freeze::AMOUNT, 0.0);
    assert_eq!(feed(&mut unit, &x), x);
    unit.set(freeze::AMOUNT, 1.0);
    feed(&mut unit, &x);
    unit.set(freeze::AMOUNT, 0.0);
    feed(&mut unit, &x[..9600]);
    assert_eq!(feed(&mut unit, &x), x);
}

#[test]
fn a_frozen_sine_holds_its_level_and_its_pitch_for_five_seconds_after_the_input_stops() {
    for hz in [440.0, 1234.5, 97.0] {
        let mut unit = Freeze::new(RATE);
        let x = sine(hz, 0.5, 48000);
        feed(&mut unit, &x);
        unit.set(freeze::AMOUNT, 1.0);
        let out = feed(&mut unit, &vec![0.0; 5 * 48000 + 4800]);
        let held = &out[4800..];
        let level = db(rms(held) / rms(&x));
        assert!(level.abs() < 3.0, "{hz} Hz: {level} dB");
        // Second by second, and in any 50 ms of it: a hold, not a wobble.
        for second in held.chunks(48000) {
            assert!(db(rms(second) / rms(&x)).abs() < 3.0, "{hz} Hz: {} dB", db(rms(second) / rms(&x)));
        }
        let (lo, hi) = span(held, 2400);
        assert!(db(hi / lo) < 3.0, "{hz} Hz: {} dB between the quietest and loudest 50 ms", db(hi / lo));
        let peak = peak_hz(held, RATE);
        assert!((peak - hz).abs() < 0.01 * hz + 1.0, "{hz} Hz held at {peak} Hz");
    }
}

#[test]
fn a_sustained_sound_runs_into_its_own_wash_without_a_dip_or_a_click() {
    let mut unit = Freeze::new(RATE);
    let x = sine(440.0, 0.5, 96000);
    let mut out = feed(&mut unit, &x[..48000]);
    unit.set(freeze::AMOUNT, 1.0);
    out.extend(feed(&mut unit, &x[48000..]));
    let (lo, hi) = span(&out[43200..57600], 240);
    assert!(db(hi / lo) < 1.0, "{} dB across the engage", db(hi / lo));
    assert!(step(&out) < 1.2 * step(&x), "{} against {}", step(&out), step(&x));
}

#[test]
fn a_freeze_engaged_over_silence_holds_silence() {
    let mut unit = Freeze::new(RATE);
    feed(&mut unit, &vec![0.0; 9600]);
    unit.set(freeze::AMOUNT, 1.0);
    let out = feed(&mut unit, &Noise(8).fill(48000, 0.5));
    assert!(rms(&out[12000..]) < 1e-6, "{}", rms(&out[12000..]));
    // Engaged before it has heard anything at all, the same.
    let mut unit = Freeze::new(RATE);
    unit.set(freeze::AMOUNT, 1.0);
    let out = feed(&mut unit, &Noise(8).fill(48000, 0.5));
    assert_eq!(rms(&out), 0.0);
}

#[test]
fn frozen_noise_holds_its_level_its_colour_and_its_side() {
    // Noise with most of its weight low down, on the left only.
    let mut low = 0.0;
    let x: Vec<f32> = Noise(21)
        .fill(48000, 0.5)
        .iter()
        .map(|s| {
            low += 0.05 * (s - low);
            low * 4.0 + 0.05 * s
        })
        .collect();
    let mut unit = Freeze::new(RATE);
    let (mut l, mut r) = (x.clone(), vec![0.0; 48000]);
    run(&mut unit, &mut l, &mut r);
    unit.set(freeze::AMOUNT, 1.0);
    let (mut l, mut r) = (vec![0.0; 5 * 48000], vec![0.0; 5 * 48000]);
    run(&mut unit, &mut l, &mut r);
    assert_eq!(rms(&r), 0.0);
    // One frame of noise is a rough estimate of it: the hold is within a few dB of the bus and steady from there.
    let level = db(rms(&l[4800..]) / rms(&x));
    assert!(level.abs() < 5.0, "{level} dB");
    let (lo, hi) = span(&l[4800..], 24000);
    assert!(db(hi / lo) < 3.0, "{} dB between half seconds", db(hi / lo));
    let (dark, bright) = (magnitude(&l[48000..96000], 300.0, RATE), magnitude(&l[48000..96000], 9000.0, RATE));
    assert!(rms(&l[48000..52800]) > 0.0 && dark > 0.0);
    let bands = |y: &[f32]| {
        let below: f32 = (1..10).map(|k| magnitude(y, 100.0 * k as f32, RATE).powi(2)).sum();
        let above: f32 = (1..10).map(|k| magnitude(y, 6000.0 + 1000.0 * k as f32, RATE).powi(2)).sum();
        db((below / above).sqrt())
    };
    assert!(bands(&l[48000..72000]) > 12.0, "{} dB, {dark} {bright}", bands(&l[48000..72000]));
}

#[test]
fn amount_crossfades_between_the_bus_and_the_wash_and_a_new_engage_holds_what_is_new() {
    let mut unit = Freeze::new(RATE);
    feed(&mut unit, &sine(440.0, 0.5, 48000));
    // Half way: the held 440 and the live 1 kHz, each at half.
    unit.set(freeze::AMOUNT, 0.5);
    let out = feed(&mut unit, &sine(1000.0, 0.5, 48000));
    let (held, live) = (magnitude(&out[24000..], 440.0, RATE), magnitude(&out[24000..], 1000.0, RATE));
    // (A sine of amplitude A measures A / 4 through the Hann window.)
    assert!((db(live / 0.0625)).abs() < 0.5, "{live}");
    assert!((db(held / 0.0625)).abs() < 3.0, "{held}");
    // Let go and engaged again over the 1 kHz: the 440 is gone.
    unit.set(freeze::AMOUNT, 0.0);
    feed(&mut unit, &sine(1000.0, 0.5, 9600));
    unit.set(freeze::AMOUNT, 1.0);
    let out = feed(&mut unit, &vec![0.0; 48000]);
    assert!(magnitude(&out[24000..], 1000.0, RATE) > 0.08);
    assert!(magnitude(&out[24000..], 440.0, RATE) < 1e-3);
    // A second engage while the first still fades changes what is held without a click.
    unit.set(freeze::AMOUNT, 0.0);
    let live = sine(250.0, 0.5, 48000);
    let mut out = feed(&mut unit, &live[..256]);
    unit.set(freeze::AMOUNT, 1.0);
    out.extend(feed(&mut unit, &live[256..]));
    // A 1 kHz tone of this size moves 0.065 a frame.
    assert!(step(&out) < 0.1, "{}", step(&out));
    // What it holds now is the bus as it was at the second engage (silence, then a breath of 250 Hz): the 1 kHz
    // is gone, and so is the live signal.
    assert!(magnitude(&out[24000..], 1000.0, RATE) < 1e-3);
    assert!(rms(&out[24000..]) < 0.05);
    assert!(out.iter().all(|s| s.is_finite()));
}

#[test]
fn a_stutter_repeats_the_last_slice_of_the_bar_and_lets_go_cleanly() {
    let mut unit = Freeze::new(RATE);
    // 120 bpm in four: a bar is 96,000 frames, an eighth of it 12,000.
    unit.tempo(24000.0, 4);
    let x = Noise(77).fill(4 * 48000, 0.5);
    let before = feed(&mut unit, &x[..48000]);
    assert_eq!(before, &x[..48000]);
    unit.set(freeze::STUTTER, 8.0);
    let out = feed(&mut unit, &x[48000..96000]);
    // After its fade in, each repeat is the 12,000 frames that came before the stutter, but for the seam at its end.
    let seam = 144;
    for repeat in 0..4 {
        let got = &out[repeat * 12000 + 200..(repeat + 1) * 12000 - seam];
        let want = &x[36000 + 200..48000 - seam];
        assert_eq!(got, want, "repeat {repeat}");
    }
    // Sixteenths from the next time round: the last 6,000 frames of the same slice.
    unit.set(freeze::STUTTER, 16.0);
    let out = feed(&mut unit, &x[96000..96000 + 24000]);
    assert_eq!(&out[..12000 - seam], &x[36000..48000 - seam]);
    assert_eq!(&out[12000..18000 - seam], &x[42000..48000 - seam]);
    assert_eq!(&out[18000..24000 - seam], &x[42000..48000 - seam]);
    // Off: back to the bus after a 3 ms fade, and listening again.
    unit.set(freeze::STUTTER, 0.0);
    let live = &x[120000..144000];
    let out = feed(&mut unit, live);
    assert_eq!(&out[200..], &live[200..]);
    unit.set(freeze::STUTTER, 32.0);
    let out = feed(&mut unit, &x[144000..150000]);
    assert_eq!(&out[200..3000 - seam], &x[141000 + 200..144000 - seam]);
}

#[test]
fn a_stutters_seam_is_as_smooth_as_the_bus_and_a_slow_bar_is_halved_to_fit() {
    let mut unit = Freeze::new(RATE);
    unit.tempo(24000.0, 4);
    let x = sine(100.0, 0.5, 48000 + 7);
    feed(&mut unit, &x);
    unit.set(freeze::STUTTER, 32.0);
    let out = feed(&mut unit, &vec![0.0; 48000]);
    assert!(rms(&out[24000..]) > 0.2);
    assert!(step(&out) < 3.0 * step(&x), "{} against {}", step(&out), step(&x));
    unit.set(freeze::STUTTER, 0.0);
    let out = feed(&mut unit, &vec![0.0; 4800]);
    assert!(step(&out) < 3.0 * step(&x));
    assert_eq!(rms(&out[200..]), 0.0);

    // 20 bpm in four: an eighth of a bar is 1.5 s, over the second the unit remembers, so it repeats 0.75 s.
    let mut unit = Freeze::new(RATE);
    unit.tempo(144000.0, 4);
    let x = Noise(3).fill(96000, 0.5);
    feed(&mut unit, &x);
    unit.set(freeze::STUTTER, 8.0);
    let out = feed(&mut unit, &vec![0.0; 96000]);
    assert_eq!(&out[200..30000], &x[96000 - 36000 + 200..96000 - 6000]);
    assert_eq!(&out[36000 + 200..66000], &x[96000 - 36000 + 200..96000 - 6000]);
}

#[test]
fn the_freeze_is_declared_on_a_bus_and_moved_through_the_engine_at_any_rate() {
    for rate in [44100.0, 48000.0, 96000.0] {
        let mut e = Engine::new(rate, 8);
        e.load_sample(1, &tone_pcm(440.0, 1.0, 0.5, rate), 1, rate);
        e.command(&FxDefine { at_frame: 0, bus: 1, slot: 0, kind: fx_kind::FREEZE, key: 0 }.bytes());
        start(&mut e, 0, 1, 1);
        set(&mut e, 0, &[(grain_param::RATE, 1.0)], 0);
        e.render((0.5 * rate) as usize);
        e.command(
            &FxSet { at_frame: 0, bus: 1, slot: 0, param: freeze::AMOUNT as u32, value: 1.0, slew: 0, curve: curve::LIN }.bytes(),
        );
        // The sample runs out half a second on; the bus goes on sounding it.
        let out = e.render((3.0 * rate) as usize);
        let held = &out.l[(1.0 * rate) as usize..];
        let level = db(rms(held) / centre_rms(0.5));
        assert!(level.abs() < 3.0, "{rate}: {level} dB");
        let hz = peak_hz(held, rate);
        assert!((hz - 440.0).abs() < 5.0, "{rate}: {hz} Hz");
        e.command(
            &FxSet { at_frame: 0, bus: 1, slot: 0, param: freeze::AMOUNT as u32, value: 0.0, slew: (0.1 * rate) as u32, curve: curve::LIN }
                .bytes(),
        );
        let out = e.render((0.5 * rate) as usize);
        assert!(rms(&out.l[(0.25 * rate) as usize..]) < 1e-5, "{rate}");
    }
}

#[test]
fn a_freeze_allocates_nothing_once_built_and_costs_a_sliver_of_realtime() {
    let mut unit = Freeze::new(RATE);
    unit.tempo(24000.0, 4);
    let x = Noise(31).fill(10 * 48000, 0.3);
    let (mut l, mut r) = (x.clone(), x.clone());
    let before = allocations();
    run(&mut unit, &mut l[..48000], &mut r[..48000]);
    unit.set(freeze::AMOUNT, 1.0);
    unit.set(freeze::STUTTER, 16.0);
    run(&mut unit, &mut l[..48000], &mut r[..48000]);
    unit.set(freeze::STUTTER, 0.0);
    unit.set(freeze::AMOUNT, 0.0);
    run(&mut unit, &mut l[..48000], &mut r[..48000]);
    unit.set(freeze::AMOUNT, 0.7);
    unit.reset();
    run(&mut unit, &mut l[..48000], &mut r[..48000]);
    assert_eq!(allocations(), before);

    // Ten seconds held over noise: every region of the spectrum turning.
    let mut unit = Freeze::new(RATE);
    run(&mut unit, &mut l[..48000], &mut r[..48000]);
    unit.set(freeze::AMOUNT, 1.0);
    let (mut l, mut r) = (x.clone(), x);
    let t = Instant::now();
    run(&mut unit, &mut l, &mut r);
    let held = t.elapsed().as_secs_f64();
    let mut unit = Freeze::new(RATE);
    let t = Instant::now();
    run(&mut unit, &mut l, &mut r);
    let idle = t.elapsed().as_secs_f64();
    println!("a freeze, 10 s natively: held {:.4} s ({:.2}% of realtime), not engaged {:.4} s ({:.3}%)", held, 10.0 * held, idle, 10.0 * idle);
    assert!(held < 0.5, "{held} s");
}
