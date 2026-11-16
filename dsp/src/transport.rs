//! The transport: the core's musical clock. Tempo, bars, swing, the frame of the next grid line, the starts that
//! wait for one, and the `BEAT` events the page follows.
//!
//! Position is held as an anchor: a frame (64-bit) and the beat the transport was on at that frame, with the tempo
//! since. The beat at any later frame is `beats + (frame - from) / frames_per_beat`, and a grid line at beat `b`
//! sounds on the first frame whose beat reaches `b`. Nothing is accumulated block by block, so at a steady tempo a
//! line lands on exactly the frame the arithmetic says for as long as it runs (at 120 bpm and 48 kHz every 16th is
//! 6,000 frames, forever). A tempo change, a start or a stop starts a new anchor on its own frame at the beat the
//! old one had reached, so the phase carries through.
//!
//! Inside one block the transport keeps its course as a short run of segments (one per change that fell in the
//! block, each with its own anchor), so a tempo change on frame 70 of a block moves only what comes after frame
//! 70. Frames past the block are read from the last segment: the course as it stands. Everything that waits for a
//! line (held starts, sequencer steps, beats) counts lines, not frames, so a tempo change can move a line but never
//! skip or repeat one.
//!
//! Stopped, the transport holds its beat; started again, it carries on from there. A meter change takes effect on
//! the next bar line of the old meter. Swing delays the off 16ths: `swing` 1 moves each by half a 16th (3:1), 2/3
//! is the triplet feel. It bends the 16th and 32nd grids only; 8ths, beats and bars stay put.

use crate::engine::Events;
use crate::ops::{Beat, TransportSet, VoiceStart, grid, transport_run};
use crate::sample::SampleTable;
use crate::voice::VoicePool;

/// Starts that may wait for a line.
pub const HELD_CAP: usize = 64;
/// `TRANSPORT_SET`s that may land in one block.
const PENDING_CAP: usize = 16;
const SEG_CAP: usize = PENDING_CAP + 1;
/// Beats closer than this are the same position.
const EPS_BEATS: f64 = 1e-9;
/// A frame position within this of a whole frame is that frame.
const EPS_FRAMES: f64 = 1e-6;
/// The frame of a line the transport's course never reaches (it is stopped).
pub const NEVER: u64 = u64::MAX;
/// Beats written in one block at most (one is the most a block can hold at 400 bpm).
const BEATS_PER_BLOCK: usize = 8;

/// A stretch of the course: from frame `from`, at beat `beats`, moving `1 / fpb` beats a frame or holding still.
#[derive(Clone, Copy, Debug)]
struct Seg {
    from: u64,
    beats: f64,
    fpb: f64,
    running: bool,
}

impl Seg {
    #[inline]
    fn beats_at(&self, frame: u64) -> f64 {
        if self.running { self.beats + frame.wrapping_sub(self.from) as i64 as f64 / self.fpb } else { self.beats }
    }
}

/// A meter: bars of `bpb` beats counted from bar `bar` at beat `origin`.
#[derive(Clone, Copy, Debug)]
struct Meter {
    origin: f64,
    bar: i64,
    bpb: u32,
}

#[derive(Clone, Copy)]
struct Pending {
    at: u64,
    set: TransportSet,
}

#[derive(Clone, Copy)]
struct Held {
    v: VoiceStart,
    grid: u32,
    at: u64,
    /// The line it waits for, once `advance` has read the course on its frame.
    line: Option<i64>,
}

pub struct Transport {
    sample_rate: f64,
    bpm: f32,
    swing: f64,
    meter: Meter,
    /// A meter waiting for its first bar line.
    next_meter: Option<Meter>,
    segs: [Seg; SEG_CAP],
    nseg: usize,
    /// The frame the block being rendered starts on, and the frame after it.
    block_start: u64,
    block_end: u64,
    pending: Vec<Pending>,
    held: Vec<Held>,
    /// The first beat whose `BEAT` is not yet written.
    next_beat: i64,
}

impl Transport {
    pub fn new(sample_rate: f32) -> Self {
        let sample_rate = sample_rate as f64;
        let bpm = 120.0;
        let seg = Seg { from: 0, beats: 0.0, fpb: sample_rate * 60.0 / bpm as f64, running: false };
        Transport {
            sample_rate,
            bpm,
            swing: 0.0,
            meter: Meter { origin: 0.0, bar: 0, bpb: 4 },
            next_meter: None,
            segs: [seg; SEG_CAP],
            nseg: 1,
            block_start: 0,
            block_end: 0,
            pending: Vec::with_capacity(PENDING_CAP),
            held: Vec::with_capacity(HELD_CAP),
            next_beat: 0,
        }
    }

