//! The modelled sources and the babble voice, by measurement: the motor's pitch and aliases, a sweep with no
//! seam, the modal bank's ring, shaped noise's band and gate, three syllables as three peaks on their frames, what
//! sixteen generators cost, and that none of it allocates once built.
//!
//! Assertions are ranges, orderings and invariants, never exact samples.

use watchpot_dsp::Engine;
use watchpot_dsp::gens::modal::Modal;
use watchpot_dsp::gens::motor::Motor;
use watchpot_dsp::gens::noise::Noise;
use watchpot_dsp::ops::{
    BabbleDefine, BabbleSay, BabbleStop, GenSet, GenStart, GenStop, MAX_BLOCK, Record, Step, gen_kind, gen_param,
    step_source,
};
use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;
use std::f64::consts::TAU;
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

/// Renders `frames` of a mono source a block at a time.
fn render(frames: usize, mut block: impl FnMut(&mut [f32]) -> bool) -> Vec<f32> {
    let mut out = vec![0.0; frames];
    for chunk in out.chunks_mut(MAX_BLOCK) {
        if !block(chunk) {
            chunk.fill(0.0);
        }
    }
    out
}

/// The magnitude of `x` at `hz` under a four-term Blackman-Harris window (sidelobes near -92 dB), normalised so a
/// sine of amplitude 1 reads about 1.
fn magnitude(x: &[f32], hz: f64, rate: f32) -> f64 {
    let n = x.len();
    let w = TAU * hz / rate as f64;
    let (mut re, mut im, mut sum) = (0.0f64, 0.0f64, 0.0f64);
    for (i, s) in x.iter().enumerate() {
        let t = TAU * i as f64 / (n - 1) as f64;
        let win = 0.35875 - 0.48829 * t.cos() + 0.14128 * (2.0 * t).cos() - 0.01168 * (3.0 * t).cos();
        sum += win;
        let a = w * i as f64;
        re += *s as f64 * win * a.cos();
        im -= *s as f64 * win * a.sin();
    }
    2.0 * (re * re + im * im).sqrt() / sum
}

fn db(x: f64) -> f64 {
    20.0 * x.max(1e-15).log10()
}

fn rms(x: &[f32]) -> f32 {
    (x.iter().map(|s| (*s as f64) * (*s as f64)).sum::<f64>() / x.len().max(1) as f64).sqrt() as f32
}

fn peak(x: &[f32]) -> f32 {
    x.iter().fold(0.0f32, |m, s| m.max(s.abs()))
}

/// The frequency of the strongest component of `x` between `lo` and `hi`, to a tenth of a hertz.
fn strongest(x: &[f32], lo: f64, hi: f64, rate: f32) -> f64 {
    let mut best = (lo, 0.0);
    let mut f = lo;
    while f <= hi {
        let m = magnitude(x, f, rate);
        if m > best.1 {
            best = (f, m);
        }
        f += 0.1;
    }
    best.0
}

fn motor(rate: f32, params: &[(u32, f32)]) -> Motor {
    let mut m = Motor::new(rate);
    m.reset(7);
    for &(p, v) in params {
        m.set(p, v, 0);
    }
    m
}

