//! The wave 2 contract: effect slots, slewed parameters and the place of a voice are wired through the commands.
//! These hold whatever the units inside the slots do.

use watchpot_dsp::Engine;
use watchpot_dsp::ops::{
    BabbleDefine, BabbleSay, BabbleStop, FxDefine, FxSet, GenSet, GenStart, GenStop, GrainSet, GrainStart, GrainStop, LoopSet,
    LoopStart, LoopStop, Meters, Record, SeqDefine, SeqSteps, SpaceSet, TransportSet, VoicePlace, VoiceStart, curve, fx_kind,
    fx_param, gen_kind, gen_param, grain_param, grid, space_mode, transport_run,
};

const RATE: f32 = 48000.0;

fn tone(frames: usize) -> Vec<i16> {
    (0..frames).map(|i| ((i as f32 * 0.05).sin() * 16000.0) as i16).collect()
}

fn start(voice: u32, bus: u32) -> VoiceStart {
    VoiceStart {
        at_frame: 0,
        voice,
        sample: 1,
        bus,
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

fn rms(x: &[f32]) -> f32 {
    (x.iter().map(|s| s * s).sum::<f32>() / x.len().max(1) as f32).sqrt()
}

fn engine() -> Engine {
    let mut e = Engine::new(RATE, 16);
    e.load_sample(1, &tone(48000), 1, RATE);
    e
}

#[test]
fn a_voice_placed_to_the_right_is_louder_on_the_right_and_an_unplaced_one_is_even() {
    let mut e = engine();
    e.command(&start(1, 1).bytes());
    let even = e.render(9600);
    assert!((rms(&even.l) - rms(&even.r)).abs() < 1e-4);

    let mut e = engine();
    e.command(&start(1, 1).bytes());
    e.command(&VoicePlace { at_frame: 0, voice: 1, pan: 1.0, distance: 0.0, occlusion: 0.0, slew: 0 }.bytes());
    let placed = e.render(9600);
    assert!(rms(&placed.r) > 2.0 * rms(&placed.l), "{} {}", rms(&placed.l), rms(&placed.r));
}

#[test]
fn a_far_voice_is_quieter_than_a_near_one_in_both_modes() {
    for mode in [space_mode::SPEAKERS, space_mode::HEADPHONES] {
        let level = |distance: f32| {
            let mut e = engine();
            e.command(&SpaceSet { at_frame: 0, mode }.bytes());
            e.command(&start(1, 1).bytes());
            e.command(&VoicePlace { at_frame: 0, voice: 1, pan: 0.0, distance, occlusion: 0.0, slew: 0 }.bytes());
            let out = e.render(9600);
            rms(&out.l) + rms(&out.r)
        };
        assert!(level(1.0) < 0.6 * level(0.0));
    }
}

#[test]
fn a_place_for_a_later_frame_reaches_a_voice_started_on_that_frame() {
    let mut e = engine();
    let mut s = start(1, 1);
    s.at_frame = 2000;
    e.command(&s.bytes());
    e.command(&VoicePlace { at_frame: 2000, voice: 1, pan: -1.0, distance: 0.0, occlusion: 0.0, slew: 0 }.bytes());
    let out = e.render(12000);
    assert!(rms(&out.l) > 2.0 * rms(&out.r));
}

#[test]
fn a_slot_emptied_again_leaves_the_bus_as_it_was() {
    let mut plain = engine();
    plain.command(&start(1, 2).bytes());
    let a = plain.render(4800);

    let mut e = engine();
    e.command(&FxDefine { at_frame: 0, bus: 2, slot: 0, kind: fx_kind::SVF, key: 0 }.bytes());
    e.command(&FxDefine { at_frame: 0, bus: 2, slot: 0, kind: fx_kind::NONE, key: 0 }.bytes());
    e.command(&start(1, 2).bytes());
    let b = e.render(4800);
    assert_eq!(a.l, b.l);
    assert_eq!(a.r, b.r);
}

#[test]
fn every_kind_can_sit_on_a_bus_and_on_the_master_and_the_output_stays_finite() {
    let kinds = [
        fx_kind::SVF,
        fx_kind::EQ,
        fx_kind::COMP,
        fx_kind::SAT,
        fx_kind::DELAY,
        fx_kind::TAPE,
        fx_kind::CRUSH,
        fx_kind::FDN,
        fx_kind::CONV,
    ];
    for bus in [0u32, 3] {
        let mut e = engine();
        for (slot, kind) in kinds.iter().enumerate().take(6) {
            e.command(&FxDefine { at_frame: 0, bus, slot: slot as u32, kind: *kind, key: 2 }.bytes());
        }
        e.command(&start(1, 3).bytes());
        let out = e.render(9600);
        assert!(out.l.iter().chain(&out.r).all(|s| s.is_finite()));
    }
    let mut e = engine();
    for (slot, kind) in kinds.iter().enumerate().skip(6) {
        e.command(&FxDefine { at_frame: 0, bus: 3, slot: slot as u32 - 6, kind: *kind, key: 0 }.bytes());
    }
    e.command(&start(1, 3).bytes());
    let out = e.render(9600);
    assert!(out.l.iter().chain(&out.r).all(|s| s.is_finite()));
}

#[test]
fn a_parameter_set_with_a_slew_and_one_for_a_slot_that_is_empty_are_both_taken() {
    let mut e = engine();
    e.command(&FxDefine { at_frame: 0, bus: 1, slot: 0, kind: fx_kind::SVF, key: 0 }.bytes());
    e.command(
        &FxSet { at_frame: 0, bus: 1, slot: 0, param: fx_param::svf::CUTOFF as u32, value: 8000.0, slew: 0, curve: curve::LIN }
            .bytes(),
    );
    e.command(
        &FxSet { at_frame: 0, bus: 1, slot: 0, param: fx_param::svf::CUTOFF as u32, value: 200.0, slew: 4800, curve: curve::EXP }
            .bytes(),
    );
    e.command(&FxSet { at_frame: 0, bus: 5, slot: 4, param: 0, value: 1.0, slew: 0, curve: curve::LIN }.bytes());
    e.command(&start(1, 1).bytes());
    let out = e.render(9600);
    assert!(out.l.iter().any(|s| s.abs() > 0.01));
    assert!(out.l.iter().all(|s| s.is_finite()));
}

// Wave 3: the transport, the sequencer, loops, grains, generators, babble and the freeze are wired through the
// commands. These hold whatever the modules behind them do.

#[test]
fn every_wave_3_command_is_taken_and_the_output_stays_finite() {
    let mut e = engine();
    e.command(&TransportSet { at_frame: 0, bpm: 120.0, beats_per_bar: 4, swing: 0.0, running: transport_run::START }.bytes());
    e.command(
        &SeqDefine { at_frame: 0, track: 0, sample: 1, bus: 1, gain: 0.5, pan: 0.0, send_bus1: 0, send1: 0.0, send_bus2: 0, send2: 0.0, grid: grid::N16 }
            .bytes(),
    );
    let mut velocity = [0.0f32; 64];
    velocity[0] = 1.0;
    velocity[4] = 0.5;
    e.command(&SeqSteps { at_frame: 0, track: 0, count: 8, now: 1, velocity, rate: [0.0; 64] }.bytes());
    e.command(
        &LoopStart { at_frame: 0, slot: 0, sample: 1, bus: 3, gain: 0.5, level: 1.0, bars: 1.0, send_bus1: 0, send1: 0.0, send_bus2: 0, send2: 0.0 }
            .bytes(),
    );
    e.command(&LoopSet { at_frame: 0, slot: 0, level: 0.5, beats: 1.0 }.bytes());
    e.command(
        &GrainStart { at_frame: 0, cloud: 0, sample: 1, bus: 1, pan: 0.0, send_bus1: 0, send1: 0.0, send_bus2: 0, send2: 0.0, seed: 7 }.bytes(),
    );
    e.command(&GrainSet { at_frame: 0, cloud: 0, param: grain_param::POSITION, value: 0.5, slew: 0 }.bytes());
    e.command(
        &GenStart { at_frame: 0, slot: 0, kind: gen_kind::MOTOR, bus: 1, gain: 0.3, pan: 0.0, send_bus1: 0, send1: 0.0, send_bus2: 0, send2: 0.0, seed: 3 }
            .bytes(),
    );
    e.command(&GenSet { at_frame: 0, slot: 0, param: gen_param::motor::RATE, value: 220.0, slew: 480 }.bytes());
    e.command(&BabbleDefine { at_frame: 0, babble: 0, sample: 0, bus: 5, gain: 0.5, pan: 0.0, send_bus1: 0, send1: 0.0 }.bytes());
    for index in 0..3u32 {
        e.command(
            &BabbleSay {
                at_frame: 4800 * (index + 1),
                babble: 0,
                line: 1,
                index,
                length: 3600,
                pitch: 1.0,
                formant1: 700.0,
                formant2: 1200.0,
                noise: 0.2,
                level: 0.5,
            }
            .bytes(),
        );
    }
    e.command(&FxDefine { at_frame: 0, bus: 3, slot: 0, kind: fx_kind::FREEZE, key: 0 }.bytes());
    e.command(&FxSet { at_frame: 0, bus: 3, slot: 0, param: fx_param::freeze::AMOUNT as u32, value: 1.0, slew: 480, curve: curve::LIN }.bytes());
    let out = e.render(48000);
    assert!(out.l.iter().chain(&out.r).all(|s| s.is_finite()));

    e.command(&LoopStop { at_frame: 0, slot: 0, beats: 1.0 }.bytes());
    e.command(&GrainStop { at_frame: 0, cloud: 0, release: 480 }.bytes());
    e.command(&GenStop { at_frame: 0, slot: 0, release: 480 }.bytes());
    e.command(&BabbleStop { at_frame: 0, babble: 0, line: 1 }.bytes());
    e.command(&TransportSet { at_frame: 0, bpm: 0.0, beats_per_bar: 0, swing: -1.0, running: transport_run::STOP }.bytes());
    let out = e.render(96000);
    assert!(out.l.iter().chain(&out.r).all(|s| s.is_finite()));
    // With everything stopped, what is left rings out.
    assert!(rms(&out.l[72000..]) < 1e-3, "{}", rms(&out.l[72000..]));
}

#[test]
fn a_start_that_waits_for_a_grid_line_starts_at_once_while_the_transport_is_stopped() {
    let mut e = engine();
    let mut s = start(1, 1);
    s.flags = grid::BAR;
    e.command(&s.bytes());
    let out = e.render(4800);
    assert!(out.l.iter().any(|x| x.abs() > 0.01));
}

#[test]
fn a_cloud_or_a_babble_over_a_sample_that_is_freed_does_no_harm() {
    let mut e = engine();
    e.load_sample(2, &tone(24000), 1, RATE);
    e.command(
        &GrainStart { at_frame: 0, cloud: 1, sample: 2, bus: 1, pan: 0.0, send_bus1: 0, send1: 0.0, send_bus2: 0, send2: 0.0, seed: 1 }.bytes(),
    );
    e.command(&BabbleDefine { at_frame: 0, babble: 1, sample: 2, bus: 5, gain: 0.5, pan: 0.0, send_bus1: 0, send1: 0.0 }.bytes());
    e.command(
        &BabbleSay { at_frame: 0, babble: 1, line: 1, index: 0, length: 48000, pitch: 1.0, formant1: 700.0, formant2: 1200.0, noise: 0.0, level: 0.5 }
            .bytes(),
    );
    e.render(4800);
    e.command(&watchpot_dsp::ops::SampleFree { at_frame: 0, sample: 2 }.bytes());
    let out = e.render(24000);
    assert!(out.l.iter().chain(&out.r).all(|s| s.is_finite()));
    // The id can be loaded again with something else.
    assert!(e.load_sample(2, &tone(1000), 1, RATE));
    let out = e.render(4800);
    assert!(out.l.iter().chain(&out.r).all(|s| s.is_finite()));
}

#[test]
fn the_meters_split_the_master_into_three_bands() {
    let bands = |hz: f32| {
        let mut e = Engine::new(RATE, 4);
        let pcm: Vec<i16> = (0..48000).map(|i| ((i as f32 * core::f32::consts::TAU * hz / RATE).sin() * 12000.0) as i16).collect();
        e.load_sample(1, &pcm, 1, RATE);
        e.command(&start(0, 0).bytes());
        let out = e.render(24000);
        // The last METERS event of the stretch.
        let mut at = 0;
        let mut last = None;
        while at + 4 <= out.events.len() {
            let len = u16::from_le_bytes([out.events[at + 2], out.events[at + 3]]) as usize;
            if len < 4 {
                break;
            }
            if u16::from_le_bytes([out.events[at], out.events[at + 1]]) == Meters::OP {
                last = Meters::read(&out.events[at..at + len]);
            }
            at += len;
        }
        last.expect("a METERS event").bands
    };
    let low = bands(60.0);
    let mid = bands(1000.0);
    let high = bands(9000.0);
    // The split is two one-pole filters, 6 dB an octave: each tone lands mostly, not wholly, in its band.
    assert!(low[0] > 2.0 * low[1] && low[0] > 10.0 * low[2], "{low:?}");
    assert!(mid[1] > 2.0 * mid[0] && mid[1] > 2.0 * mid[2], "{mid:?}");
    assert!(high[2] > 1.5 * high[1] && high[2] > 10.0 * high[0], "{high:?}");
}

