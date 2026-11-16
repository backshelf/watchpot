/**
 * The wire protocol between the shell (the main thread) and the DSP core (the worklet), and its one source:
 * `scripts/dsp.ts` writes `dsp/src/ops.rs` from the tables here, so a field added here exists on both sides after
 * `bun run dsp`.
 *
 * A record is `u16 op, u16 byteLength, payload`, little-endian; `byteLength` counts the whole record, header
 * included. Every field is four bytes (`u32` or `f32`) or a fixed run of them. Records are concatenated into one
 * buffer and posted; the core reads them in order.
 *
 * Every command's first field is `atFrame`: the frame it takes effect on, as the low 32 bits of the core's frame
 * counter, which the worklet sets to the AudioContext's own (`CLOCK_SET`), so the shell computes it as
 * `Math.round(context.currentTime * context.sampleRate) + delayFrames`. 0 means now, and so does any frame already
 * past. A voice start is honoured to the sample; every other command takes effect at the start of the block that
 * holds its frame.
 *
 * Units: gain is linear, pan is -1..1, rate is a ratio, times are frames, a bus is its index (0 is the master).
 */

export type Scalar = "u32" | "f32";
/** A field's type: one value, or a fixed run of them. */
export type FieldType = Scalar | readonly [Scalar, number];

export interface OpDef {
  readonly id: number;
  readonly fields: Readonly<Record<string, FieldType>>;
}

/** Limits both sides are built to. */
export const LIMITS = {
  /** Bytes of commands the core takes per block; the worklet holds the rest for the next. */
  CMD_CAP: 65536,
  /** Bytes of events the core can write per block. */
  EVT_CAP: 8192,
  /** Frames per `process` call; the worklet splits a larger render quantum. */
  MAX_BLOCK: 128,
  /** Buses, the master included. */
  MAX_BUSES: 16,
  /** Sample ids run 1 to `MAX_SAMPLES - 1`. */
  MAX_SAMPLES: 4096,
  /** Effect slots on a bus, the master included. */
  FX_SLOTS: 8,
  /** The most parameters one effect has. */
  FX_PARAM_CAP: 16,
  /** Sequencer tracks, and the most steps one holds. */
  SEQ_TRACKS: 16,
  SEQ_STEPS: 64,
  /** Loops, grain clouds, generators and babble voices the core holds at once. */
  LOOPS: 16,
  GRAIN_CLOUDS: 8,
  GENS: 16,
  BABBLES: 4,
  /** The most parameters one generator has, and where a modal generator's modes start (three ids a mode). */
  GEN_PARAM_CAP: 64,
  /** Voice handles from here up are the core's own (loops, sequencer steps): the shell never issues one. */
  CORE_VOICE: 0x80000000,
} as const;

/** What `VOICE_SET.param` names. */
export const VOICE_PARAM = { gain: 0, pan: 1, rate: 2, send1: 3, send2: 4 } as const;
/** What `BUS_SET.param` names; `send` sets the level of the send to the bus in `index`. */
export const BUS_PARAM = { gain: 0, mute: 1, send: 2 } as const;
/** What `MASTER_SET.param` names; `ceiling` is the limiter's, linear. */
export const MASTER_PARAM = { gain: 0, mute: 1, ceiling: 2 } as const;

/** The effect a bus slot holds (`FX_DEFINE.kind`); `none` empties the slot. */
export const FX_KIND = {
  none: 0,
  svf: 1,
  eq: 2,
  comp: 3,
  sat: 4,
  delay: 5,
  tape: 6,
  crush: 7,
  fdn: 8,
  conv: 9,
  freeze: 10,
  stereo: 11,
} as const;
/** How a slewed value travels to its target: a straight line, or a straight line in its logarithm (frequencies, times). */
export const CURVE = { lin: 0, exp: 1 } as const;
/** What `SPACE_SET.mode` names: a pan law for speakers, or time and level differences between the ears. */
export const SPACE_MODE = { speakers: 0, headphones: 1 } as const;

