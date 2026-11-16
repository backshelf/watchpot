//! Space, natively: the FFT, the convolver, the morphing reverb and the place of a voice, driven directly.
//!
//! Assertions are ranges, orderings and invariants, never exact samples. The test binary counts allocations per
//! thread, so a test can prove `process` and `set` allocate nothing.

use watchpot_dsp::fft::Fft;
use watchpot_dsp::fx::Fx;
use watchpot_dsp::fx::conv::{Conv, PART};
use watchpot_dsp::fx::fdn::Fdn;
use watchpot_dsp::ops::{MAX_BLOCK, fx_param, space_mode};
use watchpot_dsp::space::Place;
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

/// Uniform noise in -1..1 from a seed.
fn noise(frames: usize, seed: u32) -> Vec<f32> {
    let mut s = seed.max(1);
    (0..frames)
        .map(|_| {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            s as f32 / u32::MAX as f32 * 2.0 - 1.0
        })
        .collect()
}

/// Runs a unit over a stereo signal in engine-sized blocks, in place.
fn run(unit: &mut dyn Fx, l: &mut [f32], r: &mut [f32]) {
    for (bl, br) in l.chunks_mut(MAX_BLOCK).zip(r.chunks_mut(MAX_BLOCK)) {
        unit.process(bl, br, None);
    }
}

fn impulse(frames: usize, at: usize) -> Vec<f32> {
    let mut x = vec![0.0; frames];
    x[at] = 1.0;
    x
}

fn argmax(x: &[f32]) -> usize {
    (0..x.len()).max_by(|&a, &b| x[a].abs().total_cmp(&x[b].abs())).unwrap()
}

fn rms(x: &[f32]) -> f32 {
    (x.iter().map(|s| s * s).sum::<f32>() / x.len().max(1) as f32).sqrt()
}

fn peak(x: &[f32]) -> f32 {
    x.iter().fold(0.0, |m, s| m.max(s.abs()))
}

#[test]
fn the_fft_then_its_inverse_returns_the_input_at_every_size() {
    for n in [256, 512, 1024, 2048, 4096] {
        let fft = Fft::new(n);
        let x = noise(n, n as u32);
        let mut y = x.clone();
        fft.forward(&mut y);
        fft.inverse(&mut y);
        let err = x.iter().zip(&y).fold(0.0f32, |m, (a, b)| m.max((a - b).abs()));
        assert!(err < 1e-5, "n {n}: {err}");
    }
}

#[test]
fn the_fft_agrees_with_a_plain_dft() {
    let n = 256;
    let fft = Fft::new(n);
    let x = noise(n, 7);
    let mut y = x.clone();
    fft.forward(&mut y);
    for k in [0usize, 1, 17, 64, 127, 128] {
        let (mut re, mut im) = (0.0f64, 0.0f64);
        for (i, &s) in x.iter().enumerate() {
            let a = -std::f64::consts::TAU * (k * i) as f64 / n as f64;
            re += s as f64 * a.cos();
            im += s as f64 * a.sin();
        }
        let (gr, gi) = match k {
            0 => (y[0], 0.0),
            128 => (y[1], 0.0),
            _ => (y[2 * k], y[2 * k + 1]),
        };
        assert!((gr as f64 - re).abs() < 1e-3 && (gi as f64 - im).abs() < 1e-3, "bin {k}: {gr} {gi} vs {re} {im}");
    }
}

#[test]
fn an_impulse_through_a_unit_response_comes_out_exactly_the_latency_later() {
    assert_eq!(Conv::latency(), 256);
    for rate in [44100.0, 48000.0, 96000.0] {
        let mut c = Conv::new(rate);
        c.ir(&[32767], 1, rate);
        let mut l = impulse(2048, 37);
        let mut r = impulse(2048, 37);
        run(&mut c, &mut l, &mut r);
        for x in [&l, &r] {
            assert_eq!(argmax(x), 37 + PART, "at {rate}");
            assert!((x[37 + PART] - 1.0).abs() < 1e-4, "{}", x[37 + PART]);
            let rest = x.iter().enumerate().filter(|(i, _)| *i != 37 + PART).fold(0.0f32, |m, (_, s)| m.max(s.abs()));
            assert!(rest < 1e-5, "{rest}");
        }
    }
}

