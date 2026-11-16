//! Effects: the `Fx` trait every unit implements, the registry that builds one by kind, and the rack that holds
//! up to `FX_SLOTS` of them on each bus.
//!
//! A bus's slots run in order on the bus's block, before its fader; the master's run before the master's gain and
//! the limiter. A bus that holds any effect is processed every block, sounding or not, so a tail rings out.
//! Each parameter is a `Slew`: `FX_SET` names its target, the rack moves it once a block and hands the unit the
//! new value through `Fx::set`. So a unit sees a parameter as a stair of block-sized steps, and smooths inside
//! itself whatever would zip (a gain, a mix).
//!
//! Defining an effect and loading an impulse response allocate (delay lines, partitions). They are the one
//! exception to "nothing allocates inside `process`": a mix is built before it plays.
//!
//! **On and off** (`FX_ON`). Every slot has an amount, 1 (on) whenever it is defined, moved a frame at a time
//! along a straight line over the command's `slew`. Settled at 1 the unit runs exactly as if the switch did not
//! exist; settled at 0 it is not run at all and the bus passes through the slot untouched. Anywhere else the unit
//! runs and its output is crossfaded with its input, sample by sample, so the switch has no step (`slew` 0 is a
//! cut, and may click: the shell sends a fade). Its parameters keep moving while it is off.
//! - Switching off cuts a tail: a reverb's or a delay's ringing fades with the crossfade and stops when it lands.
//! - A unit with latency (the tape's lag, the convolver's partitions, the saturator's oversampling filters) is
//!   crossfaded against the input as it is: for the length of the fade the two are a few milliseconds apart, a
//!   brief comb rather than a click.
//! - A unit switched on from fully off is reset first (`Fx::reset`): it starts from silence, so a delay line or a
//!   reverb never replays what it held before it was switched off. A unit switched back on before its fade out
//!   landed is still running and simply turns round. A freeze reset holds silence until it captures again.
//!
//! **Reduction.** A unit that reduces gain (the compressor) reports the most it reduced in its last block
//! (`Fx::reduction`); the rack keeps each bus's most for the block, for the meters. A unit that is off reports none.

pub mod comp;
pub mod conv;
pub mod crush;
pub mod delay;
pub mod eq;
pub mod fdn;
pub mod sat;
pub mod stereo;
pub mod svf;
pub mod tape;

use crate::ops::{FX_PARAM_CAP, FX_SLOTS, MAX_BLOCK, MAX_BUSES, fx_kind};
use crate::param::Slew;

/// One effect unit. Stereo, in place.
pub trait Fx {
    /// Sets parameter `param` (the kind's ids in `ops::fx_param`) to `value`, in the parameter's natural unit.
    /// Called once a block at most per moving parameter; out-of-range values are the unit's to clamp.
    fn set(&mut self, param: u16, value: f32);
    /// Processes one block in place. `key` is the key bus's block when the slot was defined with one: what a
    /// compressor listens to instead of `l` and `r`.
    fn process(&mut self, l: &mut [f32], r: &mut [f32], key: Option<(&[f32], &[f32])>);
    /// Forgets its history (delay lines, envelopes): silence in, silence out from here.
    fn reset(&mut self);
    /// Takes an impulse response: 16-bit interleaved PCM at `rate`. Only the convolver listens.
    fn ir(&mut self, _pcm: &[i16], _channels: u32, _rate: f32) {}
    /// Hears the transport: frames in a beat and beats in a bar. Called when a unit is built and whenever either
    /// changes. Only a unit that keeps musical time listens.
    fn tempo(&mut self, _frames_per_beat: f32, _beats_per_bar: u32) {}
    /// The most gain reduction it applied during its last `process`, in dB (0 or more). Only a dynamics unit has
    /// any.
    fn reduction(&self) -> f32 {
        0.0
    }
}

/// Builds the effect of a kind (`ops::fx_kind`) at the engine's sample rate, with its own defaults.
pub fn create(kind: u32, sample_rate: f32) -> Option<Box<dyn Fx>> {
    Some(match kind {
        fx_kind::SVF => Box::new(svf::Svf::new(sample_rate)),
        fx_kind::EQ => Box::new(eq::Eq::new(sample_rate)),
        fx_kind::COMP => Box::new(comp::Comp::new(sample_rate)),
        fx_kind::SAT => Box::new(sat::Sat::new(sample_rate)),
        fx_kind::DELAY => Box::new(delay::Delay::new(sample_rate)),
        fx_kind::TAPE => Box::new(tape::Tape::new(sample_rate)),
        fx_kind::CRUSH => Box::new(crush::Crush::new(sample_rate)),
        fx_kind::FDN => Box::new(fdn::Fdn::new(sample_rate)),
        fx_kind::CONV => Box::new(conv::Conv::new(sample_rate)),
        fx_kind::FREEZE => Box::new(crate::freeze::Freeze::new(sample_rate)),
        fx_kind::STEREO => Box::new(stereo::Stereo::new(sample_rate)),
        _ => return None,
    })
}