/**
 * A line of the transport's grid: a 32nd, a 16th, an 8th, a quarter (the beat) or the bar. The low three bits of
 * `VOICE_START.flags` name the line a start waits for (`off`: none).
 */
export const GRID = { off: 0, n32: 1, n16: 2, n8: 3, n4: 4, bar: 5 } as const;
/** A grid line's id by its public name (`Grid` in `types.ts`); none is `off`. */
export function gridId(grid: "off" | "32" | "16" | "8" | "4" | "bar" | undefined): number {
  switch (grid) {
    case "32":
      return GRID.n32;
    case "16":
      return GRID.n16;
    case "8":
      return GRID.n8;
    case "4":
      return GRID.n4;
    case "bar":
      return GRID.bar;
    default:
      return GRID.off;
  }
}
/** What `TRANSPORT_SET.running` asks. */
export const TRANSPORT_RUN = { stop: 0, start: 1, keep: 2 } as const;
/** What `GRAIN_SET.param` names. */
export const GRAIN_PARAM = {
  position: 0,
  rate: 1,
  size: 2,
  density: 3,
  spray: 4,
  pitch: 5,
  spread: 6,
  level: 7,
} as const;
/** The modelled sources (`GEN_START.kind`). */
export const GEN_KIND = { motor: 1, noise: 2, modal: 3 } as const;
/** Who a `STEP` event is from. */
export const STEP_SOURCE = { seq: 0, babble: 1 } as const;

export const ENUMS = {
  VOICE_PARAM,
  BUS_PARAM,
  MASTER_PARAM,
  FX_KIND,
  CURVE,
  SPACE_MODE,
  GRID,
  TRANSPORT_RUN,
  GRAIN_PARAM,
  GEN_KIND,
  STEP_SOURCE,
} as const;

/**
 * Each generator's parameters by id (`GEN_SET.param`), in natural units.
 * - `motor`: `rate` is steps a second (0.5 to 2,000: a rhythm low, a pitch high); `duty` 0..1; `body1` and `body2`
 *   are resonances in Hz with their Q; `load` 0..1 adds growl and jitter; `level` is linear.
 * - `noise`: `color` is 0 white, 1 pink; `centre` and `width` are the band in Hz; `grid` is bursts a second (0: a
 *   steady hiss) and `duty` the share of each that sounds; `tilt` is dB an octave; `level` is linear.
 * - `modal`: `strike` excites the bank (its value is how hard, 0..1; negative strikes with a noise burst); `damp`
 *   divides every decay (more damping rings shorter); `size` divides every frequency (a bigger body is lower); `level` is linear. Mode `i` (0 to 11) has three parameters
 *   from `mode + 3 * i`: its frequency in Hz, its decay in seconds, its gain.
 */
export const GEN_PARAMS = {
  motor: { rate: 0, duty: 1, body1: 2, body1Q: 3, body2: 4, body2Q: 5, load: 6, level: 7 },
  noise: { color: 0, centre: 1, width: 2, grid: 3, duty: 4, tilt: 5, level: 6 },
  modal: { strike: 0, damp: 1, size: 2, level: 3, mode: 16 },
} as const satisfies Record<keyof typeof GEN_KIND, Readonly<Record<string, number>>>;

