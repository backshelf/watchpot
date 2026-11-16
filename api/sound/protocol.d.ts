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
export declare const LIMITS: {
    /** Bytes of commands the core takes per block; the worklet holds the rest for the next. */
    readonly CMD_CAP: 65536;
    /** Bytes of events the core can write per block. */
    readonly EVT_CAP: 8192;
    /** Frames per `process` call; the worklet splits a larger render quantum. */
    readonly MAX_BLOCK: 128;
    /** Buses, the master included. */
    readonly MAX_BUSES: 16;
    /** Sample ids run 1 to `MAX_SAMPLES - 1`. */
    readonly MAX_SAMPLES: 4096;
    /** Effect slots on a bus, the master included. */
    readonly FX_SLOTS: 8;
    /** The most parameters one effect has. */
    readonly FX_PARAM_CAP: 16;
    /** Sequencer tracks, and the most steps one holds. */
    readonly SEQ_TRACKS: 16;
    readonly SEQ_STEPS: 64;
    /** Loops, grain clouds, generators and babble voices the core holds at once. */
    readonly LOOPS: 16;
    readonly GRAIN_CLOUDS: 8;
    readonly GENS: 16;
    readonly BABBLES: 4;
    /** The most parameters one generator has, and where a modal generator's modes start (three ids a mode). */
    readonly GEN_PARAM_CAP: 64;
    /** Voice handles from here up are the core's own (loops, sequencer steps): the shell never issues one. */
    readonly CORE_VOICE: 2147483648;
};
/** What `VOICE_SET.param` names. */
export declare const VOICE_PARAM: {
    readonly gain: 0;
    readonly pan: 1;
    readonly rate: 2;
    readonly send1: 3;
    readonly send2: 4;
};
/** What `BUS_SET.param` names; `send` sets the level of the send to the bus in `index`. */
export declare const BUS_PARAM: {
    readonly gain: 0;
    readonly mute: 1;
    readonly send: 2;
};
/** What `MASTER_SET.param` names; `ceiling` is the limiter's, linear. */
export declare const MASTER_PARAM: {
    readonly gain: 0;
    readonly mute: 1;
    readonly ceiling: 2;
};
/** The effect a bus slot holds (`FX_DEFINE.kind`); `none` empties the slot. */
export declare const FX_KIND: {
    readonly none: 0;
    readonly svf: 1;
    readonly eq: 2;
    readonly comp: 3;
    readonly sat: 4;
    readonly delay: 5;
    readonly tape: 6;
    readonly crush: 7;
    readonly fdn: 8;
    readonly conv: 9;
    readonly freeze: 10;
    readonly stereo: 11;
};
/** How a slewed value travels to its target: a straight line, or a straight line in its logarithm (frequencies, times). */
export declare const CURVE: {
    readonly lin: 0;
    readonly exp: 1;
};
/** What `SPACE_SET.mode` names: a pan law for speakers, or time and level differences between the ears. */
export declare const SPACE_MODE: {
    readonly speakers: 0;
    readonly headphones: 1;
};
/**
 * A line of the transport's grid: a 32nd, a 16th, an 8th, a quarter (the beat) or the bar. The low three bits of
 * `VOICE_START.flags` name the line a start waits for (`off`: none).
 */
