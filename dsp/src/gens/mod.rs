//! The modelled sources: up to 16 generators with no recording behind them, each driven by live numbers. A pulse
//! motor, shaped noise, a struck bank of resonators. (`gen` is a reserved word in Rust, hence the folder's name.)
//!
//! Each slot holds one of each kind, built in `new`, so a start, a set and a stop only move numbers: nothing here
//! allocates after construction. A generator renders mono into a scratch block; the slot fades it in on its start
//! (2 ms) and out over its release, pans it (equal power) and adds it into its bus and up to two sends through
//! `Buses::input`, as a voice leaves. Its parameters are `ops::gen_param::<kind>`, in natural units; a parameter's
//! first set lands at once, later ones travel over their `slew` frames (frequencies along a line in the logarithm).

pub mod modal;
pub mod motor;
pub mod noise;

use crate::bus::{Buses, Ramp};
use crate::math::{finite_or, ms_to_frames, pan_gains};
use crate::ops::{GENS, GenSet, GenStart, GenStop, MAX_BLOCK, curve, gen_kind};
use crate::param::Slew;
use modal::Modal;
use motor::Motor;
use noise::Noise;

/// The fade-in on a start and the shortest fade-out on a stop, in ms.
const DECLICK_MS: f32 = 2.0;

/// A small, seeded xorshift generator: the only randomness a generator uses.
#[derive(Clone, Copy)]
pub(crate) struct Rng(u32);

impl Rng {
    pub(crate) fn new(seed: u32) -> Self {
        // Mixed so neighbouring seeds start far apart; never zero, which xorshift cannot leave.
        let s = seed.wrapping_mul(0x9E37_79B9) ^ 0x6A09_E667;
        Rng(if s == 0 { 0x1234_5678 } else { s })
    }

    #[inline]
    pub(crate) fn next_u32(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }

    /// Uniform in -1..1.
    #[inline]
    pub(crate) fn bipolar(&mut self) -> f32 {
        (self.next_u32() as i32) as f32 * (1.0 / 2_147_483_648.0)
    }

    /// Uniform in 0..1.
    #[inline]
    pub(crate) fn unit(&mut self) -> f32 {
        (self.next_u32() >> 8) as f32 * (1.0 / 16_777_216.0)
    }
}

/// The two-sample polynomial band-limited step: the correction, in units of half a step, for a step at phase 0 of
/// an oscillator at phase `t` (0..1) moving `dt` a sample. Zero away from the step.
#[inline]
pub(crate) fn poly_blep(t: f32, dt: f32) -> f32 {
    if t < dt {
        let x = t / dt;
        x + x - x * x - 1.0
    } else if t > 1.0 - dt {
        let x = (t - 1.0) / dt;
        x * x + x + x + 1.0
    } else {
        0.0
    }
}

/// One generator parameter: a slewed value whose first set lands at once, and which knows the path it travels.
#[derive(Clone, Copy)]
pub(crate) struct Param {
    s: Slew,
    touched: bool,
    exp: bool,
    lo: f32,
    hi: f32,
}

impl Param {
    /// A parameter at `default`, held to `lo..=hi`; `exp` travels along a line in the logarithm (`lo` must be
    /// above zero).
    pub(crate) const fn new(default: f32, lo: f32, hi: f32, exp: bool) -> Self {
        Param { s: Slew::at(default), touched: false, exp, lo, hi }
    }

    pub(crate) fn set(&mut self, value: f32, slew: u32) {
        if !value.is_finite() {
            return;
        }
        let frames = if self.touched { slew } else { 0 };
        self.touched = true;
        self.s.go(value.clamp(self.lo, self.hi), frames, if self.exp { curve::EXP } else { curve::LIN });
    }

    /// Lands on `value` now, as though nothing had set it.
    pub(crate) fn reset(&mut self, value: f32) {
        self.s = Slew::at(value.clamp(self.lo, self.hi));
        self.touched = false;
    }

    #[inline]
    pub(crate) fn value(&self) -> f32 {
        self.s.value
    }

    #[inline]
    pub(crate) fn moving(&self) -> bool {
        self.s.moving()
    }

    /// Moves on `n` frames and returns (where it was, where it is).
    #[inline]
    pub(crate) fn step(&mut self, n: u32) -> (f32, f32) {
        let a = self.s.value;
        self.s.advance(n);
        (a, self.s.value)
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Motor,
    Noise,
    Modal,
}

struct Slot {
    active: bool,
    kind: Kind,
    bus: u32,
    /// The pan's gains times the start's gain.
    gl: f32,
    gr: f32,
    send_bus: [u32; 2],
    send: [f32; 2],
    env: Ramp,
    stopping: bool,
    motor: Motor,
    noise: Noise,
    modal: Modal,
}

pub struct Gens {
    sample_rate: f32,
    slots: Vec<Slot>,
    scratch: Vec<f32>,
}

impl Gens {
    pub fn new(sample_rate: f32) -> Self {
        let slots = (0..GENS)
            .map(|_| Slot {
                active: false,
                kind: Kind::Motor,
                bus: 0,
                gl: 0.0,
                gr: 0.0,
                send_bus: [0; 2],
                send: [0.0; 2],
                env: Ramp::at(0.0),
                stopping: false,
                motor: Motor::new(sample_rate),
                noise: Noise::new(sample_rate),
                modal: Modal::new(sample_rate),
            })
            .collect();
        Gens { sample_rate, slots, scratch: vec![0.0; MAX_BLOCK] }
    }