/**
 * Each effect's parameters by id (`FX_SET.param`), in natural units: Hz, seconds, dB, 0..1. A switch is 0 or 1.
 * - `svf.mode`: 0 low-pass, 1 high-pass, 2 band-pass, 3 notch; `svf.slope`: 0 is 12 dB an octave, 1 is 24.
 * - `comp.range` is the most gain reduction, in dB; its key bus is named at `FX_DEFINE`.
 * - `delay.beats` above 0 sets the time as beats and `delay.time` is ignored: beats of `delay.tempo` (bpm) when it
 *   is above 0, else of the transport.
 * - `tape.speed` is 0..2: 1 is normal, 0 a stopped tape.
 * - `fdn.size` is 0..1; `fdn.decay` is seconds.
 * - `conv.gain` is dB; its impulse response arrives by `IR_LOAD`.
 * - `stereo.width` is 0 (mono) to 2, 1 as it is; `stereo.pan` is -1..1, a balance.
 * - `freeze.amount` is 0..1: how much of the held spectrum replaces the live signal; `freeze.stutter` is 0 (off), 8,
 *   16 or 32: instead, the last eighth, sixteenth or thirty-second of a bar repeats, on the transport.
 */
export const FX_PARAMS = {
  svf: { cutoff: 0, q: 1, mode: 2, slope: 3 },
  eq: {
    lowFreq: 0,
    lowGain: 1,
    mid1Freq: 2,
    mid1Gain: 3,
    mid1Q: 4,
    mid2Freq: 5,
    mid2Gain: 6,
    mid2Q: 7,
    highFreq: 8,
    highGain: 9,
  },
  comp: { threshold: 0, ratio: 1, attack: 2, release: 3, knee: 4, makeup: 5, range: 6, mix: 7 },
  sat: { drive: 0, tilt: 1, mix: 2 },
  delay: { time: 0, beats: 1, tempo: 2, feedback: 3, filter: 4, pingpong: 5, glide: 6, mix: 7 },
  tape: { wow: 0, wowRate: 1, flutter: 2, flutterRate: 3, speed: 4, hiss: 5 },
  crush: { rate: 0, bits: 1, mix: 2 },
  fdn: { size: 0, decay: 1, damping: 2, predelay: 3, width: 4, mod: 5, early: 6, mix: 7 },
  conv: { mix: 0, gain: 1 },
  freeze: { amount: 0, stutter: 1 },
  stereo: { width: 0, pan: 1 },
} as const satisfies Record<Exclude<keyof typeof FX_KIND, "none">, Readonly<Record<string, number>>>;

