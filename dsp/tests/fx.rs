//! The effect units, driven directly through the `Fx` trait: neutral settings pass a sine, the filter's corner is
//! where it is asked to be, noise stays finite at any in-range setting, the compressor ducks to its range on a key,
//! the saturator keeps its aliases down and its loudness level, and the tape stops and starts cleanly.

use watchpot_dsp::fx::comp::Comp;
use watchpot_dsp::fx::crush::Crush;
use watchpot_dsp::fx::stereo::Stereo;
use watchpot_dsp::fx::delay::Delay;
use watchpot_dsp::fx::eq::Eq;
use watchpot_dsp::fx::sat::{self, Sat};
use watchpot_dsp::fx::svf::Svf;
use watchpot_dsp::fx::tape::Tape;
use watchpot_dsp::fx::{Fx, create};
use watchpot_dsp::ops::{fx_kind, fx_param};

const RATE: f32 = 48000.0;
const BLOCK: usize = 128;

fn sine(hz: f32, amp: f32, frames: usize) -> Vec<f32> {
    (0..frames).map(|i| amp * (std::f32::consts::TAU * hz * i as f32 / RATE).sin()).collect()
}

/// Runs a unit over `l` and `r` a block at a time, as the rack does.
fn run(unit: &mut dyn Fx, l: &mut [f32], r: &mut [f32]) {
    for (bl, br) in l.chunks_mut(BLOCK).zip(r.chunks_mut(BLOCK)) {
        unit.process(bl, br, None);
    }
}

fn rms(x: &[f32]) -> f32 {
    (x.iter().map(|s| (*s as f64) * (*s as f64)).sum::<f64>() / x.len().max(1) as f64).sqrt() as f32
}

fn db(x: f32) -> f32 {
    20.0 * x.max(1e-12).log10()
}

/// The steady gain of a unit on a sine, dB: one second in, measured over the second half.
fn sine_gain(unit: &mut dyn Fx, hz: f32, amp: f32) -> f32 {
    let x = sine(hz, amp, 48000);
    let (mut l, mut r) = (x.clone(), x.clone());
    run(unit, &mut l, &mut r);
    db(rms(&l[24000..]) / rms(&x[24000..]))
}

fn set(unit: &mut dyn Fx, params: &[(u16, f32)]) {
    for &(p, v) in params {
        unit.set(p, v);
    }
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
    fn fill(&mut self, frames: usize) -> Vec<f32> {
        (0..frames).map(|_| self.next()).collect()
    }
}

/// The magnitude of `x` at `hz` (a Hann-windowed single-bin DFT).
fn magnitude(x: &[f32], hz: f32) -> f32 {
    let n = x.len();
    let (mut re, mut im) = (0.0f64, 0.0f64);
    for (i, s) in x.iter().enumerate() {
        let w = 0.5 - 0.5 * (std::f64::consts::TAU * i as f64 / n as f64).cos();
        let ph = std::f64::consts::TAU * hz as f64 * i as f64 / RATE as f64;
        re += w * *s as f64 * ph.cos();
        im -= w * *s as f64 * ph.sin();
    }
    (re.hypot(im) / n as f64) as f32
}

#[test]
fn each_unit_at_neutral_settings_passes_a_sine_within_a_tenth_of_a_db() {
    use fx_param::*;
    let cases: Vec<(&str, Box<dyn Fx>, Vec<(u16, f32)>)> = vec![
        ("svf", Box::new(Svf::new(RATE)), vec![]),
        ("eq", Box::new(Eq::new(RATE)), vec![]),
        ("comp", Box::new(Comp::new(RATE)), vec![(comp::RATIO, 1.0)]),
        ("sat", Box::new(Sat::new(RATE)), vec![(sat::DRIVE, 0.0)]),
        ("sat dry", Box::new(Sat::new(RATE)), vec![(sat::MIX, 0.0)]),
        ("delay", Box::new(Delay::new(RATE)), vec![(delay::MIX, 0.0)]),
        ("tape", Box::new(Tape::new(RATE)), vec![(tape::WOW, 0.0), (tape::FLUTTER, 0.0), (tape::HISS, 0.0)]),
        ("crush", Box::new(Crush::new(RATE)), vec![(crush::RATE, RATE), (crush::BITS, 24.0)]),
        ("stereo", Box::new(Stereo::new(RATE)), vec![]),
    ];
    for (name, mut unit, params) in cases {
        set(unit.as_mut(), &params);
        let gain = sine_gain(unit.as_mut(), 1000.0, 0.5);
        assert!(gain.abs() < 0.1, "{name}: {gain} dB");
    }
}

