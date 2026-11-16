//! The core's spine end to end, natively: voices, buses, the limiter and the meters through `Engine`.
//!
//! Assertions are ranges, orderings and invariants, never exact samples. The test binary counts allocations per
//! thread, so a test can prove `process` allocates nothing.

use watchpot_dsp::Engine;
use watchpot_dsp::ops::{
    BusDefine, BusSet, MAX_BLOCK, Meters, Record, SampleFree, VoiceEnded, VoiceSet, VoiceStart, bus_param, voice_param,
};
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

fn sine(hz: f32, seconds: f32, level: f32) -> Vec<i16> {
    (0..(seconds * RATE) as usize)
        .map(|i| ((i as f32 * core::f32::consts::TAU * hz / RATE).sin() * level * 32767.0) as i16)
        .collect()
}

fn dc(frames: usize, level: f32) -> Vec<i16> {
    vec![(level * 32767.0) as i16; frames]
}

fn start(voice: u32, sample: u32) -> VoiceStart {
    VoiceStart {
        at_frame: 0,
        voice,
        sample,
        bus: 0,
        gain: 1.0,
        pan: 0.0,
        rate: 1.0,
        offset: 0,
        loop_start: 0,
        loop_end: 0,
        attack: 0,
        release: 0,
        send_bus1: 0,
        send1: 0.0,
        send_bus2: 0,
        send2: 0.0,
        priority: 0,
        flags: 0,
    }
}

/// Sign changes in `x`.
fn crossings(x: &[f32]) -> usize {
    x.windows(2).filter(|w| (w[0] < 0.0) != (w[1] < 0.0)).count()
}

/// The largest difference between adjacent samples.
fn largest_step(x: &[f32]) -> f32 {
    x.windows(2).map(|w| (w[1] - w[0]).abs()).fold(0.0, f32::max)
}

/// Every event of type `R` in a buffer of event records.
fn events_of<R: Record>(bytes: &[u8]) -> Vec<R> {
    let mut out = Vec::new();
    let mut at = 0;
    while at + 4 <= bytes.len() {
        let op = u16::from_le_bytes([bytes[at], bytes[at + 1]]);
        let len = u16::from_le_bytes([bytes[at + 2], bytes[at + 3]]) as usize;
        if len < 4 || at + len > bytes.len() {
            break;
        }
        if op == R::OP {
            out.extend(R::read(&bytes[at..at + len]));
        }
        at += len;
    }
    out
}

#[test]
fn a_sine_at_rate_2_crosses_zero_twice_as_often() {
    let count = |rate: f32| {
        let mut e = Engine::new(RATE, 8);
        e.load_sample(1, &sine(440.0, 2.0, 0.5), 1, RATE);
        e.command(&VoiceStart { rate, ..start(0, 1) }.bytes());
        crossings(&e.render(24000).l)
    };
    let (one, two) = (count(1.0), count(2.0));
    let ratio = two as f32 / one as f32;
    assert!((ratio - 2.0).abs() < 0.02, "{one} then {two}");
}

#[test]
fn a_source_at_another_rate_plays_at_its_own_pitch() {
    let mut e = Engine::new(RATE, 8);
    // 440 Hz recorded at 24 kHz is 440 Hz when played back right.
    let pcm: Vec<i16> = (0..24000).map(|i| ((i as f32 * core::f32::consts::TAU * 440.0 / 24000.0).sin() * 16000.0) as i16).collect();
    e.load_sample(1, &pcm, 1, 24000.0);
    e.command(&start(0, 1).bytes());
    let n = crossings(&e.render(24000).l) as f32;
    // Half a second of 440 Hz crosses zero 440 times.
    assert!((n - 440.0).abs() < 6.0, "{n}");
}

#[test]
fn a_rate_of_zero_negative_or_nan_is_one() {
    let count = |rate: f32| {
        let mut e = Engine::new(RATE, 8);
        e.load_sample(1, &sine(440.0, 1.0, 0.5), 1, RATE);
        e.command(&VoiceStart { rate, ..start(0, 1) }.bytes());
        crossings(&e.render(24000).l)
    };
    let one = count(1.0);
    for rate in [0.0, -2.0, f32::NAN, f32::INFINITY] {
        assert_eq!(count(rate), one, "rate {rate}");
    }
}