/** Shell to core. */
export const COMMANDS = {
  /** The core's frame counter becomes `frame` now. Written by the worklet on its first block. */
  CLOCK_SET: { id: 1, fields: { atFrame: "u32", frame: "u32" } },
  /**
   * Registers 16-bit interleaved PCM already copied into the core's memory at `ptr` (from the ABI's `alloc`): the
   * worklet fills `ptr` in. `rate` is the source's sample rate. Answered by `SAMPLE_READY`.
   */
  SAMPLE_LOAD: {
    id: 2,
    fields: { atFrame: "u32", sample: "u32", ptr: "u32", frames: "u32", channels: "u32", rate: "f32" },
  },
  /** Frees a sample's memory; voices playing it are released first. */
  SAMPLE_FREE: { id: 3, fields: { atFrame: "u32", sample: "u32" } },
  /**
   * Starts a voice. `voice` is the shell's handle for `VOICE_SET` and `VOICE_STOP` (0: none, and no `VOICE_ENDED`).
   * `offset` is where in the sample it starts, in source frames; `loopEnd` 0 is no loop, else the voice loops
   * `[loopStart, loopEnd)`; `attack` and `release` 0 are the defaults (2 ms, 8 ms). A start for a sample the core
   * does not hold is ignored.
   */
  VOICE_START: {
    id: 4,
    fields: {
      atFrame: "u32",
      voice: "u32",
      sample: "u32",
      bus: "u32",
      gain: "f32",
      pan: "f32",
      rate: "f32",
      offset: "u32",
      loopStart: "u32",
      loopEnd: "u32",
      attack: "u32",
      release: "u32",
      sendBus1: "u32",
      send1: "f32",
      sendBus2: "u32",
      send2: "f32",
      priority: "u32",
      flags: "u32",
    },
  },
  /** Moves one of a voice's parameters (`VOICE_PARAM`) to `value` over `slew` frames. */
  VOICE_SET: { id: 5, fields: { atFrame: "u32", voice: "u32", param: "u32", value: "f32", slew: "u32" } },
  /** Releases a voice over `release` frames (0: its own release). */
  VOICE_STOP: { id: 6, fields: { atFrame: "u32", voice: "u32", release: "u32" } },
  /** Defines or redefines bus `bus` (1 to 15), summed into bus `out` (0: the master) at `gain`. */
  BUS_DEFINE: { id: 7, fields: { atFrame: "u32", bus: "u32", out: "u32", gain: "f32" } },
  /** Moves one of a bus's parameters (`BUS_PARAM`) to `value` over `slew` frames; `index` is a send's target. */
  BUS_SET: {
    id: 8,
    fields: { atFrame: "u32", bus: "u32", param: "u32", index: "u32", value: "f32", slew: "u32" },
  },
  /** Moves one of the master's parameters (`MASTER_PARAM`) to `value` over `slew` frames. */
  MASTER_SET: { id: 9, fields: { atFrame: "u32", param: "u32", value: "f32", slew: "u32" } },
  /**
   * Puts an effect (`FX_KIND`) in slot `slot` (0 to 7) of bus `bus` (0: the master), replacing what was there;
   * `none` empties the slot. Slots run in order, before the bus's fader. `key` is a key bus plus one (0: none):
   * what a compressor listens to instead of its own bus. The effect starts at its own defaults, and on (`FX_ON` is
   * forgotten). Allocates: sent when a mix is built, not while playing.
   */
  FX_DEFINE: { id: 10, fields: { atFrame: "u32", bus: "u32", slot: "u32", kind: "u32", key: "u32" } },
  /**
   * Moves one parameter (`FX_PARAMS`) of the effect in a slot to `value` over `slew` frames along `curve`
   * (`CURVE`). A parameter's first set lands at once.
   */
  FX_SET: {
    id: 11,
    fields: {
      atFrame: "u32",
      bus: "u32",
      slot: "u32",
      param: "u32",
      value: "f32",
      slew: "u32",
      curve: "u32",
    },
  },
  /** Hands the convolver in a slot its impulse response: a sample the core holds. Allocates. */
  IR_LOAD: { id: 12, fields: { atFrame: "u32", bus: "u32", slot: "u32", sample: "u32" } },
  /**
   * Turns the effect in a slot on (`value` 1, as it starts) or off (0) over `slew` frames (0: a cut, which may
   * click): its output crossfades with its input, sample by sample, and a unit fully off is not run, so the bus
   * passes through the slot unchanged. Switching off cuts a tail with the fade; a unit switched on from fully off
   * starts from silence (its delay lines and envelopes cleared). Its parameters keep moving while it is off.
   */
  FX_ON: { id: 30, fields: { atFrame: "u32", bus: "u32", slot: "u32", value: "f32", slew: "u32" } },
  /** Sets how placed voices are spatialised (`SPACE_MODE`). */
  SPACE_SET: { id: 13, fields: { atFrame: "u32", mode: "u32" } },
  /**
   * Places a voice: `pan` -1..1, `distance` 0..1, `occlusion` 0..1, reached over `slew` frames (the first
   * place of a voice lands at once). Sent after the voice's `VOICE_START` with the same `atFrame`.
   */
  VOICE_PLACE: {
    id: 14,
    fields: {
      atFrame: "u32",
      voice: "u32",
      pan: "f32",
      distance: "f32",
      occlusion: "f32",
      slew: "u32",
    },
  },
  /**
   * Sets the transport: `bpm` (0: as it is), `beatsPerBar` (0: as it is), `swing` 0..1 on the off 16ths (negative:
   * as it is) and whether it runs (`TRANSPORT_RUN`). A tempo change keeps the beat's phase.
   */
  TRANSPORT_SET: {
    id: 15,
    fields: { atFrame: "u32", bpm: "f32", beatsPerBar: "u32", swing: "f32", running: "u32" },
  },
  /**
   * Defines sequencer track `track` (0 to 15): the voice each step starts (as `VOICE_START` names one) and the
   * grid its steps fall on (`GRID`). A `sample` of 0 removes the track.
   */
  SEQ_DEFINE: {
    id: 16,
    fields: {
      atFrame: "u32",
      track: "u32",
      sample: "u32",
      bus: "u32",
      gain: "f32",
      pan: "f32",
      sendBus1: "u32",
      send1: "f32",
      sendBus2: "u32",
      send2: "f32",
      grid: "u32",
    },
  },
  /**
   * Replaces a track's pattern: `count` steps (0 to 64, 0 a silent track) of `velocity` (0 is a rest) and `rate`
   * (a ratio; 0 is 1). It takes effect at the next bar line, or at once when `now` is 1.
   */
  SEQ_STEPS: {
    id: 17,
    fields: {
      atFrame: "u32",
      track: "u32",
      count: "u32",
      now: "u32",
      velocity: ["f32", 64],
      rate: ["f32", 64],
    },
  },
  /**
   * Starts the loop in slot `slot` (0 to 15): a sample `bars` bars long at the tempo it was made for, phase-locked to the
   * transport (started late, it starts inside itself at the transport's position). `gain` is its full level,
   * `level` 0..1 where it starts.
   */
  LOOP_START: {
    id: 18,
    fields: {
      atFrame: "u32",
      slot: "u32",
      sample: "u32",
      bus: "u32",
      gain: "f32",
      level: "f32",
      bars: "f32",
      sendBus1: "u32",
      send1: "f32",
      sendBus2: "u32",
      send2: "f32",
    },
  },
  /** Moves a loop's level (0..1) over `beats` beats of the transport. */
  LOOP_SET: { id: 19, fields: { atFrame: "u32", slot: "u32", level: "f32", beats: "f32" } },
  /** Fades a loop out over `beats` beats and ends it. */
  LOOP_STOP: { id: 20, fields: { atFrame: "u32", slot: "u32", beats: "f32" } },
  /** Starts grain cloud `cloud` (0 to 7) over a sample, at its parameters' defaults. `seed` seeds its scheduler. */
  GRAIN_START: {
    id: 21,
    fields: {
      atFrame: "u32",
      cloud: "u32",
      sample: "u32",
      bus: "u32",
      pan: "f32",
      sendBus1: "u32",
      send1: "f32",
      sendBus2: "u32",
      send2: "f32",
      seed: "u32",
    },
  },
  /** Moves a cloud's parameter (`GRAIN_PARAM`) to `value` over `slew` frames. A parameter's first set lands at once. */
  GRAIN_SET: { id: 22, fields: { atFrame: "u32", cloud: "u32", param: "u32", value: "f32", slew: "u32" } },
  /** Lets a cloud's grains finish and starts no more; `release` frames fade what is left. */
  GRAIN_STOP: { id: 23, fields: { atFrame: "u32", cloud: "u32", release: "u32" } },
  /** Starts the generator in slot `slot` (0 to 15) of a kind (`GEN_KIND`), at its parameters' defaults. */
  GEN_START: {
    id: 24,
    fields: {
      atFrame: "u32",
      slot: "u32",
      kind: "u32",
      bus: "u32",
      gain: "f32",
      pan: "f32",
      sendBus1: "u32",
      send1: "f32",
      sendBus2: "u32",
      send2: "f32",
      seed: "u32",
    },
  },
  /** Moves a generator's parameter (`GEN_PARAMS`) to `value` over `slew` frames. A first set lands at once. */
  GEN_SET: { id: 25, fields: { atFrame: "u32", slot: "u32", param: "u32", value: "f32", slew: "u32" } },
  /** Fades a generator out over `release` frames and ends it. */
  GEN_STOP: { id: 26, fields: { atFrame: "u32", slot: "u32", release: "u32" } },
  /** Defines babble voice `babble` (0 to 3): its bus and its carrier, a looped sample or (0) a pulse motor. */
  BABBLE_DEFINE: {
    id: 27,
    fields: {
      atFrame: "u32",
      babble: "u32",
      sample: "u32",
      bus: "u32",
      gain: "f32",
      pan: "f32",
      sendBus1: "u32",
      send1: "f32",
    },
  },
  /**
   * One syllable of line `line`, starting on `atFrame`: `length` frames at `pitch` (a ratio on the carrier),
   * shaped by two formants in Hz, with `noise` 0..1 of a consonant's burst at its head, at `level`. Syllable
   * `index` answers with a `STEP`. A line is sent whole, each syllable stamped with its own frame.
   */
  BABBLE_SAY: {
    id: 28,
    fields: {
      atFrame: "u32",
      babble: "u32",
      line: "u32",
      index: "u32",
      length: "u32",
      pitch: "f32",
      formant1: "f32",
      formant2: "f32",
      noise: "f32",
      level: "f32",
    },
  },
  /** Ends what a babble voice is saying: syllables of line `line` and of every earlier line are dropped from here. */
  BABBLE_STOP: { id: 29, fields: { atFrame: "u32", babble: "u32", line: "u32" } },
} as const satisfies Record<string, OpDef>;