#[test]
fn the_motor_at_440_has_its_fundamental_there_and_its_aliases_far_down() {
    for rate in [44100.0f32, 48000.0, 96000.0] {
        let mut m = motor(rate, &[(gen_param::motor::RATE, 440.0), (gen_param::motor::LEVEL, 1.0)]);
        let x = render(rate as usize, |b| m.render(b));
        let x = &x[rate as usize / 4..rate as usize / 4 + 16384];
        let f0 = strongest(x, 400.0, 480.0, rate);
        assert!((f0 - 440.0).abs() < 4.4, "{rate}: fundamental {f0}");
        let fund = magnitude(x, 440.0, rate);
        let at_1500 = db(magnitude(x, 1500.0, rate) / fund);
        // The worst component off the harmonics, 50 Hz to 10 kHz.
        let mut worst = -300.0f64;
        let mut f = 50.0f64;
        while f < 10000.0 {
            let k = (f / 440.0).round();
            if (f - k * 440.0).abs() > 25.0 {
                worst = worst.max(db(magnitude(x, f, rate) / fund));
            }
            f += 5.0;
        }
        println!("motor at 440, {rate} Hz: fundamental {f0:.1} Hz; at 1500 Hz {at_1500:.1} dB; worst alias {worst:.1} dB");
        assert!(at_1500 < -50.0, "{rate}: {at_1500} dB at 1500 Hz");
        if rate >= 48000.0 {
            assert!(worst < -50.0, "{rate}: worst alias {worst} dB");
        }
    }
}

#[test]
fn sweeping_the_rate_from_a_rhythm_to_a_pitch_has_no_seam() {
    let mut m = motor(RATE, &[(gen_param::motor::RATE, 5.0), (gen_param::motor::LEVEL, 1.0)]);
    let warm = render(4800, |b| m.render(b));
    m.set(gen_param::motor::RATE, 500.0, 2 * RATE as u32);
    let x = render(3 * RATE as usize, |b| m.render(b));
    let mut worst = 0.0f32;
    let mut prev = *warm.last().unwrap();
    for &s in &x {
        worst = worst.max((s - prev).abs());
        prev = s;
    }
    println!("rate 5 to 500 over 2 s: the largest step between samples is {worst:.3}");
    assert!(worst < 0.5, "{worst}");
    assert!(x.iter().all(|s| s.is_finite()));
    // It did move: a pitch at the end, near 500.
    let end = &x[2 * RATE as usize + 4800..2 * RATE as usize + 4800 + 16384];
    let f = strongest(end, 450.0, 550.0, RATE);
    assert!((f - 500.0).abs() < 5.0, "{f}");
}

#[test]
fn a_rate_set_without_a_slew_still_glides() {
    use gen_param::motor as p;
    // The bodies low and wide, so each pulse's falling edge is a plain step down to count.
    let mut m = motor(RATE, &[(p::RATE, 100.0), (p::BODY1, 20.0), (p::BODY1_Q, 0.3), (p::BODY2, 20.0), (p::BODY2_Q, 0.3)]);
    render(4800, |b| m.render(b));
    m.set(p::RATE, 1000.0, 0);
    let x = render(48000, |b| m.render(b));
    let edges = |from: usize| (from..from + 480).filter(|&i| x[i] - x[i - 1] < -0.08 && x[i - 1] - x[i - 2] >= -0.08).count();
    // A jump would put ten pulses in the first 10 ms; the glide puts two or three there.
    let (early, late) = (edges(2), edges(9600));
    assert!(early <= 4, "{early} pulses in the first 10 ms");
    assert!((9..=11).contains(&late), "{late} pulses in 10 ms at 1000 a second");
}

#[test]
fn load_brings_a_sub_harmonic_an_octave_under() {
    let sub = |load: f32| {
        let mut m = motor(RATE, &[(gen_param::motor::RATE, 400.0), (gen_param::motor::LOAD, load)]);
        let x = render(48000, |b| m.render(b));
        let x = &x[12000..12000 + 16384];
        db(magnitude(x, 200.0, RATE) / magnitude(x, 400.0, RATE))
    };
    let (clean, loaded) = (sub(0.0), sub(1.0));
    assert!(clean < -60.0, "{clean}");
    assert!(loaded > -30.0, "{loaded}");
}

fn bank(modes: &[(f32, f32, f32)]) -> Modal {
    let mut b = Modal::new(RATE);
    b.reset(3);
    for (i, &(f, d, g)) in modes.iter().enumerate() {
        let at = gen_param::modal::MODE + 3 * i as u32;
        b.set(at, f, 0);
        b.set(at + 1, d, 0);
        b.set(at + 2, g, 0);
    }
    b
}

