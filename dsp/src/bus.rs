//! The buses: stereo sums the voices play into, each summed into another on the way to the master (bus 0).
//!
//! A bus has a gain and a mute (both ramped, so neither clicks), an output bus (the master unless `BUS_DEFINE`
//! names another) and send taps to any other bus. Sends are post-fader. The graph never holds a cycle: a define or
//! a send that would close one is refused (a define falls back to the master). The buses are summed in an order
//! fixed whenever the graph changes, every bus after all the buses that feed it, so one pass suffices.
//!
//! A bus's effects (`fx::Rack`) run on its block before its fader, the master's before the master's gain. A bus
//! that holds an effect is processed every block, sounding or not, so a tail rings out.

use crate::fx::Rack;
use crate::math::finite_or;
use crate::ops::{BusDefine, BusSet, MAX_BLOCK, MAX_BUSES, bus_param, master_param};

/// The master's index.
pub const MASTER: usize = 0;

/// How long a mute or an unslewed gain takes to land, in milliseconds: short enough to feel immediate, long enough
/// not to click.
const DECLICK_MS: f32 = 5.0;

/// A value that moves linearly to a target over a number of frames.
#[derive(Clone, Copy, Debug)]
pub struct Ramp {
    pub value: f32,
    target: f32,
    step: f32,
    /// Frames until `value` is `target`; 0 when it is.
    pub left: u32,
}

impl Ramp {
    pub const fn at(value: f32) -> Self {
        Ramp { value, target: value, step: 0.0, left: 0 }
    }

    /// Heads for `target`, arriving in `frames` frames (0: at once).
    #[inline]
    pub fn go(&mut self, target: f32, frames: u32) {
        self.target = target;
        if frames == 0 || target == self.value {
            self.value = target;
            self.left = 0;
        } else {
            self.step = (target - self.value) / frames as f32;
            self.left = frames;
        }
    }

    /// Moves on `n` frames.
    #[inline]
    pub fn advance(&mut self, n: u32) {
        if self.left == 0 {
            return;
        }
        if n >= self.left {
            self.value = self.target;
            self.left = 0;
        } else {
            self.value += self.step * n as f32;
            self.left -= n;
        }
    }

    /// Where it is heading.
    #[inline]
    pub fn target(&self) -> f32 {
        self.target
    }

    /// Silent now and staying so.
    #[inline]
    pub fn is_off(&self) -> bool {
        self.value == 0.0 && self.left == 0
    }
}

pub struct Buses {
    l: Vec<f32>,
    r: Vec<f32>,
    gain: [f32; MAX_BUSES],
    muted: [bool; MAX_BUSES],
    /// The gain that applies: 0 while muted, ramped.
    level: [Ramp; MAX_BUSES],
    out: [usize; MAX_BUSES],
    /// `send[from][to]`: post-fader send levels.
    send: [[Ramp; MAX_BUSES]; MAX_BUSES],
    /// Buses 1 to 15 in the order they are summed.
    order: [usize; MAX_BUSES],
    order_len: usize,
    /// Buses written this block, by bit: only these are cleared, summed and metered.
    touched: u32,
    declick: u32,
    /// One bus's block while its effects run.
    work_l: Vec<f32>,
    work_r: Vec<f32>,
}

impl Buses {
    pub fn new(sample_rate: f32) -> Self {
        let mut buses = Buses {
            l: vec![0.0; MAX_BUSES * MAX_BLOCK],
            r: vec![0.0; MAX_BUSES * MAX_BLOCK],
            gain: [1.0; MAX_BUSES],
            muted: [false; MAX_BUSES],
            level: [Ramp::at(1.0); MAX_BUSES],
            out: [MASTER; MAX_BUSES],
            send: [[Ramp::at(0.0); MAX_BUSES]; MAX_BUSES],
            order: [0; MAX_BUSES],
            order_len: 0,
            touched: 0,
            declick: crate::math::ms_to_frames(DECLICK_MS, sample_rate),
            work_l: vec![0.0; MAX_BLOCK],
            work_r: vec![0.0; MAX_BLOCK],
        };
        buses.reorder();
        buses
    }