#[test]
fn the_filter_is_three_db_down_within_two_percent_of_its_cutoff() {
    use fx_param::svf;
    for slope in [0.0, 1.0] {
        for fc in [100.0f32, 1000.0, 10000.0] {
            let gain = |hz: f32| {
                let mut f = Svf::new(RATE);
                set(&mut f, &[(svf::CUTOFF, fc), (svf::Q, std::f32::consts::FRAC_1_SQRT_2), (svf::SLOPE, slope)]);
                sine_gain(&mut f, hz, 0.5)
            };
            let (below, above) = (gain(0.98 * fc), gain(1.02 * fc));
            assert!(below > -3.0 && above < -3.0, "slope {slope}, {fc} Hz: {below} {above}");
        }
    }
}

#[test]
fn the_filter_modes_pass_and_stop_where_they_should() {
    use fx_param::svf;
    let gain = |mode: f32, hz: f32| {
        let mut f = Svf::new(RATE);
        set(&mut f, &[(svf::CUTOFF, 1000.0), (svf::Q, 2.0), (svf::MODE, mode), (svf::SLOPE, 1.0)]);
        sine_gain(&mut f, hz, 0.5)
    };
    assert!(gain(0.0, 100.0) > -1.0 && gain(0.0, 8000.0) < -60.0);
    assert!(gain(1.0, 8000.0) > -1.0 && gain(1.0, 100.0) < -60.0);
    assert!(gain(2.0, 1000.0).abs() < 1.0 && gain(2.0, 100.0) < -20.0 && gain(2.0, 8000.0) < -20.0);
    assert!(gain(3.0, 1000.0) < -30.0 && gain(3.0, 100.0) > -1.0 && gain(3.0, 8000.0) > -1.0);
}

#[test]
fn the_filter_stays_stable_when_its_cutoff_moves_every_block() {
    use fx_param::svf;
    let mut f = Svf::new(RATE);
    set(&mut f, &[(svf::Q, 30.0), (svf::SLOPE, 1.0)]);
    let mut noise = Noise(7);
    let (mut l, mut r) = (noise.fill(96000), noise.fill(96000));
    for (k, (bl, br)) in l.chunks_mut(BLOCK).zip(r.chunks_mut(BLOCK)).enumerate() {
        // A 30 Hz square between the ends of the range: the harshest sweep a mod route can write.
        f.set(svf::CUTOFF, if (k / 12) % 2 == 0 { 20.0 } else { 20000.0 });
        f.process(bl, br, None);
    }
    assert!(l.iter().chain(&r).all(|s| s.is_finite()));
    // Stable: with the input gone, it rings down (at 2 kHz, where a Q of 30 rings for milliseconds, not seconds).
    f.set(svf::CUTOFF, 2000.0);
    let (mut l, mut r) = (vec![0.0f32; 48000], vec![0.0f32; 48000]);
    run(&mut f, &mut l, &mut r);
    assert!(l[47000..].iter().chain(&r[47000..]).all(|s| s.abs() < 1e-4));
}

#[test]
fn the_eq_boosts_and_cuts_its_bands() {
    use fx_param::eq;
    let gain = |params: &[(u16, f32)], hz: f32| {
        let mut e = Eq::new(RATE);
        set(&mut e, params);
        sine_gain(&mut e, hz, 0.1)
    };
    assert!((gain(&[(eq::LOW_GAIN, 6.0)], 30.0) - 6.0).abs() < 0.5);
    assert!((gain(&[(eq::HIGH_GAIN, -6.0)], 16000.0) + 6.0).abs() < 0.5);
    assert!((gain(&[(eq::MID1_GAIN, 9.0)], 500.0) - 9.0).abs() < 0.2);
    assert!((gain(&[(eq::MID2_FREQ, 3000.0), (eq::MID2_GAIN, -12.0)], 3000.0) + 12.0).abs() < 0.2);
    assert!(gain(&[(eq::MID2_FREQ, 3000.0), (eq::MID2_GAIN, -12.0)], 300.0).abs() < 0.5);
}