    /// `TRANSPORT_SET`, taking effect on frame `at`: a `bpm` or `beatsPerBar` of 0 and a negative `swing` keep
    /// what was there; `running` is `ops::transport_run`. It lands on its own frame when `advance` moves across it.
    pub fn set(&mut self, s: &TransportSet, at: u64) {
        let p = Pending { at, set: *s };
        // In frame order, arrival order among equals; a block with more than the cap folds the rest into the last.
        if self.pending.len() == PENDING_CAP {
            let last = self.pending.len() - 1;
            self.pending[last].set = merge(&self.pending[last].set, s);
            return;
        }
        let i = self.pending.iter().position(|q| q.at > at).unwrap_or(self.pending.len());
        self.pending.insert(i, p);
    }

    /// Whether it runs at the end of the block being rendered.
    pub fn running(&self) -> bool {
        self.last().running
    }

    pub fn bpm(&self) -> f32 {
        self.bpm
    }

    /// Frames in one beat at the tempo now.
    pub fn frames_per_beat(&self) -> f32 {
        self.last().fpb as f32
    }

    pub fn beats_per_bar(&self) -> u32 {
        self.meter.bpb
    }

    /// The transport's position at the start of the block being rendered, in beats since it started (bars are
    /// `beats_per_bar` of these). What a loop reads to start inside itself.
    pub fn beats(&self) -> f64 {
        self.beats_at(self.block_start)
    }

    /// The beat the transport is on at `frame`: exact inside the block being rendered, the course as it stands
    /// past it.
    pub fn beats_at(&self, frame: u64) -> f64 {
        self.seg_at(frame).beats_at(frame)
    }

    /// Frames in one beat at `frame`.
    pub fn frames_per_beat_at(&self, frame: u64) -> f64 {
        self.seg_at(frame).fpb
    }

    /// The first frame at or after `from`, inside the block being rendered, on which the transport runs.
    pub fn running_from(&self, from: u64) -> Option<u64> {
        for i in 0..self.nseg {
            let s = &self.segs[i];
            let end = if i + 1 < self.nseg { self.segs[i + 1].from } else { self.block_end };
            if s.running && end > from {
                let f = s.from.max(from);
                if f < self.block_end {
                    return Some(f);
                }
            }
        }
        None
    }

    /// The first frame on which the course reaches beat `b`; `NEVER` while it is stopped short of it. A beat
    /// already behind gives a frame at or before the block's start.
    pub fn frame_of(&self, b: f64) -> u64 {
        for i in 0..self.nseg {
            let s = &self.segs[i];
            let end = if i + 1 < self.nseg { self.segs[i + 1].from } else { NEVER };
            if !s.running {
                if b < s.beats - EPS_BEATS {
                    return s.from;
                }
                continue;
            }
            let x = (b - s.beats) * s.fpb;
            if x <= 0.0 {
                if i > 0 {
                    return s.from;
                }
                let back = (x - EPS_FRAMES).ceil();
                return (s.from as f64 + back).max(0.0) as u64;
            }
            let f = s.from.saturating_add((x - EPS_FRAMES).ceil() as u64);
            if f < end {
                return f;
            }
        }
        NEVER
    }

    /// The beat of line `k` of `grid` (`ops::grid`): bars by the meter, finer lines by their size, the 16ths and
    /// 32nds bent by the swing.
    pub fn line_beat(&self, grid: u32, k: i64) -> f64 {
        match norm(grid) {
            grid::BAR => {
                let m = match self.next_meter {
                    Some(n) if k >= n.bar => n,
                    _ => self.meter,
                };
                m.origin + (k - m.bar) as f64 * m.bpb as f64
            }
            g => {
                let b = k as f64 * size(g);
                if self.swing > 0.0 && (g == grid::N16 || g == grid::N32) { self.warp(b) } else { b }
            }
        }
    }

    /// The first line of `grid` at or after beat `b`.
    pub fn line_at_or_after(&self, grid: u32, b: f64) -> i64 {
        match norm(grid) {
            grid::BAR => {
                let (m, cap) = match self.next_meter {
                    Some(n) if b >= n.origin - EPS_BEATS => (n, None),
                    Some(n) => (self.meter, Some(n.bar)),
                    None => (self.meter, None),
                };
                let k = m.bar + ((b - m.origin) / m.bpb as f64 - EPS_BEATS).ceil() as i64;
                cap.map_or(k, |c| k.min(c))
            }
            g => {
                let mut k = (b / size(g)).floor() as i64 - 1;
                while self.line_beat(g, k) < b - EPS_BEATS {
                    k += 1;
                }
                k
            }
        }
    }