#[test]
fn a_voice_started_at_frame_37_of_a_block_is_silent_for_exactly_37_frames() {
    let mut e = Engine::new(RATE, 8);
    let delay = e.limiter.latency();
    e.load_sample(1, &dc(4800, 0.25), 1, RATE);
    e.render(3 * MAX_BLOCK);
    e.command(&VoiceStart { at_frame: (3 * MAX_BLOCK + 37) as u32, ..start(0, 1) }.bytes());
    let out = e.render(2048);
    // The master leaves the limiter `delay` frames late; everything is late by the same amount.
    let first = out.l.iter().position(|s| *s != 0.0).unwrap();
    assert_eq!(first, 37 + delay);
}

#[test]
fn a_start_for_a_frame_already_past_starts_at_once() {
    let mut e = Engine::new(RATE, 8);
    let delay = e.limiter.latency();
    e.load_sample(1, &dc(4800, 0.25), 1, RATE);
    e.render(10 * MAX_BLOCK);
    e.command(&VoiceStart { at_frame: 200, ..start(0, 1) }.bytes());
    let out = e.render(1024);
    assert_eq!(out.l.iter().position(|s| *s != 0.0), Some(delay));
}

#[test]
fn two_hundred_full_scale_voices_never_pass_the_ceiling() {
    for pool in [256u32, 64] {
        let mut e = Engine::new(RATE, pool);
        let ceiling = e.limiter.ceiling();
        for k in 0..8u32 {
            e.load_sample(k + 1, &sine(55.0 * (k + 1) as f32, 1.0, 1.0), 1, RATE);
        }
        let starts: Vec<u8> = (0..200u32)
            .flat_map(|i| VoiceStart { gain: 1.0, pan: (i as f32 / 100.0) - 1.0, ..start(i + 1, i % 8 + 1) }.bytes())
            .collect();
        e.command(&starts);
        let out = e.render(48000);
        let peak = out.l.iter().chain(&out.r).fold(0.0f32, |m, s| m.max(s.abs()));
        assert!(peak <= ceiling, "pool {pool}: {peak} over {ceiling}");
        assert!(peak > 0.5 * ceiling, "pool {pool}: {peak}");
        assert!(out.l.iter().chain(&out.r).all(|s| s.is_finite()));
    }
}

#[test]
fn a_stolen_voice_fades_rather_than_steps() {
    let mut e = Engine::new(RATE, 1);
    e.load_sample(1, &dc(96000, 0.5), 1, RATE);
    e.load_sample(2, &dc(96000, 0.0), 1, RATE);
    e.command(&start(1, 1).bytes());
    e.render(4800);
    e.command(&start(2, 2).bytes());
    let out = e.render(4800);
    assert!(out.l[0] > 0.3, "the first voice was sounding");
    assert!(*out.l.last().unwrap() == 0.0, "and is gone");
    let step = largest_step(&out.l);
    assert!(step < 0.05, "{step}");
    let ended: Vec<VoiceEnded> = events_of(&out.events);
    assert_eq!(ended.iter().map(|v| v.voice).collect::<Vec<_>>(), [1]);
}

#[test]
fn a_full_pool_steals_the_quietest_of_the_lowest_priority() {
    let mut e = Engine::new(RATE, 3);
    e.load_sample(1, &dc(96000, 0.1), 1, RATE);
    e.command(&VoiceStart { priority: 1, gain: 0.2, ..start(1, 1) }.bytes());
    e.command(&VoiceStart { priority: 0, gain: 0.9, ..start(2, 1) }.bytes());
    e.command(&VoiceStart { priority: 0, gain: 0.3, ..start(3, 1) }.bytes());
    e.render(1024);
    e.command(&VoiceStart { priority: 0, ..start(4, 1) }.bytes());
    let ended: Vec<VoiceEnded> = events_of(&e.render(1024).events);
    assert_eq!(ended.iter().map(|v| v.voice).collect::<Vec<_>>(), [3]);
    // A newcomer below every live voice is refused, and says so.
    let mut e = Engine::new(RATE, 1);
    e.load_sample(1, &dc(96000, 0.1), 1, RATE);
    e.command(&VoiceStart { priority: 5, ..start(1, 1) }.bytes());
    e.render(128);
    e.command(&VoiceStart { priority: 1, ..start(2, 1) }.bytes());
    let ended: Vec<VoiceEnded> = events_of(&e.render(1024).events);
    assert_eq!(ended.iter().map(|v| v.voice).collect::<Vec<_>>(), [2]);
    assert!(e.voices.live() == 1);
}