/// Every unit, each parameter at a draw from its range (switches either way).
fn draws(kind: u32, noise: &mut Noise) -> Vec<(u16, f32)> {
    let u = |noise: &mut Noise, lo: f32, hi: f32| lo + (hi - lo) * (0.5 + 0.5 * noise.next());
    let ranges: &[(f32, f32)] = match kind {
        fx_kind::SVF => &[(20.0, 20000.0), (0.1, 40.0), (0.0, 3.0), (0.0, 1.0)],
        fx_kind::EQ => &[
            (20.0, 20000.0),
            (-24.0, 24.0),
            (20.0, 20000.0),
            (-24.0, 24.0),
            (0.1, 18.0),
            (20.0, 20000.0),
            (-24.0, 24.0),
            (0.1, 18.0),
            (20.0, 20000.0),
            (-24.0, 24.0),
        ],
        fx_kind::COMP => &[(-80.0, 0.0), (1.0, 50.0), (0.0001, 1.0), (0.001, 5.0), (0.0, 24.0), (-24.0, 24.0), (0.0, 80.0), (0.0, 1.0)],
        fx_kind::SAT => &[(0.0, sat::MAX_DRIVE), (-12.0, 12.0), (0.0, 1.0)],
        fx_kind::DELAY => &[(0.001, 4.0), (0.0, 16.0), (20.0, 400.0), (0.0, 0.95), (200.0, 20000.0), (0.0, 1.0), (0.0, 1.0), (0.0, 1.0)],
        fx_kind::TAPE => &[(0.0, 1.0), (0.3, 2.0), (0.0, 1.0), (6.0, 12.0), (0.0, 2.0), (0.0, 1.0)],
        fx_kind::CRUSH => &[(50.0, RATE), (1.0, 24.0), (0.0, 1.0)],
        _ => &[],
    };
    ranges.iter().enumerate().map(|(p, &(lo, hi))| (p as u16, u(noise, lo, hi))).collect()
}

const KINDS: [u32; 7] = [fx_kind::SVF, fx_kind::EQ, fx_kind::COMP, fx_kind::SAT, fx_kind::DELAY, fx_kind::TAPE, fx_kind::CRUSH];

#[test]
fn white_noise_through_any_unit_at_any_in_range_setting_stays_finite() {
    let mut noise = Noise(0x1234_5678);
    for kind in KINDS {
        for draw in 0..12 {
            let mut unit = create(kind, RATE).unwrap();
            let params = draws(kind, &mut noise);
            set(unit.as_mut(), &params);
            let (mut l, mut r) = (noise.fill(24000), noise.fill(24000));
            // Full scale, and a second at the next draw's settings with the parameters moving every block.
            run(unit.as_mut(), &mut l, &mut r);
            assert!(l.iter().chain(&r).all(|s| s.is_finite()), "kind {kind}, draw {draw}: {params:?}");
            let next = draws(kind, &mut noise);
            let (mut l, mut r) = (noise.fill(24000), noise.fill(24000));
            for (k, (bl, br)) in l.chunks_mut(BLOCK).zip(r.chunks_mut(BLOCK)).enumerate() {
                let t = k as f32 / (24000 / BLOCK) as f32;
                for (&(p, a), &(_, b)) in params.iter().zip(&next) {
                    unit.set(p, a + (b - a) * t);
                }
                unit.process(bl, br, None);
            }
            assert!(l.iter().chain(&r).all(|s| s.is_finite() && s.abs() < 1000.0), "kind {kind}, draw {draw}: {next:?}");
        }
    }
}