    /// The last bar line at or before beat `b`, as a bar.
    pub fn bar_at_or_before(&self, b: f64) -> i64 {
        let k = self.line_at_or_after(grid::BAR, b);
        if self.line_beat(grid::BAR, k) > b + EPS_BEATS { k - 1 } else { k }
    }

    /// The frame line `k` of `grid` sounds on.
    pub fn line_frame(&self, grid: u32, k: i64) -> u64 {
        self.frame_of(self.line_beat(grid, k))
    }

    /// The first line of `grid` that sounds at or after frame `frame`; stopped, the first at or after the beat it
    /// holds.
    pub fn first_line(&self, grid: u32, frame: u64) -> i64 {
        let mut k = self.line_at_or_after(grid, self.beats_at(frame));
        for _ in 0..4 {
            let f = self.line_frame(grid, k);
            if f >= frame {
                break;
            }
            k += 1;
        }
        k
    }

    /// The frame of the next line of `grid` (`ops::grid`) at or after frame `from`. `from` itself when the grid is
    /// off or the transport is stopped.
    pub fn next(&self, grid: u32, from: u64) -> u64 {
        if grid == grid::OFF || !self.running() {
            return from;
        }
        let f = self.line_frame(grid, self.first_line(grid, from));
        if f == NEVER { from } else { f }
    }

    /// A `VOICE_START` that waits for a line of `grid`: started by `advance` on that line's frame, through
    /// `VoicePool::start_at`. At most 64 wait; the oldest starts at once when another arrives. With the transport
    /// stopped it starts on `at`.
    pub fn hold(&mut self, v: &VoiceStart, grid: u32, at: u64, samples: &SampleTable, voices: &mut VoicePool) {
        if self.held.len() == HELD_CAP {
            let oldest = self.held.remove(0);
            voices.start_at(samples, &oldest.v, at);
        }
        self.held.push(Held { v: *v, grid, at, line: None });
    }

    /// Moves the clock across the block of `frames` frames from frame `now`: starts the held voices whose line
    /// falls in it and writes a `BEAT` for each beat that does. First in the block, before anything sounds.
    pub fn advance(
        &mut self,
        now: u64,
        frames: usize,
        samples: &SampleTable,
        voices: &mut VoicePool,
        events: &mut Events,
    ) {
        let end = now + frames as u64;

        // The course so far becomes one anchor. When the frame counter jumped (`CLOCK_SET`), the anchor moves with
        // it: the musical position carries on from where it was.
        let mut seg = self.segs[self.nseg - 1];
        if now != self.block_end {
            seg.from = seg.from.wrapping_add(now.wrapping_sub(self.block_end));
        }
        self.segs[0] = seg;
        self.nseg = 1;
        self.block_start = now;
        self.block_end = end;

        for i in 0..self.pending.len() {
            let p = self.pending[i];
            self.apply(&p.set, p.at.clamp(now, end - 1));
        }
        self.pending.clear();

        if let Some(n) = self.next_meter
            && self.beats_at(now) >= n.origin - EPS_BEATS
        {
            self.meter = n;
            self.next_meter = None;
        }

        self.release_held(now, end, samples, voices);

        for _ in 0..BEATS_PER_BLOCK {
            let b = self.next_beat as f64;
            let f = self.frame_of(b);
            if f >= end {
                break;
            }
            let bar = self.bar_at_or_before(b);
            let beat = (b - self.line_beat(grid::BAR, bar)).round().max(0.0) as u32;
            events.push(&Beat { frame: f.max(now) as u32, bar: bar.max(0) as u32, beat });
            self.next_beat += 1;
        }
    }