#[test]
fn a_sample_freed_while_it_plays_fades_out_before_its_memory_goes() {
    let mut e = Engine::new(RATE, 8);
    e.load_sample(1, &dc(96000, 0.5), 1, RATE);
    e.command(&start(5, 1).bytes());
    e.render(4800);
    e.command(&SampleFree { at_frame: 0, sample: 1 }.bytes());
    e.process(MAX_BLOCK);
    assert_eq!(e.samples.dying(), 1, "the memory waits for the voice");
    let out = e.render(4800);
    assert!(largest_step(&out.l) < 0.05);
    assert_eq!(e.samples.dying(), 0, "and goes once it has faded");
    assert!(e.samples.get(1).is_none());
    assert_eq!(e.voices.active(), 0);
}

#[test]
fn a_stop_releases_and_a_handle_ends() {
    let mut e = Engine::new(RATE, 8);
    e.load_sample(1, &dc(96000, 0.5), 1, RATE);
    e.command(&start(5, 1).bytes());
    e.render(4800);
    e.command(&watchpot_dsp::ops::VoiceStop { at_frame: 0, voice: 5, release: 960 }.bytes());
    let out = e.render(4800);
    assert!(largest_step(&out.l) < 0.01);
    assert_eq!(*out.l.last().unwrap(), 0.0);
    let ended: Vec<VoiceEnded> = events_of(&out.events);
    assert_eq!(ended.len(), 1);
}

#[test]
fn a_gain_slew_moves_smoothly_to_its_target() {
    let mut e = Engine::new(RATE, 8);
    e.load_sample(1, &dc(96000, 0.5), 1, RATE);
    e.command(&start(5, 1).bytes());
    e.render(4800);
    let before = *e.render(128).l.last().unwrap();
    e.command(&VoiceSet { at_frame: 0, voice: 5, param: voice_param::GAIN, value: 0.25, slew: 2400 }.bytes());
    let out = e.render(4800);
    assert!(largest_step(&out.l) < 0.001);
    let after = *out.l.last().unwrap();
    assert!((after / before - 0.25).abs() < 0.01, "{before} to {after}");
}

#[test]
fn a_loop_keeps_sounding_past_the_end_of_its_sample() {
    let mut e = Engine::new(RATE, 8);
    e.load_sample(1, &sine(100.0, 0.5, 0.5), 1, RATE);
    e.command(&VoiceStart { loop_start: 4800, loop_end: 19200, ..start(5, 1) }.bytes());
    let out = e.render(96000);
    let tail = &out.l[90000..];
    assert!(tail.iter().fold(0.0f32, |m, s| m.max(s.abs())) > 0.2);
    assert!(largest_step(&out.l) < 0.02);
    assert!(events_of::<VoiceEnded>(&out.events).is_empty());
}

#[test]
fn a_voice_on_a_bus_reaches_the_master_through_its_gain_and_its_send() {
    let level = |gain: f32, send: f32| {
        let mut e = Engine::new(RATE, 8);
        e.load_sample(1, &dc(96000, 0.25), 1, RATE);
        e.command(&BusDefine { at_frame: 0, bus: 2, out: 0, gain }.bytes());
        e.command(&BusDefine { at_frame: 0, bus: 3, out: 0, gain: 1.0 }.bytes());
        e.command(&VoiceStart { bus: 2, send_bus1: 3, send1: send, ..start(0, 1) }.bytes());
        *e.render(4800).l.last().unwrap()
    };
    let dry = level(1.0, 0.0);
    assert!((level(0.5, 0.0) / dry - 0.5).abs() < 1e-3);
    assert!((level(1.0, 1.0) / dry - 2.0).abs() < 1e-3);
    let mut e = Engine::new(RATE, 8);
    e.load_sample(1, &dc(96000, 0.25), 1, RATE);
    e.command(&VoiceStart { bus: 2, ..start(0, 1) }.bytes());
    e.render(4800);
    e.command(&BusSet { at_frame: 0, bus: 2, param: bus_param::MUTE, index: 0, value: 1.0, slew: 0 }.bytes());
    let out = e.render(4800);
    assert_eq!(*out.l.last().unwrap(), 0.0);
    assert!(largest_step(&out.l) < 0.01);
}