#[test]
fn the_compressor_keyed_by_a_pulse_ducks_by_its_range_within_its_attack_and_recovers_within_twice_its_release() {
    use fx_param::comp;
    let (attack, release, range) = (0.005f32, 0.04f32, 12.0f32);
    let mut c = Comp::new(RATE);
    set(&mut c, &[(comp::THRESHOLD, -30.0), (comp::RATIO, 20.0), (comp::ATTACK, attack), (comp::RELEASE, release), (comp::KNEE, 0.0), (comp::RANGE, range)]);
    // A 4 Hz pulse: 125 ms of a 200 Hz tone, then 125 ms of silence, for a second.
    let period = (RATE / 4.0) as usize;
    let key: Vec<f32> = (0..48000)
        .map(|i| if i % period < period / 2 { 0.5 * (std::f32::consts::TAU * 200.0 * i as f32 / RATE).sin() } else { 0.0 })
        .collect();
    // The bus is DC, so its level is the gain.
    let (mut l, mut r) = (vec![0.5f32; 48000], vec![0.5f32; 48000]);
    for (k, (bl, br)) in l.chunks_mut(BLOCK).zip(r.chunks_mut(BLOCK)).enumerate() {
        let at = k * BLOCK;
        let kk = &key[at..at + bl.len()];
        c.process(bl, br, Some((kk, kk)));
    }
    let gain_db = |i: usize| db(l[i] / 0.5);
    let frames = |s: f32| (s * RATE) as usize;
    for pulse in [2usize, 3] {
        let on = pulse * period;
        let off = on + period / 2;
        let ducked = gain_db(on + frames(attack));
        assert!(ducked < -(range - 1.5) && ducked > -(range + 0.1), "pulse {pulse}: {ducked} dB after the attack");
        let floor = (on..off).map(gain_db).fold(0.0f32, f32::min);
        assert!(floor > -(range + 0.1), "never past the range: {floor}");
        let back = gain_db(off + frames(2.0 * release));
        assert!(back > -1.0, "pulse {pulse}: {back} dB after twice the release");
    }
    assert!(gain_db(period / 2 - 1) < -(range - 1.5));
}

#[test]
fn a_silent_key_changes_nothing() {
    let mut c = Comp::new(RATE);
    let key = vec![0.0f32; BLOCK];
    let (mut l, mut r) = (vec![0.9f32; BLOCK], vec![-0.9f32; BLOCK]);
    for _ in 0..100 {
        l.fill(0.9);
        r.fill(-0.9);
        c.process(&mut l, &mut r, Some((&key, &key)));
    }
    assert!(l.iter().all(|s| (*s - 0.9).abs() < 1e-6) && r.iter().all(|s| (*s + 0.9).abs() < 1e-6));
}

#[test]
fn the_compressor_without_a_key_turns_down_what_passes_its_threshold() {
    use fx_param::comp;
    let mut c = Comp::new(RATE);
    set(&mut c, &[(comp::THRESHOLD, -20.0), (comp::RATIO, 4.0), (comp::KNEE, 0.0)]);
    // A sine peaking at -6 dB is 14 dB over: three quarters of that comes off.
    let gain = sine_gain(&mut c, 1000.0, 0.5);
    assert!((gain + 10.5).abs() < 1.0, "{gain}");
}

#[test]
fn the_saturator_at_full_drive_keeps_a_5_khz_sines_aliases_40_db_down() {
    use fx_param::sat as p;
    for (amp, tilt) in [(0.25f32, 0.0), (0.5, 0.0), (1.0, 0.0), (1.0, 12.0), (1.0, -12.0)] {
        let mut s = Sat::new(RATE);
        set(&mut s, &[(p::DRIVE, sat::MAX_DRIVE), (p::TILT, tilt)]);
        let x = sine(5000.0, amp, 48000);
        let (mut l, mut r) = (x.clone(), x.clone());
        run(&mut s, &mut l, &mut r);
        let tail = &l[24000..];
        let fundamental = magnitude(tail, 5000.0);
        // Every alias of a 5 kHz tone at 48 kHz lands on a whole kHz; the harmonics below Nyquist are 5 and 15.
        let worst = (1..24)
            .map(|k| k as f32 * 1000.0)
            .filter(|hz| *hz != 5000.0 && *hz != 15000.0)
            .map(|hz| (hz, db(magnitude(tail, hz) / fundamental)))
            .fold((0.0, -400.0), |a, b| if b.1 > a.1 { b } else { a });
        assert!(worst.1 < -40.0, "amp {amp}, tilt {tilt}: {} Hz at {} dB", worst.0, worst.1);
    }
}

#[test]
fn drive_never_raises_loudness_by_more_than_a_db() {
    use fx_param::sat as p;
    let mut noise = Noise(99);
    for drive in [0.0, 6.0, 12.0, 24.0, sat::MAX_DRIVE] {
        for tilt in [-12.0, 0.0, 12.0] {
            for amp in [0.01f32, 0.1, 0.5] {
                let mut s = Sat::new(RATE);
                set(&mut s, &[(p::DRIVE, drive), (p::TILT, tilt)]);
                let gain = sine_gain(&mut s, 220.0, amp);
                assert!(gain < 1.0, "sine, drive {drive}, tilt {tilt}, amp {amp}: {gain} dB");
                let mut s = Sat::new(RATE);
                set(&mut s, &[(p::DRIVE, drive), (p::TILT, tilt)]);
                let x: Vec<f32> = noise.fill(48000).iter().map(|v| v * amp).collect();
                let (mut l, mut r) = (x.clone(), x.clone());
                run(&mut s, &mut l, &mut r);
                let gain = db(rms(&l[24000..]) / rms(&x[24000..]));
                assert!(gain < 1.0, "noise, drive {drive}, tilt {tilt}, amp {amp}: {gain} dB");
            }
        }
    }
}