#[test]
fn a_strike_decays_to_60_db_down_within_twice_its_longest_decay() {
    let modes = [(300.0, 0.8, 1.0), (750.0, 0.5, 0.7), (1800.0, 0.3, 0.5)];
    for strike in [1.0f32, -1.0] {
        let mut b = bank(&modes);
        assert!((b.longest_decay() - 0.8).abs() < 1e-6);
        b.set(gen_param::modal::STRIKE, strike, 0);
        let x = render(2 * RATE as usize, |blk| b.render(blk));
        let window = 2400;
        let at = |s: f32| {
            let i = (s * RATE) as usize;
            peak(&x[i..i + window])
        };
        let first = peak(&x[..window]);
        let half = db((at(0.4) / first) as f64);
        let twice = db((at(1.6 - 0.05) / first) as f64);
        println!("strike {strike}: peak {first:.3}; at half the longest decay {half:.1} dB; at twice it {twice:.1} dB");
        assert!(first > 0.1, "{first}");
        // It rings as long as it is asked to, and is gone by twice that.
        assert!(half > -40.0, "{half}");
        assert!(twice < -60.0, "{twice}");
    }
}

#[test]
fn damp_shortens_the_ring_and_size_lowers_the_pitch() {
    let ring = |damp: f32, size: f32| {
        let mut b = bank(&[(500.0, 1.0, 1.0)]);
        b.set(gen_param::modal::DAMP, damp, 0);
        b.set(gen_param::modal::SIZE, size, 0);
        b.set(gen_param::modal::STRIKE, 1.0, 0);
        render(RATE as usize, |blk| b.render(blk))
    };
    let plain = ring(1.0, 1.0);
    let damped = ring(2.0, 1.0);
    let i = (0.5 * RATE) as usize;
    // At half a second the plain mode is 30 dB down, the damped one 60.
    let fall = db((peak(&damped[i..i + 2400]) / peak(&plain[i..i + 2400])) as f64);
    assert!((fall + 30.0).abs() < 3.0, "{fall}");
    let big = ring(1.0, 2.0);
    let f = strongest(&big[..16384], 200.0, 300.0, RATE);
    assert!((f - 250.0).abs() < 2.0, "{f}");
}

#[test]
fn a_rung_out_bank_is_silent_and_the_first_mode_set_replaces_the_preset() {
    let mut b = Modal::new(RATE);
    b.reset(1);
    let mut blk = vec![0.0; MAX_BLOCK];
    assert!(!b.render(&mut blk), "a bank nobody struck renders nothing");
    // The preset bar rings near 440 Hz.
    b.set(gen_param::modal::STRIKE, 1.0, 0);
    let x = render(16384, |blk| b.render(blk));
    assert!((strongest(&x, 400.0, 480.0, RATE) - 440.0).abs() < 2.0);
    let mut b = bank(&[(1000.0, 0.5, 1.0)]);
    b.set(gen_param::modal::STRIKE, 1.0, 0);
    let x = render(16384, |blk| b.render(blk));
    assert!(magnitude(&x, 440.0, RATE) < 1e-3 * magnitude(&x, 1000.0, RATE));
    // Rung out, it stops rendering.
    render(RATE as usize * 2, |blk| b.render(blk));
    assert!(!b.render(&mut blk));
}