#[test]
fn the_convolver_matches_a_plain_convolution_with_its_normalised_response() {
    let ir: Vec<i16> = noise(1000, 3).iter().enumerate().map(|(i, s)| (s * 20000.0 * (-(i as f32) / 300.0).exp()) as i16).collect();
    let h: Vec<f32> = ir.iter().map(|&s| s as f32 / 32768.0).collect();
    let scale = 1.0 / h.iter().map(|s| s * s).sum::<f32>().sqrt();
    let mut c = Conv::new(RATE);
    c.ir(&ir, 1, RATE);
    let x = noise(4096, 11);
    let (mut l, mut r) = (x.clone(), x.clone());
    run(&mut c, &mut l, &mut r);
    for n in (PART..x.len()).step_by(37) {
        let want: f32 = (0..h.len().min(n - PART + 1)).map(|k| h[k] * scale * x[n - PART - k]).sum();
        assert!((l[n] - want).abs() < 1e-3, "{n}: {} vs {want}", l[n]);
    }
}

#[test]
fn a_stereo_response_keeps_its_sides_and_one_at_another_rate_is_resampled() {
    // Left: an impulse; right: an impulse 100 frames later, both at 96 kHz into a 48 kHz convolver.
    let mut ir = vec![0i16; 2 * 400];
    ir[0] = 32767;
    ir[2 * 200 + 1] = 32767;
    let mut c = Conv::new(RATE);
    c.ir(&ir, 2, 96000.0);
    let (mut l, mut r) = (impulse(2048, 0), impulse(2048, 0));
    run(&mut c, &mut l, &mut r);
    assert_eq!(argmax(&l), PART);
    assert_eq!(argmax(&r), PART + 100);
}

#[test]
fn swapping_the_response_crossfades_rather_than_steps() {
    let mut c = Conv::new(RATE);
    c.ir(&[32767], 1, RATE);
    let tone = |i: usize| 0.5 * (i as f32 * core::f32::consts::TAU * 200.0 / RATE).sin();
    let frames = 9600;
    let mut l: Vec<f32> = (0..frames).map(tone).collect();
    let mut r = l.clone();
    let (a, b) = l.split_at_mut(4800);
    let (ra, rb) = r.split_at_mut(4800);
    run(&mut c, a, ra);
    // The same room upside down: an abrupt swap would jump by the tone's whole height.
    c.ir(&[-32767], 1, RATE);
    run(&mut c, b, rb);
    let step = l.windows(2).skip(1000).fold(0.0f32, |m, w| m.max((w[1] - w[0]).abs()));
    assert!(step < 0.03, "{step}");
    assert!((l[frames - 1] + tone(frames - 1 - PART)).abs() < 1e-3);
}

/// The time the impulse response's backward-integrated energy takes from -5 to -25 dB, times three.
fn decay_time(unit: &mut dyn Fx, seconds: f32) -> f32 {
    let frames = (seconds * RATE) as usize;
    let mut l = impulse(frames, 0);
    let mut r = impulse(frames, 0);
    run(unit, &mut l, &mut r);
    let mut tail = vec![0.0f64; frames + 1];
    for i in (0..frames).rev() {
        tail[i] = tail[i + 1] + (l[i] as f64).powi(2) + (r[i] as f64).powi(2);
    }
    let db = |i: usize| 10.0 * (tail[i] / tail[0]).log10();
    let at = |level: f64| (0..frames).find(|&i| db(i) < level).unwrap_or(frames);
    3.0 * (at(-25.0) - at(-5.0)) as f32 / RATE
}

fn reverb(size: f32) -> Fdn {
    let mut f = Fdn::new(RATE);
    f.set(fx_param::fdn::SIZE, size);
    f.set(fx_param::fdn::EARLY, 0.0);
    f.reset();
    f
}

#[test]
fn a_small_room_decays_sooner_than_a_large_one_and_near_its_stated_time() {
    let mut small = reverb(0.2);
    let mut large = reverb(0.8);
    let (want_small, want_large) = (small.rt60(), large.rt60());
    let t_small = decay_time(&mut small, 3.0);
    let t_large = decay_time(&mut large, 6.0);
    println!("decay at size 0.2: {t_small:.2} s (stated {want_small:.2}); at 0.8: {t_large:.2} s (stated {want_large:.2})");
    assert!(t_small < 0.5 * t_large);
    assert!(t_small > 0.6 * want_small && t_small < 1.4 * want_small);
    assert!(t_large > 0.6 * want_large && t_large < 1.4 * want_large);
}

#[test]
fn the_reverb_carries_about_the_energy_that_went_in() {
    for size in [0.0, 0.5, 1.0] {
        let mut f = reverb(size);
        let frames = (2.0 * f.rt60() * RATE) as usize;
        let (mut l, mut r) = (impulse(frames, 0), impulse(frames, 0));
        run(&mut f, &mut l, &mut r);
        let energy: f32 = l.iter().map(|s| s * s).sum();
        assert!(energy > 0.4 && energy < 2.5, "size {size}: {energy}");
    }
}

