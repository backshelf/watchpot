//! The sequencer: 16 tracks of up to 64 steps, each step a voice started on its exact frame of the transport's
//! grid, and a `STEP` event for the page to draw.
//!
//! A track counts the lines of its grid (`Transport::line_frame`), not frames, so a tempo change moves a step but
//! never skips or repeats one. Line `k` plays step `(k - start) mod count`, where `start` is the line the pattern
//! took effect on: a pattern shorter than the bar wraps inside it, a longer one runs across bars (polymetre). A new
//! pattern waits for the next bar line and plays from its first step there; sent with `now`, it takes over from the
//! next step, indexed from the bar line it is inside. Every step writes a `STEP`, rests included (the page's
//! playhead); a step with a velocity starts a voice from the track's template at `gain * velocity` and the step's
//! rate. With the transport stopped no line comes, and a track holds its place.
//!
//! A step's voice takes the track's handle (`TRACK_VOICE + track`, from `ops::CORE_VOICE` up), which the shell
//! never issues.

use crate::engine::Events;
use crate::ops::{CORE_VOICE, SEQ_STEPS, SEQ_TRACKS, SeqDefine, SeqSteps, Step, VoiceStart, grid, step_source};
use crate::sample::SampleTable;
use crate::transport::{NEVER, Transport};
use crate::voice::VoicePool;

/// The handle of track 0's voices; track `t` is `TRACK_VOICE + t`.
pub const TRACK_VOICE: u32 = CORE_VOICE as u32 | 0x0001_0000;
/// Steps rank above a game's own cues (whose priorities are small numbers) and below loops.
const STEP_PRIORITY: u32 = 1 << 20;
/// Steps one track may start in one block at most (a 32nd at 400 bpm is one per 830 frames).
const STEPS_PER_BLOCK: usize = 8;

#[derive(Clone, Copy)]
struct Pattern {
    count: usize,
    velocity: [f32; SEQ_STEPS],
    rate: [f32; SEQ_STEPS],
}

const EMPTY: Pattern = Pattern { count: 0, velocity: [0.0; SEQ_STEPS], rate: [0.0; SEQ_STEPS] };

#[derive(Clone, Copy)]
struct Waiting {
    pattern: Pattern,
    at: u64,
    now: bool,
    /// The line it takes over on and the line its first step falls on, once `run` has read the transport.
    from: Option<(i64, i64)>,
}

#[derive(Clone, Copy)]
struct Track {
    def: Option<SeqDefine>,
    grid: u32,
    pattern: Pattern,
    /// The line step 0 of the pattern fell on.
    start: i64,
    waiting: Option<Waiting>,
    /// The next line to play; `None` until `run` finds it.
    next: Option<i64>,
    /// The grid changed: `start` is counted again from the bar line the track is inside.
    reindex: bool,
}

const IDLE: Track =
    Track { def: None, grid: grid::N16, pattern: EMPTY, start: 0, waiting: None, next: None, reindex: false };

pub struct Seq {
    tracks: Vec<Track>,
}

impl Seq {
    pub fn new(_sample_rate: f32) -> Self {
        Seq { tracks: vec![IDLE; SEQ_TRACKS] }
    }

    /// `SEQ_DEFINE`: a track's voice and grid. A sample of 0 removes the track.
    pub fn define(&mut self, d: &SeqDefine) {
        let Some(t) = self.tracks.get_mut(d.track as usize) else {
            return;
        };
        if d.sample == 0 {
            *t = IDLE;
            return;
        }
        let g = match d.grid {
            grid::N32 | grid::N16 | grid::N8 | grid::N4 | grid::BAR => d.grid,
            _ => grid::N16,
        };
        if g != t.grid {
            // Lines are counted afresh on the new grid: the pattern keeps going, indexed from its bar.
            t.grid = g;
            t.next = None;
            if let Some(w) = t.waiting.as_mut() {
                w.from = None;
            }
            t.reindex = true;
        }
        t.def = Some(*d);
    }

    /// `SEQ_STEPS`, arriving on frame `at`: a track's pattern, from the next bar line or at once.
    pub fn steps(&mut self, s: &SeqSteps, at: u64) {
        let Some(t) = self.tracks.get_mut(s.track as usize) else {
            return;
        };
        let count = (s.count as usize).min(SEQ_STEPS);
        let mut pattern = EMPTY;
        pattern.count = count;
        pattern.velocity[..count].copy_from_slice(&s.velocity[..count]);
        pattern.rate[..count].copy_from_slice(&s.rate[..count]);
        t.waiting = Some(Waiting { pattern, at, now: s.now == 1, from: None });
    }

    /// Starts the steps that fall in the block of `frames` frames from frame `now`, and writes their `STEP`s.
    /// After `Transport::advance`, before the voices render.
    pub fn run(
        &mut self,
        transport: &Transport,
        samples: &SampleTable,
        voices: &mut VoicePool,
        now: u64,
        frames: usize,
        events: &mut Events,
    ) {
        let end = now + frames as u64;
        for (i, t) in self.tracks.iter_mut().enumerate() {
            let Some(def) = t.def else { continue };
            let g = t.grid;
            let next = *t.next.get_or_insert_with(|| transport.first_line(g, now));
            if t.reindex {
                let bar = transport.bar_at_or_before(transport.beats_at(now));
                t.start = transport.line_at_or_after(g, transport.line_beat(grid::BAR, bar));
                t.reindex = false;
            }
            if let Some(w) = t.waiting.as_mut()
                && w.from.is_none()
            {
                w.from = Some(if w.now {
                    // From the next step, indexed from the bar line it is inside.
                    let bar = transport.bar_at_or_before(transport.beats_at(w.at.max(now)));
                    (next, transport.line_at_or_after(g, transport.line_beat(grid::BAR, bar)))
                } else {
                    let bar = transport.first_line(grid::BAR, w.at.max(now));
                    let line = transport.line_at_or_after(g, transport.line_beat(grid::BAR, bar)).max(next);
                    (line, line)
                });
            }
            for _ in 0..STEPS_PER_BLOCK {
                let k = t.next.unwrap_or(next);
                let f = transport.line_frame(g, k);
                if f >= end || f == NEVER {
                    break;
                }
                if let Some(Waiting { pattern, from: Some((from, start)), .. }) = t.waiting
                    && k >= from
                {
                    t.pattern = pattern;
                    t.start = start;
                    t.waiting = None;
                }
                t.next = Some(k + 1);
                let count = t.pattern.count;
                if count == 0 {
                    continue;
                }
                let index = (k - t.start).rem_euclid(count as i64) as usize;
                let at = f.max(now);
                events.push(&Step { frame: at as u32, source: step_source::SEQ, track: i as u32, index: index as u32 });
                let velocity = t.pattern.velocity[index];
                if velocity.is_finite() && velocity > 0.0 {
                    let rate = t.pattern.rate[index];
                    let v = VoiceStart {
                        at_frame: 0,
                        voice: TRACK_VOICE + i as u32,
                        sample: def.sample,
                        bus: def.bus,
                        gain: def.gain * velocity,
                        pan: def.pan,
                        rate: if rate.is_finite() && rate > 0.0 { rate } else { 1.0 },
                        offset: 0,
                        loop_start: 0,
                        loop_end: 0,
                        attack: 0,
                        release: 0,
                        send_bus1: def.send_bus1,
                        send1: def.send1,
                        send_bus2: def.send_bus2,
                        send2: def.send2,
                        priority: STEP_PRIORITY,
                        flags: 0,
                    };
                    voices.start_at(samples, &v, at);
                }
            }
        }
    }
}