#[test]
fn shaped_noise_keeps_to_its_band_and_its_gate() {
    let noise = |params: &[(u32, f32)]| {
        let mut n = Noise::new(RATE);
        n.reset(9);
        for &(p, v) in params {
            n.set(p, v, 0);
        }
        render(RATE as usize, |b| n.render(b))
    };
    use gen_param::noise as p;
    let band = noise(&[(p::COLOR, 0.0), (p::CENTRE, 4000.0), (p::WIDTH, 1000.0), (p::LEVEL, 1.0)]);
    let tail = &band[4800..];
    let inside = magnitude(tail, 4000.0, RATE);
    let low = magnitude(tail, 500.0, RATE);
    let high = magnitude(tail, 12000.0, RATE);
    assert!(db(low / inside) < -20.0 && db(high / inside) < -20.0, "{} {}", db(low / inside), db(high / inside));

    // Ten bursts a second, half open: the open halves are loud and the shut ones near silent.
    let gated = noise(&[(p::GRID, 10.0), (p::DUTY, 0.5), (p::LEVEL, 1.0)]);
    let burst = 4800;
    let (mut open, mut shut) = (0.0f32, 0.0f32);
    for k in 2..9 {
        let at = k * burst;
        open += rms(&gated[at + 600..at + burst / 2 - 600]);
        shut += rms(&gated[at + burst / 2 + 600..at + burst - 600]);
    }
    assert!(shut < 0.01 * open, "{shut} vs {open}");

    // Pink leans to the lows, white does not; a tilt up leans to the highs.
    let lean = |x: &[f32]| db(magnitude(&x[4800..], 300.0, RATE) / magnitude(&x[4800..], 3000.0, RATE));
    let wide = [(p::CENTRE, 5000.0), (p::WIDTH, 10000.0)];
    let white = lean(&noise(&[wide[0], wide[1], (p::COLOR, 0.0)]));
    let pink = lean(&noise(&[wide[0], wide[1], (p::COLOR, 1.0)]));
    let tilted = lean(&noise(&[wide[0], wide[1], (p::COLOR, 0.0), (p::TILT, 4.0)]));
    assert!(pink > white + 5.0, "{pink} {white}");
    assert!(tilted < white - 10.0, "{tilted} {white}");
}

fn steps(events: &[u8]) -> Vec<Step> {
    let mut out = Vec::new();
    let mut at = 0;
    while at + 4 <= events.len() {
        let op = u16::from_le_bytes([events[at], events[at + 1]]);
        let len = u16::from_le_bytes([events[at + 2], events[at + 3]]) as usize;
        if len < 4 {
            break;
        }
        if op == Step::OP
            && let Some(s) = Step::read(&events[at..at + len])
        {
            out.push(s);
        }
        at += len;
    }
    out
}

fn say(babble: u32, line: u32, index: u32, at_frame: u32, length: u32) -> Vec<u8> {
    BabbleSay {
        at_frame,
        babble,
        line,
        index,
        length,
        pitch: 1.0 + 0.1 * index as f32,
        formant1: [700.0, 400.0, 300.0][index as usize % 3],
        formant2: [1200.0, 2000.0, 2300.0][index as usize % 3],
        noise: 0.3,
        level: 0.8,
    }
    .bytes()
    .to_vec()
}

fn babble_engine(sample: u32) -> Engine {
    let mut e = Engine::new(RATE, 8);
    e.command(&BabbleDefine { at_frame: 0, babble: 2, sample, bus: 0, gain: 0.5, pan: 0.0, send_bus1: 0, send1: 0.0 }.bytes());
    e
}