#[test]
fn the_saturators_dry_side_lines_up_with_its_wet_side() {
    use fx_param::sat as p;
    // A whisper through no drive is all but linear: half wet and half dry must not comb at 10 kHz.
    let mut s = Sat::new(RATE);
    set(&mut s, &[(p::DRIVE, 0.0), (p::MIX, 0.5)]);
    let gain = sine_gain(&mut s, 10000.0, 0.01);
    assert!(gain.abs() < 0.3, "{gain}");
}

#[test]
fn the_delay_echoes_after_its_time_and_in_beats_of_the_transport_or_its_own_tempo() {
    use fx_param::delay;
    let echo_at = |params: &[(u16, f32)], transport: Option<f32>| {
        let mut d = Delay::new(RATE);
        set(&mut d, &[(delay::MIX, 1.0), (delay::FEEDBACK, 0.0), (delay::FILTER, 20000.0)]);
        set(&mut d, params);
        if let Some(bpm) = transport {
            d.tempo(60.0 / bpm * RATE, 4);
        }
        let mut l = vec![0.0f32; 48000];
        l[0] = 1.0;
        let mut r = l.clone();
        run(&mut d, &mut l, &mut r);
        l.iter().position(|s| s.abs() > 0.5)
    };
    let first_echo = |params: &[(u16, f32)]| echo_at(params, None);
    assert_eq!(first_echo(&[(delay::TIME, 0.1)]), Some(4800));
    // Half a beat at 150 bpm is 0.2 s, and the beats win over the time.
    assert_eq!(first_echo(&[(delay::TIME, 0.1), (delay::BEATS, 0.5), (delay::TEMPO, 150.0)]), Some(9600));
    // With no tempo of its own the beats are the transport's: 120 bpm until it says otherwise, then its tempo.
    assert_eq!(first_echo(&[(delay::BEATS, 0.5)]), Some(12000));
    assert_eq!(echo_at(&[(delay::BEATS, 0.5)], Some(100.0)), Some(14400));
    // A tempo of its own holds against the transport's, and 0 hands the time back to the transport.
    assert_eq!(echo_at(&[(delay::BEATS, 0.5), (delay::TEMPO, 150.0)], Some(100.0)), Some(9600));
    assert_eq!(echo_at(&[(delay::BEATS, 0.5), (delay::TEMPO, 150.0), (delay::TEMPO, 0.0)], Some(100.0)), Some(14400));
}

#[test]
fn a_delay_time_change_crossfades_and_glide_bends_the_pitch() {
    use fx_param::delay;
    let rate_after_change = |glide: f32| {
        let mut d = Delay::new(RATE);
        set(&mut d, &[(delay::TIME, 0.5), (delay::MIX, 1.0), (delay::FEEDBACK, 0.0), (delay::GLIDE, glide)]);
        let x = sine(1000.0, 0.5, 96000);
        let (mut l, mut r) = (x.clone(), x.clone());
        let (a, b) = l.split_at_mut(48000);
        let (ra, rb) = r.split_at_mut(48000);
        run(&mut d, a, ra);
        d.set(delay::TIME, 0.4);
        run(&mut d, b, rb);
        // Zero crossings in the 50 ms after the change: a crossfade keeps the pitch (100 crossings), a glide does
        // not (the tap closing on the write head raises it).
        let w = &l[48000..48000 + 2400];
        w.windows(2).filter(|p| p[0] < 0.0 && p[1] >= 0.0).count()
    };
    let fade = rate_after_change(0.0);
    let glide = rate_after_change(1.0);
    assert!((49..=51).contains(&fade), "{fade}");
    assert!(glide >= 53, "{glide}");
}