export declare const GRID: {
    readonly off: 0;
    readonly n32: 1;
    readonly n16: 2;
    readonly n8: 3;
    readonly n4: 4;
    readonly bar: 5;
};
/** A grid line's id by its public name (`Grid` in `types.ts`); none is `off`. */
export declare function gridId(grid: "off" | "32" | "16" | "8" | "4" | "bar" | undefined): number;
/** What `TRANSPORT_SET.running` asks. */
export declare const TRANSPORT_RUN: {
    readonly stop: 0;
    readonly start: 1;
    readonly keep: 2;
};
/** What `GRAIN_SET.param` names. */
export declare const GRAIN_PARAM: {
    readonly position: 0;
    readonly rate: 1;
    readonly size: 2;
    readonly density: 3;
    readonly spray: 4;
    readonly pitch: 5;
    readonly spread: 6;
    readonly level: 7;
};
/** The modelled sources (`GEN_START.kind`). */
export declare const GEN_KIND: {
    readonly motor: 1;
    readonly noise: 2;
    readonly modal: 3;
};
/** Who a `STEP` event is from. */
export declare const STEP_SOURCE: {
    readonly seq: 0;
    readonly babble: 1;
};
export declare const ENUMS: {
    readonly VOICE_PARAM: {
        readonly gain: 0;
        readonly pan: 1;
        readonly rate: 2;
        readonly send1: 3;
        readonly send2: 4;
    };
    readonly BUS_PARAM: {
        readonly gain: 0;
        readonly mute: 1;
        readonly send: 2;
    };
    readonly MASTER_PARAM: {
        readonly gain: 0;
        readonly mute: 1;
        readonly ceiling: 2;
    };
    readonly FX_KIND: {
        readonly none: 0;
        readonly svf: 1;
        readonly eq: 2;
        readonly comp: 3;
        readonly sat: 4;
        readonly delay: 5;
        readonly tape: 6;
        readonly crush: 7;
        readonly fdn: 8;
        readonly conv: 9;
        readonly freeze: 10;
        readonly stereo: 11;
    };
    readonly CURVE: {
        readonly lin: 0;
        readonly exp: 1;
    };
    readonly SPACE_MODE: {
        readonly speakers: 0;
        readonly headphones: 1;
    };
    readonly GRID: {
        readonly off: 0;
        readonly n32: 1;
        readonly n16: 2;
        readonly n8: 3;
        readonly n4: 4;
        readonly bar: 5;
    };
    readonly TRANSPORT_RUN: {
        readonly stop: 0;
        readonly start: 1;
        readonly keep: 2;
    };
    readonly GRAIN_PARAM: {
        readonly position: 0;
        readonly rate: 1;
        readonly size: 2;
        readonly density: 3;
        readonly spray: 4;
        readonly pitch: 5;
        readonly spread: 6;
        readonly level: 7;
    };
    readonly GEN_KIND: {
        readonly motor: 1;
        readonly noise: 2;
        readonly modal: 3;
    };
    readonly STEP_SOURCE: {
        readonly seq: 0;
        readonly babble: 1;
    };
};
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
export declare const GEN_PARAMS: {
    readonly motor: {
        readonly rate: 0;
        readonly duty: 1;
        readonly body1: 2;
        readonly body1Q: 3;
        readonly body2: 4;
        readonly body2Q: 5;
        readonly load: 6;
        readonly level: 7;
    };
    readonly noise: {
        readonly color: 0;
        readonly centre: 1;
        readonly width: 2;
        readonly grid: 3;
        readonly duty: 4;
        readonly tilt: 5;
        readonly level: 6;
    };
    readonly modal: {
        readonly strike: 0;
        readonly damp: 1;
        readonly size: 2;
        readonly level: 3;
        readonly mode: 16;
    };
};
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
export declare const FX_PARAMS: {
    readonly svf: {
        readonly cutoff: 0;
        readonly q: 1;
        readonly mode: 2;
        readonly slope: 3;
    };
    readonly eq: {
        readonly lowFreq: 0;
        readonly lowGain: 1;
        readonly mid1Freq: 2;
        readonly mid1Gain: 3;
        readonly mid1Q: 4;
        readonly mid2Freq: 5;
        readonly mid2Gain: 6;
        readonly mid2Q: 7;
        readonly highFreq: 8;
        readonly highGain: 9;
    };
    readonly comp: {
        readonly threshold: 0;
        readonly ratio: 1;
        readonly attack: 2;
        readonly release: 3;
        readonly knee: 4;
        readonly makeup: 5;
        readonly range: 6;
        readonly mix: 7;
    };
    readonly sat: {
        readonly drive: 0;
        readonly tilt: 1;
        readonly mix: 2;
    };
    readonly delay: {
        readonly time: 0;
        readonly beats: 1;
        readonly tempo: 2;
        readonly feedback: 3;
        readonly filter: 4;
        readonly pingpong: 5;
        readonly glide: 6;
        readonly mix: 7;
    };
    readonly tape: {
        readonly wow: 0;
        readonly wowRate: 1;
        readonly flutter: 2;
        readonly flutterRate: 3;
        readonly speed: 4;
        readonly hiss: 5;
    };
    readonly crush: {
        readonly rate: 0;
        readonly bits: 1;
        readonly mix: 2;
    };
    readonly fdn: {
        readonly size: 0;
        readonly decay: 1;
        readonly damping: 2;
        readonly predelay: 3;
        readonly width: 4;
        readonly mod: 5;
        readonly early: 6;
        readonly mix: 7;
    };
    readonly conv: {
        readonly mix: 0;
        readonly gain: 1;
    };
    readonly freeze: {
        readonly amount: 0;
        readonly stutter: 1;
    };
    readonly stereo: {
        readonly width: 0;
        readonly pan: 1;
    };
};
/** Shell to core. */
export declare const COMMANDS: {
    /** The core's frame counter becomes `frame` now. Written by the worklet on its first block. */
    readonly CLOCK_SET: {
        readonly id: 1;
        readonly fields: {
            readonly atFrame: "u32";
            readonly frame: "u32";
        };
    };
    /**
     * Registers 16-bit interleaved PCM already copied into the core's memory at `ptr` (from the ABI's `alloc`): the
     * worklet fills `ptr` in. `rate` is the source's sample rate. Answered by `SAMPLE_READY`.
     */
    readonly SAMPLE_LOAD: {
        readonly id: 2;
        readonly fields: {
            readonly atFrame: "u32";
            readonly sample: "u32";
            readonly ptr: "u32";
            readonly frames: "u32";
            readonly channels: "u32";
            readonly rate: "f32";
        };
    };
    /** Frees a sample's memory; voices playing it are released first. */
    readonly SAMPLE_FREE: {
        readonly id: 3;
        readonly fields: {
            readonly atFrame: "u32";
            readonly sample: "u32";
        };
    };
    /**
     * Starts a voice. `voice` is the shell's handle for `VOICE_SET` and `VOICE_STOP` (0: none, and no `VOICE_ENDED`).
     * `offset` is where in the sample it starts, in source frames; `loopEnd` 0 is no loop, else the voice loops
     * `[loopStart, loopEnd)`; `attack` and `release` 0 are the defaults (2 ms, 8 ms). A start for a sample the core
     * does not hold is ignored.
     */
    readonly VOICE_START: {
        readonly id: 4;
        readonly fields: {
            readonly atFrame: "u32";
            readonly voice: "u32";
            readonly sample: "u32";
            readonly bus: "u32";
            readonly gain: "f32";
            readonly pan: "f32";
            readonly rate: "f32";
            readonly offset: "u32";
            readonly loopStart: "u32";
            readonly loopEnd: "u32";
            readonly attack: "u32";
            readonly release: "u32";
            readonly sendBus1: "u32";
            readonly send1: "f32";
            readonly sendBus2: "u32";
            readonly send2: "f32";
            readonly priority: "u32";
            readonly flags: "u32";
        };
    };
    /** Moves one of a voice's parameters (`VOICE_PARAM`) to `value` over `slew` frames. */
    readonly VOICE_SET: {
        readonly id: 5;
        readonly fields: {
            readonly atFrame: "u32";
            readonly voice: "u32";
            readonly param: "u32";
            readonly value: "f32";
            readonly slew: "u32";
        };
    };
    /** Releases a voice over `release` frames (0: its own release). */
    readonly VOICE_STOP: {
        readonly id: 6;
        readonly fields: {
            readonly atFrame: "u32";
            readonly voice: "u32";
            readonly release: "u32";
        };
    };
    /** Defines or redefines bus `bus` (1 to 15), summed into bus `out` (0: the master) at `gain`. */
    readonly BUS_DEFINE: {
        readonly id: 7;
        readonly fields: {
            readonly atFrame: "u32";
            readonly bus: "u32";
            readonly out: "u32";
            readonly gain: "f32";
        };
    };
    /** Moves one of a bus's parameters (`BUS_PARAM`) to `value` over `slew` frames; `index` is a send's target. */
    readonly BUS_SET: {
        readonly id: 8;
        readonly fields: {
            readonly atFrame: "u32";
            readonly bus: "u32";
            readonly param: "u32";
            readonly index: "u32";
            readonly value: "f32";
            readonly slew: "u32";
        };
    };
    /** Moves one of the master's parameters (`MASTER_PARAM`) to `value` over `slew` frames. */
    readonly MASTER_SET: {
        readonly id: 9;
        readonly fields: {
            readonly atFrame: "u32";
            readonly param: "u32";
            readonly value: "f32";
            readonly slew: "u32";
        };
    };
    /**
     * Puts an effect (`FX_KIND`) in slot `slot` (0 to 7) of bus `bus` (0: the master), replacing what was there;
     * `none` empties the slot. Slots run in order, before the bus's fader. `key` is a key bus plus one (0: none):
     * what a compressor listens to instead of its own bus. The effect starts at its own defaults, and on (`FX_ON` is
     * forgotten). Allocates: sent when a mix is built, not while playing.
     */
    readonly FX_DEFINE: {
        readonly id: 10;
        readonly fields: {
            readonly atFrame: "u32";
            readonly bus: "u32";
            readonly slot: "u32";
            readonly kind: "u32";
            readonly key: "u32";
        };
    };
    /**
     * Moves one parameter (`FX_PARAMS`) of the effect in a slot to `value` over `slew` frames along `curve`
     * (`CURVE`). A parameter's first set lands at once.
     */
    readonly FX_SET: {
        readonly id: 11;
        readonly fields: {
            readonly atFrame: "u32";
            readonly bus: "u32";
            readonly slot: "u32";
            readonly param: "u32";
            readonly value: "f32";
            readonly slew: "u32";
            readonly curve: "u32";
        };
    };
    /** Hands the convolver in a slot its impulse response: a sample the core holds. Allocates. */
    readonly IR_LOAD: {
        readonly id: 12;
        readonly fields: {
            readonly atFrame: "u32";
            readonly bus: "u32";
            readonly slot: "u32";
            readonly sample: "u32";
        };
    };
    /**
     * Turns the effect in a slot on (`value` 1, as it starts) or off (0) over `slew` frames (0: a cut, which may
     * click): its output crossfades with its input, sample by sample, and a unit fully off is not run, so the bus
     * passes through the slot unchanged. Switching off cuts a tail with the fade; a unit switched on from fully off
     * starts from silence (its delay lines and envelopes cleared). Its parameters keep moving while it is off.
     */
    readonly FX_ON: {
        readonly id: 30;
        readonly fields: {
            readonly atFrame: "u32";
            readonly bus: "u32";
            readonly slot: "u32";
            readonly value: "f32";
            readonly slew: "u32";
        };
    };
    /** Sets how placed voices are spatialised (`SPACE_MODE`). */
    readonly SPACE_SET: {
        readonly id: 13;
        readonly fields: {
            readonly atFrame: "u32";
            readonly mode: "u32";
        };
    };
    /**
     * Places a voice: `pan` -1..1, `distance` 0..1, `occlusion` 0..1, reached over `slew` frames (the first
     * place of a voice lands at once). Sent after the voice's `VOICE_START` with the same `atFrame`.
     */
    readonly VOICE_PLACE: {
        readonly id: 14;
        readonly fields: {
            readonly atFrame: "u32";
            readonly voice: "u32";
            readonly pan: "f32";
            readonly distance: "f32";
            readonly occlusion: "f32";
            readonly slew: "u32";
        };
    };
    /**
     * Sets the transport: `bpm` (0: as it is), `beatsPerBar` (0: as it is), `swing` 0..1 on the off 16ths (negative:
     * as it is) and whether it runs (`TRANSPORT_RUN`). A tempo change keeps the beat's phase.
     */
    readonly TRANSPORT_SET: {
        readonly id: 15;
        readonly fields: {
            readonly atFrame: "u32";
            readonly bpm: "f32";
            readonly beatsPerBar: "u32";
            readonly swing: "f32";
            readonly running: "u32";
        };
    };
    /**
     * Defines sequencer track `track` (0 to 15): the voice each step starts (as `VOICE_START` names one) and the
     * grid its steps fall on (`GRID`). A `sample` of 0 removes the track.
     */
    readonly SEQ_DEFINE: {
        readonly id: 16;
        readonly fields: {
            readonly atFrame: "u32";
            readonly track: "u32";
            readonly sample: "u32";
            readonly bus: "u32";
            readonly gain: "f32";
            readonly pan: "f32";
            readonly sendBus1: "u32";
            readonly send1: "f32";
            readonly sendBus2: "u32";
            readonly send2: "f32";
            readonly grid: "u32";
        };
    };
    /**
     * Replaces a track's pattern: `count` steps (0 to 64, 0 a silent track) of `velocity` (0 is a rest) and `rate`
     * (a ratio; 0 is 1). It takes effect at the next bar line, or at once when `now` is 1.
     */
    readonly SEQ_STEPS: {
        readonly id: 17;
        readonly fields: {
            readonly atFrame: "u32";
            readonly track: "u32";
            readonly count: "u32";
            readonly now: "u32";
            readonly velocity: readonly ["f32", 64];
            readonly rate: readonly ["f32", 64];
        };
    };
    /**
     * Starts the loop in slot `slot` (0 to 15): a sample `bars` bars long at the tempo it was made for, phase-locked to the
     * transport (started late, it starts inside itself at the transport's position). `gain` is its full level,
     * `level` 0..1 where it starts.
     */
    readonly LOOP_START: {
        readonly id: 18;
        readonly fields: {
            readonly atFrame: "u32";
            readonly slot: "u32";
            readonly sample: "u32";
            readonly bus: "u32";
            readonly gain: "f32";
            readonly level: "f32";
            readonly bars: "f32";
            readonly sendBus1: "u32";
            readonly send1: "f32";
            readonly sendBus2: "u32";
            readonly send2: "f32";
        };
    };
    /** Moves a loop's level (0..1) over `beats` beats of the transport. */
    readonly LOOP_SET: {
        readonly id: 19;
        readonly fields: {
            readonly atFrame: "u32";
            readonly slot: "u32";
            readonly level: "f32";
            readonly beats: "f32";
        };
    };
    /** Fades a loop out over `beats` beats and ends it. */
    readonly LOOP_STOP: {
        readonly id: 20;
        readonly fields: {
            readonly atFrame: "u32";
            readonly slot: "u32";
            readonly beats: "f32";
        };
    };
    /** Starts grain cloud `cloud` (0 to 7) over a sample, at its parameters' defaults. `seed` seeds its scheduler. */
    readonly GRAIN_START: {
        readonly id: 21;
        readonly fields: {
            readonly atFrame: "u32";
            readonly cloud: "u32";
            readonly sample: "u32";
            readonly bus: "u32";
            readonly pan: "f32";
            readonly sendBus1: "u32";
            readonly send1: "f32";
            readonly sendBus2: "u32";
            readonly send2: "f32";
            readonly seed: "u32";
        };
    };
    /** Moves a cloud's parameter (`GRAIN_PARAM`) to `value` over `slew` frames. A parameter's first set lands at once. */
    readonly GRAIN_SET: {
        readonly id: 22;
        readonly fields: {
            readonly atFrame: "u32";
            readonly cloud: "u32";
            readonly param: "u32";
            readonly value: "f32";
            readonly slew: "u32";
        };
    };
    /** Lets a cloud's grains finish and starts no more; `release` frames fade what is left. */
    readonly GRAIN_STOP: {
        readonly id: 23;
        readonly fields: {
            readonly atFrame: "u32";
            readonly cloud: "u32";
            readonly release: "u32";
        };
    };
    /** Starts the generator in slot `slot` (0 to 15) of a kind (`GEN_KIND`), at its parameters' defaults. */
    readonly GEN_START: {
        readonly id: 24;
        readonly fields: {
            readonly atFrame: "u32";
            readonly slot: "u32";
            readonly kind: "u32";
            readonly bus: "u32";
            readonly gain: "f32";
            readonly pan: "f32";
            readonly sendBus1: "u32";
            readonly send1: "f32";
            readonly sendBus2: "u32";
            readonly send2: "f32";
            readonly seed: "u32";
        };
    };
    /** Moves a generator's parameter (`GEN_PARAMS`) to `value` over `slew` frames. A first set lands at once. */
    readonly GEN_SET: {
        readonly id: 25;
        readonly fields: {
            readonly atFrame: "u32";
            readonly slot: "u32";
            readonly param: "u32";
            readonly value: "f32";
            readonly slew: "u32";
        };
    };
    /** Fades a generator out over `release` frames and ends it. */
    readonly GEN_STOP: {
        readonly id: 26;
        readonly fields: {
            readonly atFrame: "u32";
            readonly slot: "u32";
            readonly release: "u32";
        };
    };
    /** Defines babble voice `babble` (0 to 3): its bus and its carrier, a looped sample or (0) a pulse motor. */
    readonly BABBLE_DEFINE: {
        readonly id: 27;
        readonly fields: {
            readonly atFrame: "u32";
            readonly babble: "u32";
            readonly sample: "u32";
            readonly bus: "u32";
            readonly gain: "f32";
            readonly pan: "f32";
            readonly sendBus1: "u32";
            readonly send1: "f32";
        };
    };
    /**
     * One syllable of line `line`, starting on `atFrame`: `length` frames at `pitch` (a ratio on the carrier),
     * shaped by two formants in Hz, with `noise` 0..1 of a consonant's burst at its head, at `level`. Syllable
     * `index` answers with a `STEP`. A line is sent whole, each syllable stamped with its own frame.
     */
    readonly BABBLE_SAY: {
        readonly id: 28;
        readonly fields: {
            readonly atFrame: "u32";
            readonly babble: "u32";
            readonly line: "u32";
            readonly index: "u32";
            readonly length: "u32";
            readonly pitch: "f32";
            readonly formant1: "f32";
            readonly formant2: "f32";
            readonly noise: "f32";
            readonly level: "f32";
        };
    };
    /** Ends what a babble voice is saying: syllables of line `line` and of every earlier line are dropped from here. */
    readonly BABBLE_STOP: {
        readonly id: 29;
        readonly fields: {
            readonly atFrame: "u32";
            readonly babble: "u32";
            readonly line: "u32";
        };
    };
};
/** Core to shell. Every event's first field is `frame`: the core's frame counter when it was written. */
export declare const EVENTS: {
    /** A `SAMPLE_LOAD` was taken: voices may start on `sample`. */
    readonly SAMPLE_READY: {
        readonly id: 1;
        readonly fields: {
            readonly frame: "u32";
            readonly sample: "u32";
        };
    };
    /** A voice with a handle finished, was stopped or was stolen. */
    readonly VOICE_ENDED: {
        readonly id: 2;
        readonly fields: {
            readonly frame: "u32";
            readonly voice: "u32";
        };
    };
    /**
     * About 60 a second: the master's momentary loudness in LUFS, each bus's peak and RMS (linear, by bus index;
     * 0 is the master after the limiter), the master's RMS in three bands (under 150 Hz, between, over 4 kHz), and
     * each bus's `reduction`: the most gain reduction of its compressors since the last event, in dB (0 or more).
     */
    readonly METERS: {
        readonly id: 3;
        readonly fields: {
            readonly frame: "u32";
            readonly loudness: "f32";
            readonly peak: readonly ["f32", 16];
            readonly rms: readonly ["f32", 16];
            readonly bands: readonly ["f32", 3];
            readonly reduction: readonly ["f32", 16];
        };
    };
    /** The transport reached a beat: `bar` from 0, `beat` from 0 within it. `frame` is the beat's own frame. */
    readonly BEAT: {
        readonly id: 4;
        readonly fields: {
            readonly frame: "u32";
            readonly bar: "u32";
            readonly beat: "u32";
        };
    };
    /**
     * A step sounded: a sequencer track's (`source` `STEP_SOURCE.seq`, `track` the track, `index` the step) or a
     * babble voice's syllable (`STEP_SOURCE.babble`, `track` the voice, `index` the syllable). `frame` is its own.
     */
    readonly STEP: {
        readonly id: 5;
        readonly fields: {
            readonly frame: "u32";
            readonly source: "u32";
            readonly track: "u32";
            readonly index: "u32";
        };
    };
};
export type CommandName = keyof typeof COMMANDS;
export type EventName = keyof typeof EVENTS;
type ValueOf<T extends FieldType> = T extends Scalar ? number : readonly number[];
/** An op's fields by name. */
export type FieldsOf<D extends OpDef> = {
    -readonly [F in keyof D["fields"]]: ValueOf<D["fields"][F]>;
};
/** A command's fields; `atFrame` left out is 0 (now). */
export type CommandFields<C extends CommandName> = Omit<FieldsOf<(typeof COMMANDS)[C]>, "atFrame"> & {
    atFrame?: number;
};
export type EventFields<E extends EventName> = FieldsOf<(typeof EVENTS)[E]>;
/** A decoded command. */
export type SoundCommand = {
    [C in CommandName]: {
        op: C;
    } & FieldsOf<(typeof COMMANDS)[C]>;
}[CommandName];
/** A decoded event. */
export type SoundEvent = {
    [E in EventName]: {
        op: E;
    } & EventFields<E>;
}[EventName];
/** A record's length in bytes, header included. */
export declare function recordBytes(def: OpDef): number;
/** The byte offset of a field inside its record, header included (how the worklet finds `ptr` and `frame`). */
export declare function fieldOffset(def: OpDef, field: string): number;
/** One command as a record. */
export declare function encode<C extends CommandName>(op: C, fields: CommandFields<C>): Uint8Array;
/** One event as a record: what a fake core answers with in a test. */
export declare function encodeEvent<E extends EventName>(op: E, fields: EventFields<E>): Uint8Array;
/** Records joined into one buffer, in order. */
export declare function concat(records: readonly Uint8Array[]): Uint8Array;
/** The events in a buffer the core posted. */
export declare const decodeEvents: (bytes: Uint8Array) => SoundEvent[];
/** The commands in a buffer: what a fake core reads in a test. */
export declare const decodeCommands: (bytes: Uint8Array) => SoundCommand[];
export {};