#[test]
fn three_syllables_are_three_peaks_on_their_frames() {
    let starts = [4800u32, 14400, 24000];
    let length = 4800u32;
    for sample in [0u32, 1] {
        let mut e = babble_engine(sample);
        if sample == 1 {
            // A carrier recording: a buzzy tone, looped.
            let pcm: Vec<i16> =
                (0..4800).map(|i| (((i as f32 * 0.02).sin() + 0.5 * (i as f32 * 0.11).sin()) * 12000.0) as i16).collect();
            e.load_sample(1, &pcm, 1, RATE);
        }
        for (i, &at) in starts.iter().enumerate() {
            e.command(&say(2, 1, i as u32, at, length));
        }
        let out = e.render(36000);
        let st = steps(&out.events);
        assert_eq!(st.len(), 3, "carrier {sample}");
        for (i, s) in st.iter().enumerate() {
            assert_eq!((s.frame, s.source, s.track, s.index), (starts[i], step_source::BABBLE, 2, i as u32));
        }
        // Energy in 5 ms windows: each syllable rises to a peak inside its own span, and the gaps fall quiet.
        let win = 240;
        let env: Vec<f32> = out.l.chunks(win).map(rms).collect();
        let loudest = env.iter().cloned().fold(0.0, f32::max);
        println!("babble, carrier {sample}: loudest 5 ms RMS {loudest:.3}, peak {:.3} (gain 0.5, level 0.8)", peak(&out.l));
        assert!(loudest > 0.02, "carrier {sample}: {loudest}");
        for (i, &at) in starts.iter().enumerate() {
            let (a, b) = (at as usize / win, (at + length) as usize / win);
            let (top, top_at) = env[a..b + 2].iter().enumerate().fold((0.0f32, 0), |m, (k, v)| if *v > m.0 { (*v, k + a) } else { m });
            assert!(top > 0.3 * loudest, "carrier {sample}, syllable {i}: {top}");
            assert!(top_at * win >= at as usize && top_at * win < (at + length) as usize, "syllable {i} peaks at {}", top_at * win);
            // It rises within 15 ms of its frame (the limiter's 5 ms included).
            let onset = (a..b).find(|&k| env[k] > 0.5 * top).unwrap() * win;
            assert!(onset < at as usize + 720, "syllable {i} rises at {onset}, asked for {at}");
            // Before it, the voice is quiet.
            let gap = &env[a - 8..a - 2];
            assert!(gap.iter().all(|v| *v < 0.05 * top), "carrier {sample}: before syllable {i}: {gap:?}");
        }
    }
}

#[test]
fn a_stopped_line_drops_what_it_had_left_to_say() {
    let mut e = babble_engine(0);
    for (i, at) in [960u32, 9600, 19200].iter().enumerate() {
        e.command(&say(2, 4, i as u32, *at, 4800));
    }
    let first = e.render(4800);
    e.command(&BabbleStop { at_frame: 0, babble: 2, line: 4 }.bytes());
    let rest = e.render(28800);
    assert_eq!(steps(&first.events).len(), 1);
    assert!(steps(&rest.events).is_empty());
    assert!(rms(&rest.l[4800..]) < 1e-4);
    // A later line is heard.
    e.command(&say(2, 5, 0, 0, 4800));
    let next = e.render(4800);
    assert_eq!(steps(&next.events).len(), 1);
    assert!(rms(&next.l) > 0.01);
}

fn gen_start(slot: u32, kind: u32, bus: u32) -> Vec<u8> {
    GenStart { at_frame: 0, slot, kind, bus, gain: 0.1, pan: 0.0, send_bus1: 0, send1: 0.0, send_bus2: 0, send2: 0.0, seed: slot + 1 }
        .bytes()
        .to_vec()
}

fn gen_set(slot: u32, param: u32, value: f32, slew: u32) -> Vec<u8> {
    GenSet { at_frame: 0, slot, param, value, slew }.bytes().to_vec()
}

#[test]
fn a_stopped_generator_fades_over_its_release_and_ends() {
    let mut e = Engine::new(RATE, 8);
    e.command(&GenStart { gain: 1.0, ..GenStart::read(&gen_start(3, gen_kind::NOISE, 0)).unwrap() }.bytes());
    let on = e.render(9600);
    assert!(rms(&on.l[4800..]) > 0.005);
    assert_eq!(e.gens.active(), 1);
    e.command(&GenStop { at_frame: 0, slot: 3, release: 4800 }.bytes());
    let off = e.render(9600);
    assert!(rms(&off.l[..1200]) > rms(&off.l[3600..4800]));
    assert!(rms(&off.l[5400..]) < 1e-6);
    assert_eq!(e.gens.active(), 0);
}