    /// Defines or redefines a bus: its output bus and its gain. An output that would close a loop is the master.
    pub fn define(&mut self, d: &BusDefine) {
        let bus = d.bus as usize;
        if bus == MASTER || bus >= MAX_BUSES {
            return;
        }
        let out = d.out as usize;
        let was = self.out[bus];
        self.out[bus] = if out < MAX_BUSES && out != bus { out } else { MASTER };
        if !self.reorder() {
            self.out[bus] = MASTER;
            if !self.reorder() {
                self.out[bus] = was;
                self.reorder();
            }
        }
        self.gain[bus] = finite_or(d.gain, 1.0).max(0.0);
        self.retarget(bus, 0);
    }

    /// Moves a parameter of a bus (`bus_param`).
    pub fn set(&mut self, s: &BusSet) {
        let bus = s.bus as usize;
        if bus >= MAX_BUSES {
            return;
        }
        match s.param {
            bus_param::GAIN => {
                self.gain[bus] = finite_or(s.value, self.gain[bus]).max(0.0);
                self.retarget(bus, s.slew);
            }
            bus_param::MUTE => {
                self.muted[bus] = s.value != 0.0;
                self.retarget(bus, s.slew.max(self.declick));
            }
            bus_param::SEND => self.set_send(bus, s.index as usize, s.value, s.slew),
            _ => {}
        }
    }

    /// Moves a parameter of the master (`master_param`, but for the ceiling, which is the limiter's).
    pub fn master_set(&mut self, param: u32, value: f32, slew: u32) {
        match param {
            master_param::GAIN => {
                self.gain[MASTER] = finite_or(value, self.gain[MASTER]).max(0.0);
                self.retarget(MASTER, slew);
            }
            master_param::MUTE => {
                self.muted[MASTER] = value != 0.0;
                self.retarget(MASTER, slew.max(self.declick));
            }
            _ => {}
        }
    }

    fn retarget(&mut self, bus: usize, slew: u32) {
        let target = if self.muted[bus] { 0.0 } else { self.gain[bus] };
        self.level[bus].go(target, slew);
    }

    fn set_send(&mut self, from: usize, to: usize, value: f32, slew: u32) {
        if from == MASTER || to >= MAX_BUSES || to == from {
            return;
        }
        let level = finite_or(value, 0.0).max(0.0);
        let was = self.send[from][to];
        self.send[from][to].go(level, slew);
        if level > 0.0 && !self.reorder() {
            self.send[from][to] = was;
            self.reorder();
        }
    }

    /// Whether `from` feeds `to` (its output or a live send).
    fn feeds(&self, from: usize, to: usize) -> bool {
        self.out[from] == to || {
            let s = &self.send[from][to];
            s.value > 0.0 || s.target() > 0.0
        }
    }

    /// Orders buses 1 to 15 so each comes after every bus that feeds it. False, leaving the order as it was, when
    /// the graph holds a cycle.
    fn reorder(&mut self) -> bool {
        let mut waiting = [0u8; MAX_BUSES];
        for from in 1..MAX_BUSES {
            for (to, w) in waiting.iter_mut().enumerate().skip(1) {
                if to != from && self.feeds(from, to) {
                    *w += 1;
                }
            }
        }
        let mut order = [0usize; MAX_BUSES];
        let mut len = 0;
        let mut done = [false; MAX_BUSES];
        loop {
            let mut moved = false;
            for bus in 1..MAX_BUSES {
                if done[bus] || waiting[bus] > 0 {
                    continue;
                }
                done[bus] = true;
                order[len] = bus;
                len += 1;
                moved = true;
                for (to, w) in waiting.iter_mut().enumerate().skip(1) {
                    if to != bus && self.feeds(bus, to) {
                        *w -= 1;
                    }
                }
            }
            if !moved {
                break;
            }
        }
        if len != MAX_BUSES - 1 {
            return false;
        }
        self.order = order;
        self.order_len = len;
        true
    }