/// No key bus.
const NO_KEY: usize = MAX_BUSES;

struct Slot {
    unit: Option<Box<dyn Fx>>,
    key: usize,
    params: [Slew; FX_PARAM_CAP],
    /// Parameters still travelling, by bit.
    moving: u32,
    /// How far on it is, 0..1, where it is heading, its step a frame and the frames left to get there.
    on: f32,
    on_to: f32,
    on_step: f32,
    on_left: u32,
}

impl Slot {
    fn empty() -> Self {
        Slot {
            unit: None,
            key: NO_KEY,
            params: [Slew::unset(); FX_PARAM_CAP],
            moving: 0,
            on: 1.0,
            on_to: 1.0,
            on_step: 0.0,
            on_left: 0,
        }
    }

    /// Off and settled: its unit is not run.
    #[inline]
    fn dormant(&self) -> bool {
        self.on == 0.0 && self.on_left == 0
    }
}

/// Every bus's effect slots.
pub struct Rack {
    slots: Vec<Slot>,
    /// Effects on each bus.
    count: [u8; MAX_BUSES],
    sample_rate: f32,
    /// The transport as the units last heard it: frames in a beat, beats in a bar.
    tempo: (f32, u32),
    /// A fading slot's input, kept to crossfade its output with.
    dry_l: Vec<f32>,
    dry_r: Vec<f32>,
    /// Each bus's most gain reduction this block, dB.
    reduction: [f32; MAX_BUSES],
}

impl Rack {
    pub fn new(sample_rate: f32) -> Self {
        Rack {
            slots: (0..MAX_BUSES * FX_SLOTS).map(|_| Slot::empty()).collect(),
            count: [0; MAX_BUSES],
            sample_rate,
            tempo: (sample_rate * 0.5, 4),
            dry_l: vec![0.0; MAX_BLOCK],
            dry_r: vec![0.0; MAX_BLOCK],
            reduction: [0.0; MAX_BUSES],
        }
    }

    #[inline]
    fn index(bus: u32, slot: u32) -> Option<usize> {
        ((bus as usize) < MAX_BUSES && (slot as usize) < FX_SLOTS).then(|| bus as usize * FX_SLOTS + slot as usize)
    }

    /// Puts an effect of `kind` in a slot, replacing what was there; `fx_kind::NONE` (or an unknown kind) empties
    /// it. `key` is a key bus plus one, 0 for none.
    pub fn define(&mut self, bus: u32, slot: u32, kind: u32, key: u32) {
        let Some(i) = Self::index(bus, slot) else { return };
        let mut unit = create(kind, self.sample_rate);
        if let Some(unit) = unit.as_mut() {
            unit.tempo(self.tempo.0, self.tempo.1);
        }
        let had = self.slots[i].unit.is_some();
        let has = unit.is_some();
        let key = key as usize;
        self.slots[i] = Slot {
            unit,
            key: if key >= 1 && key <= MAX_BUSES && key - 1 != bus as usize { key - 1 } else { NO_KEY },
            ..Slot::empty()
        };
        let count = &mut self.count[bus as usize];
        *count = *count + has as u8 - had as u8;
    }

    /// Heads a parameter of the effect in a slot for `value` over `slew` frames along `curve`.
    pub fn set(&mut self, bus: u32, slot: u32, param: u32, value: f32, slew: u32, curve: u32) {
        let Some(i) = Self::index(bus, slot) else { return };
        let s = &mut self.slots[i];
        let p = param as usize;
        let Some(unit) = s.unit.as_mut() else { return };
        if p >= FX_PARAM_CAP || !value.is_finite() {
            return;
        }
        s.params[p].go(value, slew, curve);
        if s.params[p].moving() {
            s.moving |= 1 << p;
        } else {
            s.moving &= !(1 << p);
            unit.set(p as u16, s.params[p].value);
        }
    }