#[test]
fn a_ping_pong_delay_answers_on_the_left_then_the_right() {
    use fx_param::delay;
    let mut d = Delay::new(RATE);
    set(&mut d, &[(delay::TIME, 0.1), (delay::MIX, 1.0), (delay::FEEDBACK, 0.5), (delay::PINGPONG, 1.0), (delay::FILTER, 20000.0)]);
    // Let the ping-pong glide in, then a click.
    let (mut l, mut r) = (vec![0.0f32; 4800], vec![0.0f32; 4800]);
    run(&mut d, &mut l, &mut r);
    let (mut l, mut r) = (vec![0.0f32; 24000], vec![0.0f32; 24000]);
    l[0] = 1.0;
    r[0] = 1.0;
    run(&mut d, &mut l, &mut r);
    let near = |x: &[f32], at: usize| x[at - 4..at + 4].iter().fold(0.0f32, |m, s| m.max(s.abs()));
    assert!(near(&l, 4800) > 0.5 && near(&r, 4800) < 0.01);
    assert!(near(&r, 9600) > 0.2 && near(&l, 9600) < 0.01);
}

#[test]
fn a_stopped_tape_is_silent_within_50_ms_and_starts_again_without_a_click() {
    use fx_param::tape;
    let mut t = Tape::new(RATE);
    set(&mut t, &[(tape::WOW, 0.0), (tape::FLUTTER, 0.0), (tape::HISS, 0.0)]);
    let x = sine(440.0, 0.5, 48000);
    let steady_step = x.windows(2).fold(0.0f32, |m, p| m.max((p[1] - p[0]).abs()));
    let (mut l, mut r) = (x.clone(), x.clone());
    let (a, rest) = l.split_at_mut(12000);
    let (ra, rrest) = r.split_at_mut(12000);
    run(&mut t, a, ra);
    let before = rms(&a[6000..]);
    t.set(tape::SPEED, 0.0);
    let (b, c) = rest.split_at_mut(12000);
    let (rb, rc) = rrest.split_at_mut(12000);
    run(&mut t, b, rb);
    let after = rms(&b[2400..2400 + 480]);
    assert!(db(after / before) < -60.0, "{} dB at 50 ms", db(after / before));
    assert!(b[4800..].iter().all(|s| *s == 0.0 || s.abs() < 1e-5));
    t.set(tape::SPEED, 1.0);
    run(&mut t, c, rc);
    let step = c.windows(2).fold(0.0f32, |m, p| m.max((p[1] - p[0]).abs()));
    assert!(step <= 1.2 * steady_step, "{step} against {steady_step}");
    assert!(rms(&c[6000..]) > 0.9 * before);
}

#[test]
fn the_tape_at_half_speed_plays_an_octave_down_and_at_double_an_octave_up() {
    use fx_param::tape;
    let crossings = |speed: f32| {
        let mut t = Tape::new(RATE);
        set(&mut t, &[(tape::WOW, 0.0), (tape::FLUTTER, 0.0), (tape::HISS, 0.0), (tape::SPEED, speed)]);
        let x = sine(1000.0, 0.5, 48000);
        let (mut l, mut r) = (x.clone(), x);
        run(&mut t, &mut l, &mut r);
        l[24000..].windows(2).filter(|p| p[0] < 0.0 && p[1] >= 0.0).count()
    };
    let half = crossings(0.5);
    let double = crossings(2.0);
    // Half a second of 1 kHz has 500 upward crossings; an octave down, 250.
    assert!((240..=260).contains(&half), "{half}");
    // Double speed splices every 40 ms; between splices it is an octave up.
    assert!((950..=1050).contains(&double), "{double}");
}

#[test]
fn the_crusher_holds_and_rounds() {
    use fx_param::crush;
    let crushed = |params: &[(u16, f32)]| {
        let mut c = Crush::new(RATE);
        set(&mut c, params);
        let x = sine(100.0, 0.9, 4800);
        let (mut l, mut r) = (x.clone(), x);
        run(&mut c, &mut l, &mut r);
        l
    };
    // About ten frames a hold.
    let held = crushed(&[(crush::RATE, 4800.0), (crush::BITS, 24.0)]);
    let mut runs = vec![1usize];
    for p in held.windows(2) {
        if p[1] == p[0] {
            *runs.last_mut().unwrap() += 1;
        } else {
            runs.push(1);
        }
    }
    assert!(runs[1..runs.len() - 1].iter().all(|n| (9..=11).contains(n)), "{runs:?}");
    // Four steps either side of zero at three bits.
    let rounded = crushed(&[(crush::RATE, RATE), (crush::BITS, 3.0)]);
    assert!(rounded.iter().all(|s| (s * 4.0 - (s * 4.0).round()).abs() < 1e-6));
    assert!(rounded.iter().any(|s| *s == 0.75) && rounded.iter().any(|s| *s == -0.75));
}