    /// Silences every bus written last block, before the voices render.
    pub fn clear(&mut self, _frames: usize) {
        let mut touched = self.touched | 1;
        while touched != 0 {
            let bus = touched.trailing_zeros() as usize;
            touched &= touched - 1;
            self.l[bus * MAX_BLOCK..(bus + 1) * MAX_BLOCK].fill(0.0);
            self.r[bus * MAX_BLOCK..(bus + 1) * MAX_BLOCK].fill(0.0);
        }
        self.touched = 0;
    }

    /// The block a voice adds into for bus `bus` (`MAX_BLOCK` frames a side). A bus out of range is the master.
    #[inline]
    pub fn input(&mut self, bus: usize) -> (&mut [f32], &mut [f32]) {
        let bus = if bus < MAX_BUSES { bus } else { MASTER };
        self.touched |= 1 << bus;
        let at = bus * MAX_BLOCK;
        (&mut self.l[at..at + MAX_BLOCK], &mut self.r[at..at + MAX_BLOCK])
    }

    /// Whether anything reached bus `bus` this block. An untouched bus holds silence.
    #[inline]
    pub fn touched(&self, bus: usize) -> bool {
        bus < MAX_BUSES && self.touched & (1 << bus) != 0
    }

    /// Adds `frames` frames of bus `from` into bus `to`, scaled by a ramp from `g0` to `g1` across them.
    fn add(&mut self, from: usize, to: usize, frames: usize, g0: f32, g1: f32) {
        let d = (g1 - g0) / frames as f32;
        for side in [&mut self.l, &mut self.r] {
            let (a, b) = side.split_at_mut(from.max(to) * MAX_BLOCK);
            let (src, dst) = if from < to {
                (&a[from * MAX_BLOCK..from * MAX_BLOCK + frames], &mut b[..frames])
            } else {
                (&b[..frames] as &[f32], &mut a[to * MAX_BLOCK..to * MAX_BLOCK + frames])
            };
            let mut g = g0;
            for (y, x) in dst.iter_mut().zip(src) {
                *y += x * g;
                g += d;
            }
        }
        self.touched |= 1 << to;
    }

    /// Runs bus `bus`'s effects over its block, in place. A bus with effects counts as written to.
    fn effects(&mut self, bus: usize, frames: usize, rack: &mut Rack) {
        if !rack.active(bus) {
            return;
        }
        let at = bus * MAX_BLOCK;
        self.work_l[..frames].copy_from_slice(&self.l[at..at + frames]);
        self.work_r[..frames].copy_from_slice(&self.r[at..at + frames]);
        rack.process(bus, &mut self.work_l[..frames], &mut self.work_r[..frames], &self.l, &self.r);
        self.l[at..at + frames].copy_from_slice(&self.work_l[..frames]);
        self.r[at..at + frames].copy_from_slice(&self.work_r[..frames]);
        self.touched |= 1 << bus;
    }