/** Core to shell. Every event's first field is `frame`: the core's frame counter when it was written. */
export const EVENTS = {
  /** A `SAMPLE_LOAD` was taken: voices may start on `sample`. */
  SAMPLE_READY: { id: 1, fields: { frame: "u32", sample: "u32" } },
  /** A voice with a handle finished, was stopped or was stolen. */
  VOICE_ENDED: { id: 2, fields: { frame: "u32", voice: "u32" } },
  /**
   * About 60 a second: the master's momentary loudness in LUFS, each bus's peak and RMS (linear, by bus index;
   * 0 is the master after the limiter), the master's RMS in three bands (under 150 Hz, between, over 4 kHz), and
   * each bus's `reduction`: the most gain reduction of its compressors since the last event, in dB (0 or more).
   */
  METERS: {
    id: 3,
    fields: {
      frame: "u32",
      loudness: "f32",
      peak: ["f32", 16],
      rms: ["f32", 16],
      bands: ["f32", 3],
      reduction: ["f32", 16],
    },
  },
  /** The transport reached a beat: `bar` from 0, `beat` from 0 within it. `frame` is the beat's own frame. */
  BEAT: { id: 4, fields: { frame: "u32", bar: "u32", beat: "u32" } },
  /**
   * A step sounded: a sequencer track's (`source` `STEP_SOURCE.seq`, `track` the track, `index` the step) or a
   * babble voice's syllable (`STEP_SOURCE.babble`, `track` the voice, `index` the syllable). `frame` is its own.
   */
  STEP: { id: 5, fields: { frame: "u32", source: "u32", track: "u32", index: "u32" } },
} as const satisfies Record<string, OpDef>;