#[test]
fn reset_silences_every_unit() {
    let mut noise = Noise(5);
    for kind in KINDS {
        let mut unit = create(kind, RATE).unwrap();
        let (mut l, mut r) = (noise.fill(9600), noise.fill(9600));
        run(unit.as_mut(), &mut l, &mut r);
        unit.reset();
        if kind == fx_kind::TAPE {
            unit.set(fx_param::tape::HISS, 0.0);
        }
        let (mut l, mut r) = (vec![0.0f32; 9600], vec![0.0f32; 9600]);
        run(unit.as_mut(), &mut l, &mut r);
        assert!(l.iter().chain(&r).all(|s| s.abs() < 1e-6), "kind {kind}");
    }
}


#[test]
fn the_stereo_unit_narrows_to_mono_and_moves_the_bus_across_the_field() {
    use fx_param::stereo;
    let through = |params: &[(u16, f32)]| {
        let mut s = Stereo::new(RATE);
        set(&mut s, params);
        // The left side alone: a hard-panned source.
        let mut l = vec![0.8f32; 4800];
        let mut r = vec![0.0f32; 4800];
        run(&mut s, &mut l, &mut r);
        (l[4799], r[4799])
    };
    // Untouched by default.
    assert_eq!(through(&[]), (0.8, 0.0));
    // Mono: both sides carry the middle.
    let (l, r) = through(&[(stereo::WIDTH, 0.0)]);
    assert!((l - 0.4).abs() < 1e-4 && (r - 0.4).abs() < 1e-4, "mono: {l} {r}");
    // A mono bus panned hard right is on the right alone; hard left, on the left alone, at the level it had.
    let (l, r) = through(&[(stereo::WIDTH, 0.0), (stereo::PAN, 1.0)]);
    assert!(l.abs() < 1e-4 && (r - 0.4).abs() < 1e-4, "right: {l} {r}");
    let (l, r) = through(&[(stereo::WIDTH, 0.0), (stereo::PAN, -1.0)]);
    assert!((l - 0.4).abs() < 1e-4 && r.abs() < 1e-4, "left: {l} {r}");
    // A move glides: no step larger than the whole move spread over a few milliseconds.
    let mut s = Stereo::new(RATE);
    let mut l = vec![0.8f32; 480];
    let mut r = vec![0.8f32; 480];
    run(&mut s, &mut l, &mut r);
    s.set(stereo::PAN, 1.0);
    let mut l = vec![0.8f32; 4800];
    let mut r = vec![0.8f32; 4800];
    run(&mut s, &mut l, &mut r);
    let step = l.windows(2).map(|w| (w[1] - w[0]).abs()).fold(0.0f32, f32::max);
    assert!(step < 0.01, "a pan move stepped by {step}");
    assert!(l[4799].abs() < 1e-3);
}

#[test]
fn a_tape_back_at_speed_comes_home_and_is_no_later_than_one_that_never_slowed() {
    use fx_param::tape;
    let neutral = [(tape::WOW, 0.0), (tape::FLUTTER, 0.0), (tape::HISS, 0.0)];
    // Where a click fed in now comes out: the tape's lag, in frames.
    let lag_of = |t: &mut Tape| {
        let mut l = vec![0.0f32; 48000];
        l[0] = 1.0;
        let mut r = l.clone();
        run(t, &mut l, &mut r);
        let peak = l.iter().fold(0.0f32, |m, s| m.max(s.abs()));
        l.iter().position(|s| s.abs() > 0.5 * peak).unwrap()
    };
    let quiet = |t: &mut Tape, frames: usize| {
        let mut l = vec![0.0f32; frames];
        let mut r = l.clone();
        run(t, &mut l, &mut r);
    };
    let mut fresh = Tape::new(RATE);
    set(&mut fresh, &neutral);
    quiet(&mut fresh, 4800);
    let home = lag_of(&mut fresh);

    let mut slowed = Tape::new(RATE);
    set(&mut slowed, &neutral);
    quiet(&mut slowed, 4800);
    slowed.set(tape::SPEED, 0.5);
    quiet(&mut slowed, 48000);
    slowed.set(tape::SPEED, 1.0);
    quiet(&mut slowed, 9600);
    let after = lag_of(&mut slowed);
    assert!((after as i64 - home as i64).abs() <= 2, "home {home}, after running slow {after}");
}