    /// Heads the effect in a slot for on (`value` 1), off (0) or between over `slew` frames. A unit coming on
    /// from fully off is reset first.
    pub fn on(&mut self, bus: u32, slot: u32, value: f32, slew: u32) {
        let Some(i) = Self::index(bus, slot) else { return };
        let s = &mut self.slots[i];
        let dormant = s.dormant();
        let Some(unit) = s.unit.as_mut() else { return };
        if !value.is_finite() {
            return;
        }
        let value = value.clamp(0.0, 1.0);
        if dormant && value > 0.0 {
            unit.reset();
        }
        s.on_to = value;
        if slew == 0 || value == s.on {
            s.on = value;
            s.on_left = 0;
        } else {
            s.on_step = (value - s.on) / slew as f32;
            s.on_left = slew;
        }
    }

    /// Hands the effect in a slot an impulse response.
    pub fn ir(&mut self, bus: u32, slot: u32, pcm: &[i16], channels: u32, rate: f32) {
        if let Some(unit) = Self::index(bus, slot).and_then(|i| self.slots[i].unit.as_mut()) {
            unit.ir(pcm, channels, rate);
        }
    }

    /// Tells every unit the transport's tempo, when it changed. Once a block, before `tick`.
    pub fn tempo(&mut self, frames_per_beat: f32, beats_per_bar: u32) {
        if self.tempo == (frames_per_beat, beats_per_bar) || !frames_per_beat.is_finite() {
            return;
        }
        self.tempo = (frames_per_beat, beats_per_bar);
        for unit in self.slots.iter_mut().filter_map(|s| s.unit.as_mut()) {
            unit.tempo(frames_per_beat, beats_per_bar);
        }
    }

    /// Whether bus `bus` holds any effect: such a bus is processed every block.
    #[inline]
    pub fn active(&self, bus: usize) -> bool {
        bus < MAX_BUSES && self.count[bus] > 0
    }

    /// Each bus's most gain reduction in the last block, dB (0 for a bus with none).
    pub fn reduction(&self) -> &[f32; MAX_BUSES] {
        &self.reduction
    }

    /// Moves every travelling parameter on `frames` frames and hands its unit the new value. Once a block,
    /// before the buses mix.
    pub fn tick(&mut self, frames: usize) {
        self.reduction = [0.0; MAX_BUSES];
        for s in self.slots.iter_mut().filter(|s| s.moving != 0) {
            let Some(unit) = s.unit.as_mut() else {
                s.moving = 0;
                continue;
            };
            let mut bits = s.moving;
            while bits != 0 {
                let p = bits.trailing_zeros() as usize;
                bits &= bits - 1;
                s.params[p].advance(frames as u32);
                unit.set(p as u16, s.params[p].value);
                if !s.params[p].moving() {
                    s.moving &= !(1 << p);
                }
            }
        }
    }