    /// Runs every bus's effects, sums every bus toward the master and writes `frames` frames of the master to
    /// `out_l` and `out_r`. Each bus's own block is left holding what it sent on (after its fader), for the meters.
    pub fn mix(&mut self, frames: usize, out_l: &mut [f32], out_r: &mut [f32], rack: &mut Rack) {
        let n = frames as u32;
        for k in 0..self.order_len {
            let bus = self.order[k];
            self.effects(bus, frames, rack);
            let g0 = self.level[bus].value;
            self.level[bus].advance(n);
            let g1 = self.level[bus].value;
            if self.touched & (1 << bus) == 0 {
                for to in 0..MAX_BUSES {
                    self.send[bus][to].advance(n);
                }
                continue;
            }
            // The fader, in place.
            let d = (g1 - g0) / frames as f32;
            let at = bus * MAX_BLOCK;
            for side in [&mut self.l, &mut self.r] {
                let mut g = g0;
                for x in &mut side[at..at + frames] {
                    *x *= g;
                    g += d;
                }
            }
            if g0 == 0.0 && g1 == 0.0 {
                self.touched &= !(1 << bus);
                for to in 0..MAX_BUSES {
                    self.send[bus][to].advance(n);
                }
                continue;
            }
            self.add(bus, self.out[bus], frames, 1.0, 1.0);
            for to in 0..MAX_BUSES {
                let s = &mut self.send[bus][to];
                if s.is_off() {
                    continue;
                }
                let s0 = s.value;
                s.advance(n);
                let s1 = s.value;
                self.add(bus, to, frames, s0, s1);
            }
        }
        self.effects(MASTER, frames, rack);
        let g0 = self.level[MASTER].value;
        self.level[MASTER].advance(n);
        let g1 = self.level[MASTER].value;
        let d = (g1 - g0) / frames as f32;
        for (out, side) in [(out_l, &self.l), (out_r, &self.r)] {
            let mut g = g0;
            for (y, x) in out[..frames].iter_mut().zip(&side[..frames]) {
                *y = x * g;
                g += d;
            }
        }
    }

    /// What bus `bus` held after the last `mix`, for the meters.
    #[inline]
    pub fn output(&self, bus: usize) -> (&[f32], &[f32]) {
        let bus = if bus < MAX_BUSES { bus } else { MASTER };
        let at = bus * MAX_BLOCK;
        (&self.l[at..at + MAX_BLOCK], &self.r[at..at + MAX_BLOCK])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn define(bus: u32, out: u32) -> BusDefine {
        BusDefine { at_frame: 0, bus, out, gain: 1.0 }
    }

    fn send(bus: u32, to: u32, value: f32) -> BusSet {
        BusSet { at_frame: 0, bus, param: bus_param::SEND, index: to, value, slew: 0 }
    }

    fn sum(buses: &mut Buses, bus: usize, x: f32) -> f32 {
        buses.clear(4);
        buses.input(bus).0[..4].fill(x);
        let (mut l, mut r) = ([0.0; 4], [0.0; 4]);
        buses.mix(4, &mut l, &mut r, &mut Rack::new(48000.0));
        l[3]
    }

    #[test]
    fn a_chain_of_buses_reaches_the_master_once() {
        let mut b = Buses::new(48000.0);
        b.define(&define(3, 2));
        b.define(&define(2, 1));
        assert!((sum(&mut b, 3, 0.5) - 0.5).abs() < 1e-6);
        assert!((sum(&mut b, 1, 0.25) - 0.25).abs() < 1e-6);
    }

    #[test]
    fn a_loop_is_refused() {
        let mut b = Buses::new(48000.0);
        b.define(&define(2, 1));
        b.define(&define(1, 2));
        assert_eq!(b.out[1], MASTER);
        b.set(&send(1, 2, 0.5));
        assert!(b.send[1][2].is_off());
        assert!((sum(&mut b, 2, 0.5) - 0.5).abs() < 1e-6);
    }

    #[test]
    fn a_send_adds_post_fader() {
        let mut b = Buses::new(48000.0);
        b.define(&BusDefine { at_frame: 0, bus: 1, out: 0, gain: 0.5 });
        b.define(&define(2, 0));
        b.set(&send(1, 2, 0.5));
        // 1.0 through a 0.5 fader to the master, plus a quarter of it through bus 2.
        assert!((sum(&mut b, 1, 1.0) - 0.75).abs() < 1e-6);
    }

    #[test]
    fn a_mute_ramps_down_rather_than_steps() {
        let mut b = Buses::new(48000.0);
        b.master_set(master_param::MUTE, 1.0, 0);
        b.clear(128);
        b.input(MASTER).0.fill(1.0);
        let (mut l, mut r) = ([0.0; 128], [0.0; 128]);
        b.mix(128, &mut l, &mut r, &mut Rack::new(48000.0));
        assert_eq!(l[0], 1.0);
        assert!(l.windows(2).all(|w| w[0] - w[1] < 0.01 && w[1] <= w[0]));
    }
}