    /// One `TRANSPORT_SET` on frame `at`, inside the block.
    fn apply(&mut self, s: &TransportSet, at: u64) {
        let cur = self.segs[self.nseg - 1];
        let b = cur.beats_at(at);
        let mut fpb = cur.fpb;
        let mut running = cur.running;
        if s.bpm.is_finite() && s.bpm > 0.0 {
            self.bpm = s.bpm.clamp(20.0, 400.0);
            fpb = self.sample_rate * 60.0 / self.bpm as f64;
        }
        match s.running {
            transport_run::STOP => running = false,
            transport_run::START => running = true,
            _ => {}
        }
        if s.swing.is_finite() && s.swing >= 0.0 {
            self.swing = s.swing.min(1.0) as f64;
        }
        if s.beats_per_bar > 0 {
            self.meter_change(s.beats_per_bar.min(32), b);
        }
        if fpb == cur.fpb && running == cur.running {
            return;
        }
        let i = self.nseg - 1;
        if cur.from == at {
            // On the segment's own frame: the change rewrites it from its start.
            self.segs[i] = Seg { from: at, beats: cur.beats, fpb, running };
        } else if self.nseg == SEG_CAP {
            // Out of room (more changes in one block than any caller sends): the last stretch starts here.
            self.segs[i] = Seg { from: at, beats: b, fpb, running };
        } else {
            self.segs[self.nseg] = Seg { from: at, beats: b, fpb, running };
            self.nseg += 1;
        }
    }

    /// A meter of `bpb` from the first bar line at or after beat `b`.
    fn meter_change(&mut self, bpb: u32, b: f64) {
        if let Some(n) = self.next_meter
            && b >= n.origin - EPS_BEATS
        {
            self.meter = n;
            self.next_meter = None;
        }
        let now = self.next_meter.map_or(self.meter.bpb, |n| n.bpb);
        if bpb == now {
            return;
        }
        self.next_meter = None;
        if bpb == self.meter.bpb {
            return;
        }
        let bar = self.line_at_or_after(grid::BAR, b);
        let origin = self.line_beat(grid::BAR, bar);
        self.next_meter = Some(Meter { origin, bar, bpb });
    }

    /// Starts the held voices whose line falls before `end`; every one that waits while the transport is stopped
    /// starts at once.
    fn release_held(&mut self, now: u64, end: u64, samples: &SampleTable, voices: &mut VoicePool) {
        let mut keep = 0;
        for i in 0..self.held.len() {
            let mut h = self.held[i];
            if h.line.is_none() && self.seg_at(h.at).running {
                h.line = Some(self.first_line(h.grid, h.at));
            }
            let fire = match h.line {
                None => Some(h.at.max(now)),
                Some(k) => {
                    let f = self.line_frame(h.grid, k);
                    if f < end {
                        Some(f.max(now))
                    } else if f == NEVER && !self.running() {
                        Some(now)
                    } else {
                        None
                    }
                }
            };
            match fire {
                Some(f) => voices.start_at(samples, &h.v, f),
                None => {
                    self.held[keep] = h;
                    keep += 1;
                }
            }
        }
        self.held.truncate(keep);
    }

    #[inline]
    fn last(&self) -> &Seg {
        &self.segs[self.nseg - 1]
    }

    #[inline]
    fn seg_at(&self, frame: u64) -> &Seg {
        let mut i = 0;
        while i + 1 < self.nseg && self.segs[i + 1].from <= frame {
            i += 1;
        }
        &self.segs[i]
    }

    /// Bends straight beat `b` by the swing: inside each 8th the off 16th moves later by `swing` half 16ths, and
    /// the stretches either side of it are scaled to fit.
    fn warp(&self, b: f64) -> f64 {
        let e = (b * 2.0).floor() / 2.0;
        let x = b - e;
        let d = self.swing * 0.125;
        if x <= 0.25 { e + x * (0.25 + d) / 0.25 } else { e + 0.25 + d + (x - 0.25) * (0.25 - d) / 0.25 }
    }
}

/// A grid the lines are counted on: anything unknown is the 16th.
#[inline]
fn norm(g: u32) -> u32 {
    match g {
        grid::N32 | grid::N16 | grid::N8 | grid::N4 | grid::BAR => g,
        _ => grid::N16,
    }
}

/// Beats between the lines of a grid finer than the bar.
#[inline]
fn size(g: u32) -> f64 {
    match g {
        grid::N32 => 0.125,
        grid::N8 => 0.5,
        grid::N4 => 1.0,
        _ => 0.25,
    }
}