#[test]
fn sweeping_the_size_through_noise_never_passes_four_times_the_input_peak() {
    for rate in [44100.0, 48000.0, 96000.0] {
        for decay in [2.0, 30.0] {
            let mut f = Fdn::new(rate);
            f.set(fx_param::fdn::DECAY, decay);
            let frames = 2 * rate as usize;
            let (mut l, mut r) = (noise(frames, 5), noise(frames, 9));
            let input = peak(&l).max(peak(&r));
            // Across the whole range in 100 ms, a block at a time, back and forth.
            let sweep = 0.1 * rate / MAX_BLOCK as f32;
            let mut out = 0.0f32;
            for (k, (bl, br)) in l.chunks_mut(MAX_BLOCK).zip(r.chunks_mut(MAX_BLOCK)).enumerate() {
                let phase = (k as f32 / sweep) % 2.0;
                f.set(fx_param::fdn::SIZE, if phase < 1.0 { phase } else { 2.0 - phase });
                f.process(bl, br, None);
                out = out.max(peak(bl)).max(peak(br));
            }
            assert!(out.is_finite() && out < 4.0 * input, "{rate} Hz, decay {decay}: {out}");
            assert!(out > 0.05);
        }
    }
}

#[test]
fn the_reverb_falls_silent_after_its_input_and_reset_clears_it() {
    let mut f = Fdn::new(RATE);
    f.set(fx_param::fdn::DECAY, 0.3);
    f.set(fx_param::fdn::SIZE, 0.2);
    let (mut l, mut r) = (noise(4800, 1), noise(4800, 2));
    run(&mut f, &mut l, &mut r);
    let (mut l, mut r) = (vec![0.0; 96000], vec![0.0; 96000]);
    run(&mut f, &mut l, &mut r);
    assert!(peak(&l[90000..]) < 1e-6);
    let (mut l, mut r) = (noise(4800, 3), noise(4800, 4));
    run(&mut f, &mut l, &mut r);
    f.reset();
    let (mut l, mut r) = (vec![0.0; 512], vec![0.0; 512]);
    run(&mut f, &mut l, &mut r);
    assert_eq!(peak(&l), 0.0);
}

#[test]
fn a_voice_at_pan_one_in_headphones_reaches_the_left_ear_25_to_32_frames_late() {
    let onset = |x: &[f32]| x.iter().position(|s| s.abs() > 1e-6).unwrap();
    for pan in [1.0f32, -1.0] {
        let mut p = Place::new(RATE);
        p.set(pan, 0.0, 0.0, 0);
        let mut l = vec![0.0; MAX_BLOCK];
        let mut r = vec![0.0; MAX_BLOCK];
        l[10] = 0.707;
        r[10] = 0.707;
        p.process(space_mode::HEADPHONES, &mut l, &mut r);
        let (near, far) = if pan > 0.0 { (&r, &l) } else { (&l, &r) };
        let late = onset(far) - onset(near);
        assert!((25..=32).contains(&late), "pan {pan}: {late}");
        assert!(rms(far) < rms(near));
    }
    // At 96 kHz the delay is the same time, twice the frames.
    let mut p = Place::new(96000.0);
    p.set(1.0, 0.0, 0.0, 0);
    let (mut l, mut r) = (impulse(MAX_BLOCK, 0), impulse(MAX_BLOCK, 0));
    p.process(space_mode::HEADPHONES, &mut l, &mut r);
    let late = l.iter().position(|s| s.abs() > 1e-6).unwrap();
    assert!((50..=64).contains(&late), "{late}");
}

/// The level and the brightness (the RMS of the first difference over the RMS) of a placed block of noise.
fn placed(mode: u32, distance: f32, occlusion: f32) -> (f32, f32) {
    let mut p = Place::new(RATE);
    p.set(0.0, distance, occlusion, 0);
    let x: Vec<f32> = noise(9600, 21).iter().map(|s| s * 0.707).collect();
    let (mut l, mut r) = (x.clone(), x);
    let mut lift = 0.0;
    for (bl, br) in l.chunks_mut(MAX_BLOCK).zip(r.chunks_mut(MAX_BLOCK)) {
        lift = p.process(mode, bl, br);
    }
    let diff: Vec<f32> = l.windows(2).map(|w| w[1] - w[0]).collect();
    assert!(lift >= 0.0 && (distance == 0.0) == (lift == 0.0));
    (rms(&l), rms(&diff) / rms(&l))
}