    /// How many generators are sounding (a stopping one counts until its release ends).
    pub fn active(&self) -> usize {
        self.slots.iter().filter(|s| s.active).count()
    }

    /// `GEN_START`: a generator of a kind (`ops::gen_kind`), at its parameters' defaults. A start on a slot in use
    /// replaces what was there.
    pub fn start(&mut self, g: &GenStart) {
        let Some(slot) = self.slots.get_mut(g.slot as usize) else { return };
        let kind = match g.kind {
            gen_kind::MOTOR => Kind::Motor,
            gen_kind::NOISE => Kind::Noise,
            gen_kind::MODAL => Kind::Modal,
            _ => return,
        };
        let gain = finite_or(g.gain, 0.0).clamp(0.0, 16.0);
        let (l, r) = pan_gains(g.pan);
        slot.active = true;
        slot.kind = kind;
        slot.bus = g.bus;
        slot.gl = l * gain;
        slot.gr = r * gain;
        slot.send_bus = [g.send_bus1, g.send_bus2];
        slot.send = [finite_or(g.send1, 0.0).clamp(0.0, 4.0), finite_or(g.send2, 0.0).clamp(0.0, 4.0)];
        slot.stopping = false;
        slot.env = Ramp::at(0.0);
        slot.env.go(1.0, ms_to_frames(DECLICK_MS, self.sample_rate));
        match kind {
            Kind::Motor => slot.motor.reset(g.seed),
            Kind::Noise => slot.noise.reset(g.seed),
            Kind::Modal => slot.modal.reset(g.seed),
        }
    }

    /// `GEN_SET`: one of a generator's parameters, slewed.
    pub fn set(&mut self, g: &GenSet) {
        let Some(slot) = self.slots.get_mut(g.slot as usize) else { return };
        if !slot.active {
            return;
        }
        match slot.kind {
            Kind::Motor => slot.motor.set(g.param, g.value, g.slew),
            Kind::Noise => slot.noise.set(g.param, g.value, g.slew),
            Kind::Modal => slot.modal.set(g.param, g.value, g.slew),
        }
    }

    /// `GEN_STOP`: fades a generator out over its release and ends it.
    pub fn stop(&mut self, g: &GenStop) {
        let Some(slot) = self.slots.get_mut(g.slot as usize) else { return };
        if !slot.active {
            return;
        }
        slot.stopping = true;
        slot.env.go(0.0, g.release.max(ms_to_frames(DECLICK_MS, self.sample_rate)));
    }

    /// Adds every generator's block into its bus and sends. After the buses are cleared, before the voices render.
    pub fn run(&mut self, buses: &mut Buses, _now: u64, frames: usize) {
        let n = frames.min(MAX_BLOCK);
        if n == 0 {
            return;
        }
        let out = &mut self.scratch[..n];
        for slot in self.slots.iter_mut() {
            if !slot.active {
                continue;
            }
            let sounding = match slot.kind {
                Kind::Motor => slot.motor.render(out),
                Kind::Noise => slot.noise.render(out),
                Kind::Modal => slot.modal.render(out),
            };
            let e0 = slot.env.value;
            slot.env.advance(n as u32);
            let e1 = slot.env.value;
            if sounding {
                if e0 != 1.0 || e1 != 1.0 {
                    let d = (e1 - e0) / n as f32;
                    let mut e = e0;
                    for s in out.iter_mut() {
                        e += d;
                        *s *= e;
                    }
                }
                add(buses, slot.bus, out, slot.gl, slot.gr);
                for k in 0..2 {
                    if slot.send[k] > 0.0 {
                        add(buses, slot.send_bus[k], out, slot.gl * slot.send[k], slot.gr * slot.send[k]);
                    }
                }
            }
            if slot.stopping && slot.env.is_off() {
                slot.active = false;
            }
        }
    }
}

/// Adds a mono block into a bus at the left and right gains.
fn add(buses: &mut Buses, bus: u32, x: &[f32], gl: f32, gr: f32) {
    let (bl, br) = buses.input(bus as usize);
    for ((l, r), s) in bl.iter_mut().zip(br.iter_mut()).zip(x) {
        *l += s * gl;
        *r += s * gr;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_param_lands_its_first_set_and_travels_later_ones() {
        let mut p = Param::new(100.0, 1.0, 1000.0, true);
        p.set(400.0, 480);
        assert_eq!(p.value(), 400.0);
        p.set(800.0, 100);
        let (a, b) = p.step(50);
        assert_eq!(a, 400.0);
        assert!(b > 400.0 && b < 800.0);
        p.set(5000.0, 0);
        assert_eq!(p.value(), 1000.0);
    }

    #[test]
    fn the_rng_stays_in_range_and_follows_its_seed() {
        let mut a = Rng::new(3);
        let mut b = Rng::new(3);
        for _ in 0..1000 {
            let x = a.bipolar();
            assert!((-1.0..1.0).contains(&x));
            assert_eq!(x, b.bipolar());
            assert!((0.0..1.0).contains(&a.unit()));
            b.unit();
        }
        assert_ne!(Rng::new(0).next_u32(), 0);
    }
}