export type CommandName = keyof typeof COMMANDS;
export type EventName = keyof typeof EVENTS;

type ValueOf<T extends FieldType> = T extends Scalar ? number : readonly number[];
/** An op's fields by name. */
export type FieldsOf<D extends OpDef> = { -readonly [F in keyof D["fields"]]: ValueOf<D["fields"][F]> };
/** A command's fields; `atFrame` left out is 0 (now). */
export type CommandFields<C extends CommandName> = Omit<FieldsOf<(typeof COMMANDS)[C]>, "atFrame"> & {
  atFrame?: number;
};
export type EventFields<E extends EventName> = FieldsOf<(typeof EVENTS)[E]>;
/** A decoded command. */
export type SoundCommand = { [C in CommandName]: { op: C } & FieldsOf<(typeof COMMANDS)[C]> }[CommandName];
/** A decoded event. */
export type SoundEvent = { [E in EventName]: { op: E } & EventFields<E> }[EventName];

const HEADER = 4;
const countOf = (type: FieldType): number => (typeof type === "string" ? 1 : type[1]);
const scalarOf = (type: FieldType): Scalar => (typeof type === "string" ? type : type[0]);

/** A record's length in bytes, header included. */
export function recordBytes(def: OpDef): number {
  let n = HEADER;
  for (const type of Object.values(def.fields)) n += 4 * countOf(type);
  return n;
}