#[test]
fn a_far_or_occluded_voice_is_quieter_and_darker_in_both_modes() {
    for mode in [space_mode::SPEAKERS, space_mode::HEADPHONES] {
        let (near, near_bright) = placed(mode, 0.0, 0.0);
        let (far, far_bright) = placed(mode, 1.0, 0.0);
        let (hidden, hidden_bright) = placed(mode, 0.0, 1.0);
        assert!((near / rms(&noise(9600, 21)) - 0.707).abs() < 0.01, "the centre is unity: {near}");
        // 18 dB down for the level, more for the noise's highs.
        assert!(far < near * 0.125 && far > near * 0.03, "{near} {far}");
        assert!(far_bright < 0.6 * near_bright, "{near_bright} {far_bright}");
        assert!(hidden < near * 0.35 && hidden_bright < far_bright);
    }
}

#[test]
fn a_moving_place_glides_without_a_step() {
    let mut p = Place::new(RATE);
    p.set(-1.0, 0.0, 0.0, 0);
    let (mut l, mut r) = (vec![0.5; 4800], vec![0.5; 4800]);
    let (al, bl) = l.split_at_mut(960);
    let (ar, br) = r.split_at_mut(960);
    for (x, y) in al.chunks_mut(MAX_BLOCK).zip(ar.chunks_mut(MAX_BLOCK)) {
        p.process(space_mode::SPEAKERS, x, y);
    }
    p.set(1.0, 1.0, 1.0, 0);
    for (x, y) in bl.chunks_mut(MAX_BLOCK).zip(br.chunks_mut(MAX_BLOCK)) {
        p.process(space_mode::SPEAKERS, x, y);
    }
    let step = l.windows(2).chain(r.windows(2)).fold(0.0f32, |m, w| m.max((w[1] - w[0]).abs()));
    assert!(step < 0.01, "{step}");
    assert!(r[4799] < 0.1 && l[4799].abs() < 1e-3);
}

#[test]
fn processing_and_setting_allocate_nothing() {
    let mut f = Fdn::new(RATE);
    let mut c = Conv::new(RATE);
    let ir: Vec<i16> = noise(RATE as usize, 8).iter().map(|s| (s * 10000.0) as i16).collect();
    c.ir(&ir, 1, RATE);
    let mut p = Place::new(RATE);
    let (mut l, mut r) = (noise(MAX_BLOCK, 1), noise(MAX_BLOCK, 2));
    let before = allocations();
    for k in 0..400 {
        let t = (k % 50) as f32 / 50.0;
        for param in 0..8 {
            f.set(param, t);
        }
        c.set(fx_param::conv::MIX, t);
        c.set(fx_param::conv::GAIN, -6.0 * t);
        p.set(2.0 * t - 1.0, t, 1.0 - t, 64);
        f.process(&mut l, &mut r, None);
        c.process(&mut l, &mut r, None);
        p.process(if k % 100 < 50 { space_mode::SPEAKERS } else { space_mode::HEADPHONES }, &mut l, &mut r);
    }
    f.reset();
    c.reset();
    p.reset();
    assert_eq!(allocations(), before);
    assert!(l.iter().chain(&r).all(|s| s.is_finite()));
}

#[test]
fn one_reverb_and_one_two_second_convolver_cost_a_small_part_of_realtime() {
    let seconds = 10.0;
    let frames = (seconds * RATE) as usize;
    let (l0, r0) = (noise(frames, 31), noise(frames, 32));

    let mut f = Fdn::new(RATE);
    let (mut l, mut r) = (l0.clone(), r0.clone());
    let t = Instant::now();
    run(&mut f, &mut l, &mut r);
    let fdn = t.elapsed().as_secs_f64() / seconds as f64;

    let mut c = Conv::new(RATE);
    let ir: Vec<i16> = noise(2 * frames / 10, 33)
        .iter()
        .flat_map(|s| [(s * 9000.0) as i16, (-s * 9000.0) as i16])
        .collect();
    c.ir(&ir, 2, RATE);
    let (mut l, mut r) = (l0, r0);
    let t = Instant::now();
    run(&mut c, &mut l, &mut r);
    let conv = t.elapsed().as_secs_f64() / seconds as f64;

    println!("natively: one reverb {:.4} of realtime; one convolver, 2 s stereo response, {:.4}", fdn, conv);
    assert!(fdn < 0.1 && conv < 0.25, "{fdn} {conv}");
}