#[test]
fn meters_arrive_about_sixty_times_a_second_and_read_the_mix() {
    let mut e = Engine::new(RATE, 8);
    e.load_sample(1, &sine(1000.0, 2.0, 0.5), 1, RATE);
    e.command(&VoiceStart { bus: 2, ..start(0, 1) }.bytes());
    let out = e.render(48000);
    let meters: Vec<Meters> = events_of(&out.events);
    assert!((55..=61).contains(&meters.len()), "{}", meters.len());
    assert!(meters.windows(2).all(|w| w[1].frame.wrapping_sub(w[0].frame) >= 735));
    let last = meters.last().unwrap();
    assert!(last.peak[2] > 0.3 && last.peak[2] < 0.4, "{}", last.peak[2]);
    assert!((last.rms[2] / last.peak[2] - core::f32::consts::FRAC_1_SQRT_2).abs() < 0.05);
    assert!(last.peak[0] <= e.limiter.ceiling());
    assert_eq!(last.peak[5], 0.0);
    // 1 kHz at 0.354 peak in each channel: a mean square of 0.0625 a side, about -9 LUFS.
    assert!((last.loudness - -9.0).abs() < 0.5, "{}", last.loudness);
    assert!(events_of::<VoiceEnded>(&out.events).is_empty());
}

#[test]
fn process_allocates_nothing() {
    let mut e = Engine::new(RATE, 16);
    e.load_sample(1, &sine(220.0, 1.0, 0.8), 1, RATE);
    let stereo: Vec<i16> = sine(330.0, 1.0, 0.8).iter().flat_map(|s| [*s, -*s]).collect();
    e.load_sample(2, &stereo, 2, RATE);
    let mut records = Vec::new();
    for i in 0..40u32 {
        records.extend(
            VoiceStart {
                at_frame: 64 * i + 1,
                rate: 0.5 + i as f32 * 0.05,
                send_bus1: 4,
                send1: 0.3,
                loop_start: 2000,
                loop_end: if i % 2 == 0 { 30000 } else { 0 },
                ..start(i + 1, i % 2 + 1)
            }
            .bytes(),
        );
    }
    records.extend(BusDefine { at_frame: 0, bus: 4, out: 0, gain: 0.5 }.bytes());
    records.extend(VoiceSet { at_frame: 900, voice: 3, param: voice_param::RATE, value: 1.5, slew: 1000 }.bytes());
    records.extend(SampleFree { at_frame: 2000, sample: 1 }.bytes());
    e.process(MAX_BLOCK);
    e.command(&records);
    let before = allocations();
    for _ in 0..400 {
        e.process(MAX_BLOCK);
    }
    assert_eq!(allocations(), before);
}

#[test]
fn sixty_four_voices_render_ten_seconds_well_inside_realtime() {
    let mut e = Engine::new(RATE, 64);
    for k in 0..8u32 {
        let pcm = sine(110.0 * (k + 1) as f32, 2.0, 0.3);
        if k % 2 == 0 {
            e.load_sample(k + 1, &pcm, 1, RATE);
        } else {
            let stereo: Vec<i16> = pcm.iter().flat_map(|s| [*s, *s / 2]).collect();
            e.load_sample(k + 1, &stereo, 2, 44100.0);
        }
    }
    e.command(&BusDefine { at_frame: 0, bus: 1, out: 0, gain: 0.5 }.bytes());
    e.command(&BusDefine { at_frame: 0, bus: 2, out: 1, gain: 0.8 }.bytes());
    let starts: Vec<u8> = (0..64u32)
        .flat_map(|i| {
            VoiceStart {
                gain: 0.1,
                pan: (i as f32 / 32.0) - 1.0,
                rate: 0.5 + (i % 16) as f32 / 10.0,
                bus: i % 3,
                send_bus1: 2,
                send1: if i % 4 == 0 { 0.2 } else { 0.0 },
                loop_start: 4000,
                loop_end: 90000,
                ..start(i + 1, i % 8 + 1)
            }
            .bytes()
        })
        .collect();
    e.command(&starts);
    let blocks = 10 * RATE as usize / MAX_BLOCK;
    let t = Instant::now();
    for _ in 0..blocks {
        e.process(MAX_BLOCK);
    }
    let seconds = t.elapsed().as_secs_f64();
    println!("64 voices, 10 s natively: {:.3} s, {:.0}x realtime", seconds, 10.0 / seconds);
    assert_eq!(e.voices.live(), 64);
    assert!(seconds < 0.5, "{seconds} s");
}
