//! Time, natively: the transport's lines over ten minutes, a tempo change mid-bar, loops locked to the transport
//! and patterns that wait for the bar line, through `Engine`.
//!
//! The test binary counts allocations per thread, so a test can prove the clock, the sequencer and the loops
//! allocate nothing while they run.

use watchpot_dsp::Engine;
use watchpot_dsp::ops::{
    Beat, ClockSet, HEADER, LoopStart, LoopStop, MAX_BLOCK, Record, SeqDefine, SeqSteps, Step, TransportSet,
    VoiceStart, grid, step_source, transport_run,
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

fn transport(bpm: f32, running: u32) -> TransportSet {
    TransportSet { at_frame: 0, bpm, beats_per_bar: 4, swing: -1.0, running }
}

fn track(track: u32, sample: u32, grid: u32) -> SeqDefine {
    SeqDefine {
        at_frame: 0,
        track,
        sample,
        bus: 0,
        gain: 0.5,
        pan: 0.0,
        send_bus1: 0,
        send1: 0.0,
        send_bus2: 0,
        send2: 0.0,
        grid,
    }
}

fn pattern(track: u32, velocity: &[f32], now: bool) -> SeqSteps {
    let mut v = [0.0; 64];
    v[..velocity.len()].copy_from_slice(velocity);
    SeqSteps { at_frame: 0, track, count: velocity.len() as u32, now: now as u32, velocity: v, rate: [0.0; 64] }
}

fn looped(slot: u32, sample: u32, bars: f32) -> LoopStart {
    LoopStart {
        at_frame: 0,
        slot,
        sample,
        bus: 0,
        gain: 0.5,
        level: 1.0,
        bars,
        send_bus1: 0,
        send1: 0.0,
        send_bus2: 0,
        send2: 0.0,
    }
}

/// Every event record of type `R` in `bytes`.
fn events<R: Record>(bytes: &[u8]) -> Vec<R> {
    let mut out = Vec::new();
    let mut at = 0;
    while at + HEADER <= bytes.len() {
        let len = u16::from_le_bytes([bytes[at + 2], bytes[at + 3]]) as usize;
        if u16::from_le_bytes([bytes[at], bytes[at + 1]]) == R::OP {
            out.extend(R::read(&bytes[at..at + len]));
        }
        at += len;
    }
    out
}

fn click(frames: usize) -> Vec<i16> {
    (0..frames).map(|i| if i < 64 { 12000 } else { 0 }).collect()
}

/// Noise from a fixed seed: no two stretches of it alike, so any misalignment shows.
fn noise(frames: usize) -> Vec<i16> {
    let mut x: u32 = 0x1234_5678;
    (0..frames)
        .map(|_| {
            x = x.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            ((x >> 16) as i16) / 4
        })
        .collect()
}

/// Renders `frames` frames a block at a time and hands each block's events to `seen`.
fn run(e: &mut Engine, frames: u64, mut seen: impl FnMut(&[u8])) {
    let mut left = frames;
    while left > 0 {
        let n = left.min(MAX_BLOCK as u64) as usize;
        e.process(n);
        seen(e.events());
        left -= n as u64;
    }
}

/// The steps of `seconds` at 120 bpm, as frames from the first.
fn sixteenths(rate: f32, seconds: u64) -> Vec<u64> {
    let mut e = Engine::new(rate, 8);
    e.load_sample(1, &click(200), 1, rate);
    e.command(&transport(120.0, transport_run::START).bytes());
    e.command(&track(0, 1, grid::N16).bytes());
    e.command(&pattern(0, &[1.0; 16], true).bytes());
    let mut steps = Vec::with_capacity(4802);
    let before = allocations();
    run(&mut e, (rate as u64) * seconds, |bytes| {
        let mut at = 0;
        while at + HEADER <= bytes.len() {
            let len = u16::from_le_bytes([bytes[at + 2], bytes[at + 3]]) as usize;
            if u16::from_le_bytes([bytes[at], bytes[at + 1]]) == Step::OP {
                let s = Step::read(&bytes[at..at + len]).unwrap();
                assert_eq!(s.source, step_source::SEQ);
                assert_eq!(s.index as usize, steps.len() % 16);
                steps.push(s.frame as u64);
            }
            at += len;
        }
    });
    assert_eq!(allocations(), before, "the clock and the sequencer allocated while running");
    steps
}

#[test]
fn sixteenths_land_every_6000_frames_for_ten_minutes() {
    let clock = Instant::now();
    let steps = sixteenths(48000.0, 600);
    assert_eq!(steps.len(), 4800);
    let drift = steps.iter().enumerate().map(|(i, &f)| f.abs_diff(6000 * i as u64)).max().unwrap();
    assert_eq!(drift, 0, "a 16th left its frame");

    // At 44.1 kHz a 16th is 5,512.5 frames: each lands on the first frame at or after its exact time (a minute
    // of it: the arithmetic is the same as above, and the ten minutes at 48 kHz already cost two seconds).
    let steps = sixteenths(44100.0, 60);
    assert_eq!(steps.len(), 480);
    for (i, &f) in steps.iter().enumerate() {
        assert_eq!(f, (i as u64 * 11025).div_ceil(2), "16th {i}");
    }
    println!("ten minutes of 16ths at 48 kHz and one at 44.1 kHz: drift {drift} frames, {:?}", clock.elapsed());
}

#[test]
fn a_tempo_change_mid_bar_keeps_the_next_beat_within_a_frame_of_the_continuous_answer() {
    for rate in [44100.0f32, 48000.0, 96000.0] {
        let mut e = Engine::new(rate, 4);
        e.command(&transport(120.0, transport_run::START).bytes());
        let fpb = rate as f64 / 2.0;
        // Mid-bar and mid-block: beat 1.3 and a bit.
        let t = (1.3 * fpb) as u64 + 37;
        e.command(
            &TransportSet {
                at_frame: t as u32,
                bpm: 133.0,
                beats_per_bar: 0,
                swing: -1.0,
                running: transport_run::KEEP,
            }
            .bytes(),
        );
        let out = e.render((fpb * 12.0) as usize);
        let beats: Vec<Beat> = events(&out.events);
        let at_t = t as f64 / fpb;
        let after = rate as f64 * 60.0 / 133.0;
        let mut worst = 0.0f64;
        for b in beats.iter().filter(|b| b.frame as u64 > t) {
            let n = (b.bar * 4 + b.beat) as f64;
            let exact = t as f64 + (n - at_t) * after;
            // A beat sounds on the first frame at or after its exact time.
            assert!(b.frame as f64 >= exact - 1e-6, "{rate} Hz: beat {n} early");
            worst = worst.max(b.frame as f64 - exact);
        }
        assert!(beats.iter().filter(|b| b.frame as u64 > t).count() >= 8);
        assert!(worst < 1.0, "{rate} Hz: a beat {worst} frames off");
        println!("tempo change at {rate} Hz: worst beat {worst:.3} frames from the continuous answer");
    }
}

/// Two engines, the same loop: one started on bar 0, one started `late_bars` in. Returns both renders.
fn two_loops(late_bars: f64, tempo_change: Option<(f64, f32)>, bars: usize) -> (Vec<f32>, Vec<f32>, u64) {
    let rate = 48000.0;
    let bar = 96000.0;
    let pcm = noise(96000);
    let render = |late: Option<f64>| {
        let mut e = Engine::new(rate, 8);
        e.load_sample(1, &pcm, 1, rate);
        e.command(&transport(120.0, transport_run::START).bytes());
        if let Some((at, bpm)) = tempo_change {
            e.command(
                &TransportSet {
                    at_frame: (at * bar) as u32,
                    bpm,
                    beats_per_bar: 0,
                    swing: -1.0,
                    running: transport_run::KEEP,
                }
                .bytes(),
            );
        }
        let mut out = Vec::with_capacity(bars * 96000);
        let start = match late {
            None => 0,
            Some(b) => (b * bar) as u64,
        };
        if start > 0 {
            out.extend(e.render(start as usize).l);
        }
        e.command(&looped(0, 1, 1.0).bytes());
        out.extend(e.render(bars * 96000 - start as usize).l);
        (out, e)
    };
    let (a, _) = render(None);
    let (b, _) = render(Some(late_bars));
    (a, b, (late_bars * bar) as u64)
}

#[test]
fn a_loop_started_late_is_sample_aligned_with_one_started_on_bar_0() {
    let (a, b, start) = two_loops(1.5, None, 6);
    // Past the limiter's 5 ms and the late one's 2 ms attack.
    let from = start as usize + 1000;
    let diff = a[from..].iter().zip(&b[from..]).map(|(x, y)| (x - y).abs()).fold(0.0f32, f32::max);
    let level = a[from..].iter().fold(0.0f32, |m, x| m.max(x.abs()));
    assert!(level > 0.05, "the loop is not heard");
    assert!(diff < 1e-3 * level, "the late loop is {diff} off a loop at {level}");
    println!("a loop started 1.5 bars late: largest difference {diff:.2e} against a peak of {level:.3}");
}

#[test]
fn a_loop_stays_aligned_through_a_tempo_change() {
    // The tempo moves from 120 to 133 bpm a third of the way through bar 2; one loop runs from bar 0, the other
    // starts on bar 3.5, after the change.
    let (a, b, start) = two_loops(3.5, Some((2.33, 133.0)), 8);
    let from = start as usize + 1000;
    let diff = a[from..].iter().zip(&b[from..]).map(|(x, y)| (x - y).abs()).fold(0.0f32, f32::max);
    let level = a[from..].iter().fold(0.0f32, |m, x| m.max(x.abs()));
    assert!(diff < 1e-3 * level, "after a tempo change the loops are {diff} apart at {level}");
    println!("through a tempo change: largest difference {diff:.2e} against a peak of {level:.3}");
}

#[test]
fn a_loop_lands_its_first_frame_on_every_bar_line_through_a_tempo_change() {
    let rate = 48000.0;
    let mut e = Engine::new(rate, 8);
    // One bar with a single spike at its start.
    let mut pcm = vec![0i16; 96000];
    pcm[0] = 30000;
    e.load_sample(1, &pcm, 1, rate);
    e.command(&transport(120.0, transport_run::START).bytes());
    e.command(
        &TransportSet { at_frame: 150_000, bpm: 97.0, beats_per_bar: 0, swing: -1.0, running: transport_run::KEEP }
            .bytes(),
    );
    e.command(&looped(0, 1, 1.0).bytes());
    let out = e.render(96000 * 7);
    let latency = e.limiter.latency();
    let bars: Vec<u64> =
        events::<Beat>(&out.events).iter().filter(|b| b.beat == 0 && b.bar > 0).map(|b| b.frame as u64).collect();
    assert!(bars.len() >= 4);
    for &f in &bars {
        let heard = f as usize + latency;
        let window = &out.l[heard - 8..heard + 8];
        let peak = (0..window.len()).max_by(|&i, &j| window[i].abs().total_cmp(&window[j].abs())).unwrap();
        assert!(peak.abs_diff(8) <= 1, "the bar at {f} sounded {} frames off", peak as i64 - 8);
    }
}

#[test]
fn a_pattern_replaced_mid_bar_takes_effect_at_the_bar_line() {
    let mut e = Engine::new(48000.0, 8);
    e.load_sample(1, &click(200), 1, 48000.0);
    e.command(&transport(120.0, transport_run::START).bytes());
    e.command(&track(3, 1, grid::N16).bytes());
    e.command(&pattern(3, &[1.0; 16], true).bytes());
    e.render(96000 + 5 * 6000 + 100);
    // Bar 1, just past its sixth 16th: the new pattern is four steps, a hit and three rests.
    e.command(&pattern(3, &[1.0, 0.0, 0.0, 0.0], false).bytes());
    let out = e.render(96000 * 2);
    let steps: Vec<Step> = events(&out.events);
    for s in &steps {
        let line = s.frame as u64 / 6000;
        let expect = if s.frame < 192000 { line % 16 } else { (line - 32) % 4 };
        assert_eq!(s.track, 3);
        assert_eq!(s.index as u64, expect, "the step at {}", s.frame);
        assert_eq!(s.frame % 6000, 0);
    }
    assert_eq!(steps[0].index, 6);
    assert!(steps.iter().any(|s| s.frame == 192000 && s.index == 0));
}

#[test]
fn a_pattern_sent_now_takes_over_at_the_next_step() {
    let mut e = Engine::new(48000.0, 8);
    e.load_sample(1, &click(200), 1, 48000.0);
    e.command(&transport(120.0, transport_run::START).bytes());
    e.command(&track(0, 1, grid::N16).bytes());
    e.command(&pattern(0, &[1.0; 16], true).bytes());
    e.render(5 * 6000 + 100);
    e.command(&pattern(0, &[1.0; 8], true).bytes());
    let steps: Vec<Step> = events(&e.render(6000 * 4).events);
    // Indexed from the bar line: line 6 of the bar is step 6 of eight, then 7, then the pattern wraps.
    let indices: Vec<u32> = steps.iter().map(|s| s.index).collect();
    assert_eq!(indices, [6, 7, 0, 1]);
}

#[test]
fn a_pattern_shorter_than_the_bar_wraps_and_runs_across_it() {
    let mut e = Engine::new(48000.0, 8);
    e.load_sample(1, &click(200), 1, 48000.0);
    e.command(&transport(120.0, transport_run::START).bytes());
    e.command(&track(0, 1, grid::N8).bytes());
    e.command(&pattern(0, &[1.0, 0.5, 0.25], true).bytes());
    let steps: Vec<Step> = events(&e.render(96000 * 2).events);
    assert_eq!(steps.len(), 16);
    for (i, s) in steps.iter().enumerate() {
        assert_eq!(s.frame as usize, 12000 * i);
        assert_eq!(s.index as usize, i % 3);
    }
}

#[test]
fn a_stopped_transport_holds_the_tracks_and_silences_the_loops() {
    let mut e = Engine::new(48000.0, 8);
    e.load_sample(1, &click(200), 1, 48000.0);
    e.load_sample(2, &noise(96000), 1, 48000.0);
    e.command(&transport(120.0, transport_run::START).bytes());
    e.command(&track(0, 1, grid::N16).bytes());
    e.command(&pattern(0, &[1.0; 16], true).bytes());
    e.command(&looped(0, 2, 1.0).bytes());
    let before: Vec<Step> = events(&e.render(5 * 6000 + 3000).events);
    assert_eq!(before.last().unwrap().index, 5);
    e.command(&transport(0.0, transport_run::STOP).bytes());
    let out = e.render(48000);
    assert!(events::<Step>(&out.events).is_empty());
    assert!(out.l[4800..].iter().all(|s| s.abs() < 1e-4), "a loop sounds with the transport stopped");
    e.command(&transport(0.0, transport_run::START).bytes());
    let out = e.render(12000);
    let after: Vec<Step> = events(&out.events);
    // Held at 16th 5.5: the next step is 6, half a 16th after the start.
    assert_eq!(after[0].index, 6);
    assert_eq!(after[0].frame as u64, 5 * 6000 + 3000 + 48000 + 3000);
    assert!(out.l.iter().any(|s| s.abs() > 0.05), "the loop does not come back");
}

#[test]
fn a_start_on_a_grid_line_waits_for_it() {
    let first_sound = |quantised: bool| {
        let mut e = Engine::new(48000.0, 8);
        e.load_sample(1, &vec![8000i16; 4800], 1, 48000.0);
        e.command(&transport(120.0, transport_run::START).bytes());
        e.render(10_000);
        let mut v = VoiceStart {
            at_frame: 0,
            voice: 1,
            sample: 1,
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
        };
        if quantised {
            v.flags = grid::N16;
        } else {
            v.at_frame = 12_000;
        }
        e.command(&v.bytes());
        10_000 + e.render(8000).l.iter().position(|s| *s != 0.0).unwrap()
    };
    assert_eq!(first_sound(true), first_sound(false));
}

#[test]
fn the_lines_hold_across_the_32_bit_wrap_of_the_frame_counter() {
    let mut e = Engine::new(48000.0, 8);
    e.load_sample(1, &click(200), 1, 48000.0);
    e.command(&ClockSet { at_frame: 0, frame: u32::MAX - 100_000 }.bytes());
    e.render(128);
    e.command(&transport(120.0, transport_run::START).bytes());
    e.command(&track(0, 1, grid::N16).bytes());
    e.command(&pattern(0, &[1.0; 16], true).bytes());
    let steps: Vec<Step> = events(&e.render(48000 * 4).events);
    assert_eq!(steps.len(), 32);
    for w in steps.windows(2) {
        assert_eq!(w[1].frame.wrapping_sub(w[0].frame), 6000);
        assert_eq!(w[1].index, (w[0].index + 1) % 16);
    }
}

#[test]
fn sixteen_tracks_and_sixteen_loops_allocate_nothing_and_keep_their_pace() {
    let mut e = Engine::new(48000.0, 64);
    e.load_sample(1, &click(2000), 1, 48000.0);
    e.load_sample(2, &noise(96000), 1, 48000.0);
    e.command(&transport(128.0, transport_run::START).bytes());
    for t in 0..16 {
        e.command(&track(t, 1, [grid::N16, grid::N32, grid::N8][t as usize % 3]).bytes());
        e.command(&pattern(t, &[1.0, 0.0, 0.5, 0.25, 0.0, 1.0, 0.0][..(t as usize % 7) + 1], true).bytes());
        e.command(&looped(t, 2, 1.0).bytes());
    }
    e.process(MAX_BLOCK);
    // The records are built before the count starts: building one allocates, taking one must not.
    let changes: Vec<Vec<u8>> = (0..40u32)
        .map(|k| {
            let swing = (k as f32 * 0.1) % 1.0;
            let mut r = TransportSet {
                at_frame: 0,
                bpm: 100.0 + k as f32,
                beats_per_bar: 3 + k % 2,
                swing,
                running: transport_run::KEEP,
            }
            .bytes();
            r.extend(pattern(k % 16, &[1.0, 0.0, 1.0], k % 2 == 0).bytes());
            r
        })
        .collect();
    let stop = LoopStop { at_frame: 0, slot: 3, beats: 2.0 }.bytes();
    let before = allocations();
    let clock = Instant::now();
    run(&mut e, 48000 * 20, |_| {});
    for records in &changes {
        e.command(records);
        run(&mut e, 4800, |_| {});
    }
    e.command(&stop);
    run(&mut e, 48000, |_| {});
    assert_eq!(allocations(), before, "the clock, the sequencer or the loops allocated while running");
    println!("16 tracks and 16 loops: 25 s rendered in {:?}", clock.elapsed());
}