/// `b` laid over `a`: what `b` keeps is `a`'s.
fn merge(a: &TransportSet, b: &TransportSet) -> TransportSet {
    TransportSet {
        at_frame: b.at_frame,
        bpm: if b.bpm.is_finite() && b.bpm > 0.0 { b.bpm } else { a.bpm },
        beats_per_bar: if b.beats_per_bar > 0 { b.beats_per_bar } else { a.beats_per_bar },
        swing: if b.swing.is_finite() && b.swing >= 0.0 { b.swing } else { a.swing },
        running: if b.running == transport_run::KEEP { a.running } else { b.running },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::Engine;
    use crate::ops::{ClockSet, HEADER, Record};

    fn set(bpm: f32, running: u32) -> TransportSet {
        TransportSet { at_frame: 0, bpm, beats_per_bar: 0, swing: -1.0, running }
    }

    fn beats(bytes: &[u8]) -> Vec<Beat> {
        let mut out = Vec::new();
        let mut at = 0;
        while at + HEADER <= bytes.len() {
            let len = u16::from_le_bytes([bytes[at + 2], bytes[at + 3]]) as usize;
            if u16::from_le_bytes([bytes[at], bytes[at + 1]]) == Beat::OP {
                out.push(Beat::read(&bytes[at..at + len]).unwrap());
            }
            at += len;
        }
        out
    }

    fn engine() -> Engine {
        Engine::new(48000.0, 4)
    }

    #[test]
    fn a_stopped_transport_holds_its_beat_and_reaches_no_line() {
        let t = Transport::new(48000.0);
        assert_eq!(t.frame_of(1.0), NEVER);
        assert_eq!(t.next(grid::N16, 500), 500);
    }

    #[test]
    fn beats_land_on_their_frames_and_count_bars() {
        let mut e = engine();
        e.command(&set(120.0, transport_run::START).bytes());
        let b = beats(&e.render(24000 * 9).events);
        assert_eq!(b.len(), 9);
        for (i, b) in b.iter().enumerate() {
            assert_eq!(b.frame as usize, 24000 * i);
            assert_eq!((b.bar, b.beat), (i as u32 / 4, i as u32 % 4));
        }
    }

    #[test]
    fn stopping_and_starting_carries_on_from_the_beat_it_held() {
        let mut e = engine();
        e.command(&set(120.0, transport_run::START).bytes());
        e.render(36000);
        e.command(&set(0.0, transport_run::STOP).bytes());
        assert!(beats(&e.render(48000).events).is_empty());
        e.command(&set(0.0, transport_run::START).bytes());
        let b = beats(&e.render(24000).events);
        // Beat 1.5 held: beat 2 is half a beat after the start.
        assert_eq!(b[0].frame, 84000 + 12000);
        assert_eq!(b[0].beat, 2);
    }

    #[test]
    fn a_start_sent_twice_changes_nothing() {
        let mut e = engine();
        e.command(&set(120.0, transport_run::START).bytes());
        e.render(30000);
        e.command(&set(0.0, transport_run::START).bytes());
        let b = beats(&e.render(30000).events);
        assert_eq!(b[0].frame, 48000);
    }

    #[test]
    fn swing_moves_the_off_16ths_only() {
        let mut e = engine();
        e.command(
            &TransportSet { at_frame: 0, bpm: 120.0, beats_per_bar: 4, swing: 1.0, running: transport_run::START }
                .bytes(),
        );
        e.render(128);
        let t = &e.transport;
        assert_eq!(t.line_frame(grid::N16, 0), 0);
        assert_eq!(t.line_frame(grid::N16, 1), 9000);
        assert_eq!(t.line_frame(grid::N16, 2), 12000);
        assert_eq!(t.line_frame(grid::N16, 3), 21000);
        assert_eq!(t.line_frame(grid::N8, 1), 12000);
        assert_eq!(t.line_frame(grid::N32, 1), 4500);
    }

    #[test]
    fn a_meter_change_waits_for_the_bar_line() {
        let mut e = engine();
        e.command(&set(120.0, transport_run::START).bytes());
        e.render(24000);
        e.command(
            &TransportSet { at_frame: 0, bpm: 0.0, beats_per_bar: 3, swing: -1.0, running: transport_run::KEEP }
                .bytes(),
        );
        let b = beats(&e.render(24000 * 8).events);
        let bars: Vec<(u32, u32)> = b.iter().map(|b| (b.bar, b.beat)).collect();
        assert_eq!(&bars[..7], &[(0, 1), (0, 2), (0, 3), (1, 0), (1, 1), (1, 2), (2, 0)]);
        assert_eq!(e.transport.beats_per_bar(), 3);
    }

    #[test]
    fn the_clock_jumping_keeps_the_musical_position() {
        let mut e = engine();
        e.command(&set(120.0, transport_run::START).bytes());
        e.render(12000);
        e.command(&ClockSet { at_frame: 0, frame: 1_000_000 }.bytes());
        let b = beats(&e.render(24000).events);
        // Half a beat in when the clock jumped: beat 1 comes half a beat later on the new clock.
        assert_eq!(b[0].frame, 1_000_000 + 12000);
        assert_eq!(b[0].beat, 1);
    }
}