/** The byte offset of a field inside its record, header included (how the worklet finds `ptr` and `frame`). */
export function fieldOffset(def: OpDef, field: string): number {
  let n = HEADER;
  for (const [name, type] of Object.entries(def.fields)) {
    if (name === field) return n;
    n += 4 * countOf(type);
  }
  throw new Error(`no field ${field}`);
}

type Values = Readonly<Record<string, number | readonly number[] | undefined>>;

function write(def: OpDef, values: Values): Uint8Array {
  const bytes = new Uint8Array(recordBytes(def));
  const view = new DataView(bytes.buffer);
  view.setUint16(0, def.id, true);
  view.setUint16(2, bytes.length, true);
  let at = HEADER;
  for (const [name, type] of Object.entries(def.fields)) {
    const value = values[name];
    const float = scalarOf(type) === "f32";
    for (let i = 0; i < countOf(type); i++) {
      const n = (typeof value === "number" ? value : value?.[i]) ?? 0;
      if (float) view.setFloat32(at, n, true);
      else view.setUint32(at, n >>> 0, true);
      at += 4;
    }
  }
  return bytes;
}

function read(def: OpDef, view: DataView, start: number): Record<string, number | number[]> {
  const out: Record<string, number | number[]> = {};
  let at = start + HEADER;
  for (const [name, type] of Object.entries(def.fields)) {
    const float = scalarOf(type) === "f32";
    const one = () => {
      const n = float ? view.getFloat32(at, true) : view.getUint32(at, true);
      at += 4;
      return n;
    };
    out[name] = typeof type === "string" ? one() : Array.from({ length: type[1] }, one);
  }
  return out;
}

function decode<T extends { op: string }>(table: Readonly<Record<string, OpDef>>, bytes: Uint8Array): T[] {
  const byId = new Map(Object.entries(table).map(([name, def]) => [def.id, { name, def }]));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: T[] = [];
  let at = 0;
  while (at + HEADER <= bytes.length) {
    const length = view.getUint16(at + 2, true);
    if (length < HEADER || at + length > bytes.length) break;
    const op = byId.get(view.getUint16(at, true));
    // A record of an op this build does not know, or shorter than its fields, is skipped by its own length.
    if (op && length >= recordBytes(op.def))
      out.push({ op: op.name, ...read(op.def, view, at) } as unknown as T);
    at += length;
  }
  return out;
}

/** One command as a record. */
export function encode<C extends CommandName>(op: C, fields: CommandFields<C>): Uint8Array {
  return write(COMMANDS[op], fields as Values);
}

/** One event as a record: what a fake core answers with in a test. */
export function encodeEvent<E extends EventName>(op: E, fields: EventFields<E>): Uint8Array {
  return write(EVENTS[op], fields as Values);
}

/** Records joined into one buffer, in order. */
export function concat(records: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(records.reduce((n, r) => n + r.length, 0));
  let at = 0;
  for (const r of records) {
    out.set(r, at);
    at += r.length;
  }
  return out;
}

/** The events in a buffer the core posted. */
export const decodeEvents = (bytes: Uint8Array): SoundEvent[] => decode<SoundEvent>(EVENTS, bytes);

/** The commands in a buffer: what a fake core reads in a test. */
export const decodeCommands = (bytes: Uint8Array): SoundCommand[] => decode<SoundCommand>(COMMANDS, bytes);