/// Sixteen generators, a third of each kind, the banks struck four times a second.
fn sixteen(e: &mut Engine) {
    for slot in 0..16u32 {
        let kind = [gen_kind::MOTOR, gen_kind::NOISE, gen_kind::MODAL][slot as usize % 3];
        e.command(&gen_start(slot, kind, slot % 4));
        match kind {
            gen_kind::MOTOR => {
                e.command(&gen_set(slot, gen_param::motor::RATE, 30.0 + 40.0 * slot as f32, 0));
                e.command(&gen_set(slot, gen_param::motor::LOAD, 0.5, 0));
            }
            gen_kind::NOISE => e.command(&gen_set(slot, gen_param::noise::GRID, 8.0, 0)),
            _ => {
                for i in 0..12u32 {
                    let at = gen_param::modal::MODE + 3 * i;
                    e.command(&gen_set(slot, at, 200.0 * (i + 1) as f32 * 1.13, 0));
                    e.command(&gen_set(slot, at + 1, 2.0, 0));
                    e.command(&gen_set(slot, at + 2, 0.5, 0));
                }
            }
        }
    }
}

#[test]
fn sixteen_generators_cost_a_small_part_of_realtime() {
    let mut e = Engine::new(RATE, 8);
    sixteen(&mut e);
    let blocks = 10 * RATE as usize / MAX_BLOCK;
    let mut spent = 0.0;
    for k in 0..blocks {
        if k % 94 == 0 {
            for slot in (2..16u32).step_by(3) {
                e.command(&gen_set(slot, gen_param::modal::STRIKE, if k % 188 == 0 { 0.8 } else { -0.8 }, 0));
            }
            e.command(&gen_set(0, gen_param::motor::RATE, 20.0 + (k % 700) as f32, 4800));
        }
        let t = Instant::now();
        e.process(MAX_BLOCK);
        spent += t.elapsed().as_secs_f64();
    }
    let share = spent / 10.0;
    println!("16 generators, 10 s natively: {spent:.3} s, {share:.4} of realtime");
    assert_eq!(e.gens.active(), 16);
    assert!(share < 0.1, "{share}");
}

#[test]
fn nothing_allocates_once_built() {
    let mut e = Engine::new(RATE, 8);
    e.load_sample(1, &vec![1000i16; 4800], 1, RATE);
    // Warm up every path once.
    sixteen(&mut e);
    e.command(&BabbleDefine { at_frame: 0, babble: 0, sample: 1, bus: 1, gain: 0.5, pan: 0.0, send_bus1: 2, send1: 0.3 }.bytes());
    e.command(&say(0, 1, 0, 0, 2400));
    for _ in 0..40 {
        e.process(MAX_BLOCK);
    }
    let before = allocations();
    for k in 0..400u32 {
        let mut cmds = Vec::new();
        if k % 50 == 0 {
            cmds.extend(gen_set(2, gen_param::modal::STRIKE, -0.5, 0));
            cmds.extend(gen_set(0, gen_param::motor::RATE, 100.0 + k as f32, 960));
            cmds.extend(say(0, 1 + k / 100, k, 0, 2400));
            cmds.extend(BabbleDefine { at_frame: 0, babble: 1, sample: 0, bus: 0, gain: 0.5, pan: 0.0, send_bus1: 0, send1: 0.0 }.bytes());
            cmds.extend(say(1, 1, k, 0, 1200));
            cmds.extend(GenStop { at_frame: 0, slot: 5, release: 480 }.bytes());
            cmds.extend(gen_start(5, gen_kind::NOISE, 1));
        }
        if k == 200 {
            cmds.extend(BabbleStop { at_frame: 0, babble: 0, line: 2 }.bytes());
        }
        // The command vector is built here, outside the count.
        let mark = allocations();
        e.command(&cmds);
        e.process(MAX_BLOCK);
        let after = allocations();
        assert_eq!(after, mark, "block {k} allocated");
        drop(cmds);
    }
    assert!(allocations() >= before);
}