    /// Runs bus `bus`'s effects, in slot order, over its block (`l`, `r`). `all_l` and `all_r` are every bus's
    /// block, `MAX_BLOCK` frames each, by bus index: where a keyed slot reads its key. A key bus that sums earlier
    /// is heard after its fader, one that sums later before it.
    pub fn process(&mut self, bus: usize, l: &mut [f32], r: &mut [f32], all_l: &[f32], all_r: &[f32]) {
        if !self.active(bus) {
            return;
        }
        let frames = l.len().min(r.len()).min(MAX_BLOCK);
        let (l, r) = (&mut l[..frames], &mut r[..frames]);
        let Rack { slots, dry_l, dry_r, reduction, .. } = self;
        let (dry_l, dry_r) = (&mut dry_l[..frames], &mut dry_r[..frames]);
        let mut most = 0.0f32;
        for s in &mut slots[bus * FX_SLOTS..(bus + 1) * FX_SLOTS] {
            if s.dormant() {
                continue;
            }
            let Some(unit) = s.unit.as_mut() else { continue };
            let key = (s.key != NO_KEY).then(|| {
                let at = s.key * MAX_BLOCK;
                (&all_l[at..at + frames], &all_r[at..at + frames])
            });
            if s.on == 1.0 && s.on_left == 0 {
                unit.process(l, r, key);
                most = most.max(unit.reduction());
                continue;
            }
            dry_l.copy_from_slice(l);
            dry_r.copy_from_slice(r);
            unit.process(l, r, key);
            most = most.max(unit.reduction());
            let mut g = s.on;
            for i in 0..frames {
                if s.on_left > 0 {
                    s.on_left -= 1;
                    g = if s.on_left == 0 { s.on_to } else { g + s.on_step };
                }
                l[i] = dry_l[i] + g * (l[i] - dry_l[i]);
                r[i] = dry_r[i] + g * (r[i] - dry_r[i]);
            }
            s.on = g;
        }
        reduction[bus] = most;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ops::curve;

    /// A unit that records what it is told and scales what it is given by parameter 0.
    struct Probe {
        gain: f32,
        keyed: bool,
    }

    impl Fx for Probe {
        fn set(&mut self, param: u16, value: f32) {
            if param == 0 {
                self.gain = value;
            }
        }
        fn process(&mut self, l: &mut [f32], r: &mut [f32], key: Option<(&[f32], &[f32])>) {
            self.keyed = key.is_some();
            for s in l.iter_mut().chain(r.iter_mut()) {
                *s *= self.gain;
            }
        }
        fn reset(&mut self) {}
    }

    fn rack_with_probe() -> Rack {
        let mut rack = Rack::new(48000.0);
        rack.slots[FX_SLOTS] = Slot { unit: Some(Box::new(Probe { gain: 1.0, keyed: false })), key: 2, ..Slot::empty() };
        rack.count[1] = 1;
        rack
    }

    #[test]
    fn a_parameter_travels_a_block_at_a_time_and_reaches_its_unit() {
        let mut rack = rack_with_probe();
        let all = vec![0.0; MAX_BUSES * MAX_BLOCK];
        rack.set(1, 0, 0, 1.0, 0, curve::LIN);
        rack.set(1, 0, 0, 0.0, 256, curve::LIN);
        let (mut l, mut r) = (vec![1.0; 128], vec![1.0; 128]);
        rack.tick(128);
        rack.process(1, &mut l, &mut r, &all, &all);
        assert!((l[0] - 0.5).abs() < 1e-6);
        rack.tick(128);
        let (mut l, mut r) = (vec![1.0; 128], vec![1.0; 128]);
        rack.process(1, &mut l, &mut r, &all, &all);
        assert_eq!(l[0], 0.0);
    }

    #[test]
    fn defining_and_emptying_a_slot_moves_the_bus_in_and_out_of_work() {
        let mut rack = Rack::new(48000.0);
        assert!(!rack.active(3));
        rack.define(3, 2, fx_kind::SVF, 0);
        assert!(rack.active(3));
        rack.define(3, 2, fx_kind::EQ, 0);
        assert!(rack.active(3));
        rack.define(3, 2, fx_kind::NONE, 0);
        assert!(!rack.active(3));
        rack.define(99, 0, fx_kind::SVF, 0);
        rack.define(0, 99, fx_kind::SVF, 0);
        rack.set(3, 2, 0, 1.0, 0, curve::LIN);
    }

    use crate::ops::fx_param;

    const BLOCK: usize = 128;

    fn tone(frames: usize) -> Vec<f32> {
        (0..frames).map(|i| 0.5 * (core::f32::consts::TAU * 1000.0 * i as f32 / 48000.0).sin()).collect()
    }

    /// A rack with a low-pass at 100 Hz on bus 1: it all but silences a 1 kHz tone.
    fn rack_with_filter() -> Rack {
        let mut rack = Rack::new(48000.0);
        rack.define(1, 0, fx_kind::SVF, 0);
        rack.set(1, 0, fx_param::svf::CUTOFF as u32, 100.0, 0, curve::LIN);
        rack
    }

    /// Runs `x` through bus 1 of `rack` a block at a time; `at` is called before each block with its first frame.
    fn run(rack: &mut Rack, x: &[f32], mut at: impl FnMut(&mut Rack, usize)) -> Vec<f32> {
        let all = vec![0.0; MAX_BUSES * MAX_BLOCK];
        let mut out = Vec::with_capacity(x.len());
        for (b, chunk) in x.chunks(BLOCK).enumerate() {
            at(rack, b * BLOCK);
            let (mut l, mut r) = (chunk.to_vec(), chunk.to_vec());
            rack.tick(chunk.len());
            rack.process(1, &mut l, &mut r, &all, &all);
            out.extend_from_slice(&l);
        }
        out
    }

    #[test]
    fn a_slot_never_switched_runs_bit_identical_to_its_unit_alone() {
        let x = tone(4800);
        let mut rack = rack_with_filter();
        let through = run(&mut rack, &x, |rack, at| {
            if at == 1280 {
                // Asking an on slot to be on changes nothing.
                rack.on(1, 0, 1.0, 480);
            }
        });
        let mut unit = create(fx_kind::SVF, 48000.0).unwrap();
        unit.set(fx_param::svf::CUTOFF, 100.0);
        let mut alone = Vec::new();
        for chunk in x.chunks(BLOCK) {
            let (mut l, mut r) = (chunk.to_vec(), chunk.to_vec());
            unit.process(&mut l, &mut r, None);
            alone.extend_from_slice(&l);
        }
        assert_eq!(through, alone);
    }

    #[test]
    fn a_slot_off_and_settled_passes_its_input_exactly_and_the_fade_has_no_step() {
        let x = tone(9600);
        let mut rack = rack_with_filter();
        let out = run(&mut rack, &x, |rack, at| match at {
            1280 => rack.on(1, 0, 0.0, 480),
            5120 => rack.on(1, 0, 1.0, 480),
            _ => {}
        });
        assert_eq!(out[1280 + 480..5120], x[1280 + 480..5120]);
        // The tone's own steepest step is 0.5 * TAU * 1000 / 48000 = 0.065; the switch adds little to it.
        let jump = out.windows(2).map(|w| (w[1] - w[0]).abs()).fold(0.0, f32::max);
        assert!(jump < 0.08, "jump {jump}");
        // Back on, the filter silences the tone again.
        assert!(out[8000..].iter().all(|s| s.abs() < 0.05));
        // A cut, for scale: the same switch with no fade, at a block where the tone is high, jumps by far more.
        let mut rack = rack_with_filter();
        let cut = run(&mut rack, &x, |rack, at| if at == 1408 { rack.on(1, 0, 0.0, 0) });
        let jump = cut.windows(2).map(|w| (w[1] - w[0]).abs()).fold(0.0, f32::max);
        assert!(jump > 0.2, "cut {jump}");
    }

    #[test]
    fn a_slot_redefined_after_being_switched_off_is_on_again() {
        let x = tone(2560);
        let mut rack = rack_with_filter();
        let out = run(&mut rack, &x, |rack, at| match at {
            0 => rack.on(1, 0, 0.0, 0),
            1280 => {
                rack.define(1, 0, fx_kind::SVF, 0);
                rack.set(1, 0, fx_param::svf::CUTOFF as u32, 100.0, 0, curve::LIN);
            }
            _ => {}
        });
        assert_eq!(out[..1280], x[..1280]);
        assert!(out[1920..].iter().all(|s| s.abs() < 0.05));
    }

    #[test]
    fn a_delay_switched_back_on_never_replays_what_it_held() {
        let mut rack = Rack::new(48000.0);
        rack.define(1, 0, fx_kind::DELAY, 0);
        for (p, v) in [(fx_param::delay::TIME, 0.1), (fx_param::delay::FEEDBACK, 0.9), (fx_param::delay::MIX, 1.0)] {
            rack.set(1, 0, p as u32, v, 0, curve::LIN);
        }
        let mut x = tone(48000);
        x[4800..].fill(0.0);
        let out = run(&mut rack, &x, |rack, at| match at {
            4864 => rack.on(1, 0, 0.0, 0),
            9600 => rack.on(1, 0, 1.0, 480),
            _ => {}
        });
        assert!(out[4864..].iter().all(|s| *s == 0.0));
    }

    #[test]
    fn a_compressor_reports_its_reduction_on_its_own_bus_only_and_none_when_off() {
        let mut rack = Rack::new(48000.0);
        rack.define(2, 0, fx_kind::COMP, 0);
        rack.define(3, 0, fx_kind::EQ, 0);
        let all = vec![0.0; MAX_BUSES * MAX_BLOCK];
        let block = |rack: &mut Rack, amp: f32| {
            rack.tick(BLOCK);
            for bus in [2, 3] {
                let (mut l, mut r) = (vec![amp; BLOCK], vec![amp; BLOCK]);
                rack.process(bus, &mut l, &mut r, &all, &all);
            }
            *rack.reduction()
        };
        assert_eq!(block(&mut rack, 0.0), [0.0; MAX_BUSES]);
        let loud = (0..20).map(|_| block(&mut rack, 1.0)).last().unwrap();
        assert!(loud[2] > 6.0, "{}", loud[2]);
        assert!(loud.iter().enumerate().all(|(b, r)| b == 2 || *r == 0.0));
        rack.on(2, 0, 0.0, 0);
        assert_eq!(block(&mut rack, 1.0), [0.0; MAX_BUSES]);
    }
}
