/**
 * The public types of `watchpot/sound`: a game's cue table, its packs, what `play` takes and returns, and the
 * `Sound` a game holds. Types only; `createSound` is in `engine.ts`.
 */
import type { Desk, MixFile, MixFileV1 } from "./desk";
import type { PresetVoiceName } from "./presets";
import type { Layer } from "./voice";

/** The buses every sound has when a game declares none. Each sums into the master. */
export type DefaultBus = "sfx" | "ui" | "music" | "ambience" | "voice";

/**
 * One recording a cue may play, by its key in a loaded pack (`"pack/sample"`). One take is picked per play.
 */
export interface Take {
  /** The sample's key: `"<pack>/<sample>"`. */
  sample: string;
  /** How often `pick: "random"` chooses it against the others (default 1). */
  weight?: number;
  /** The `velocity` range (0..1, inclusive) this take answers to; left out, it answers to all. */
  velocity?: readonly [number, number];
  /** The take's own speed and pitch as a ratio (default 1). */
  rate?: number;
  /** dB on top of the cue's level. */
  level?: number;
  /** Seconds into the sample the take starts (default 0). */
  at?: number;
}

/** A line of the transport's grid a play may wait for. `"off"` plays now. */
export type Grid = "off" | "32" | "16" | "8" | "4" | "bar";

/**
 * One clip in a 0.6 sampled cue: `at` seconds after the cue starts, scaled to a target RMS of `level`, played at
 * `playbackRate` (2 is an octave up and half as long). Every layer of a cue plays together.
 * @deprecated Still read; a new cue names `takes`.
 */
export interface ClipLayer<F extends string = string> {
  file: F;
  at?: number;
  level: number;
  /**
   * The clip's speed and pitch as a ratio, held to 1/16..16 (four octaves either way). Default 1; anything not a
   * positive finite number plays at 1.
   */
  playbackRate?: number;
}

/**
 * One cue. `takes` are its recordings (one is picked per play); `voices` are its zzfx layers: what plays until the
 * recordings are loaded, where the core cannot start, and the whole cue where there is no recording.
 */
export interface Cue<B extends string = string, F extends string = string> {
  /** zzfx layers: the fallback, or the whole cue. */
  voices?: readonly Layer[];
  /**
   * The 0.6 shape: clips by file name, all layers together.
   * @deprecated Still read; a new cue names `takes`.
   */
  clips?: readonly ClipLayer<F>[];
  /** Recordings from packs; one is picked per play. */
  takes?: readonly Take[];
  /** How a take is picked: a shuffled bag with no immediate repeat (the default), in order, or by weight. */
  pick?: "shuffle" | "round" | "random";
  /** The bus the cue plays on (default `"sfx"`). */
  bus?: B;
  /** dB on top of the pack's loudness match. */
  level?: number;
  /** How much each play differs: pitch in cents, level in dB, start in milliseconds, each drawn within ± the value. */
  vary?: { cents?: number; db?: number; startMs?: number };
  /** `play(key, { step })` → a rate: a ratio per step, or `"scale"` for degrees of the harmony clock. */
  ladder?: readonly number[] | "scale";
  /** Transposed onto the harmony clock, from the sample's root in the pack's manifest. */
  pitched?: boolean;
  /** The grid line a play waits for (default `"off"`). */
  quantise?: Grid;
  /** The shortest gap between two plays, in milliseconds. */
  cooldownMs?: number;
  /** Which voice goes when the pool is full: the lowest goes first (default 0). */
  priority?: number;
  /** How loud the cue is among the others, in dB (default 60): the governor skips what a louder sound buries. */
  loudness?: number;
  /** Above `above` plays a second the cue becomes one sustained voice (`cue`, or the same take looped). */
  roll?: { above: number; cue?: string };
  /** Send levels by bus name (0..1), at most two. */
  sends?: Readonly<Record<string, number>>;
  /** Placed on the screen by `play(key, { at })`. */
  placed?: boolean;
  /**
   * Loops until the voice `play` returns is stopped: a bed, a hum, anything with no end of its own. Plays only
   * through the core (nothing where it cannot start), and never rolls.
   */
  loop?: boolean;
}

/**
 * The 0.6 name of a cue: it names no bus (`never`), so a table typed with it fits a sound with any buses.
 */
export type SoundCue<F extends string = string> = Cue<never, F>;

/**
 * A cue as a string, in `SoundOptions.cues`: a preset voice name plays that default zzfx voice on its bus (`ui` or
 * `sfx`); `"<pack>/<sample>"` plays that one recording on `sfx`.
 */
export type CueShorthand = PresetVoiceName | `${string}/${string}`;

/** What a single play may say. `B` names the buses it may go to. */
export interface PlayOptions<B extends string = string> {
  /** The bus this play goes to, in place of the cue's own. */
  bus?: B;
  /** The step of the cue's `ladder`. */
  step?: number;
  /** How hard, 0..1: picks among takes with a `velocity` range, and scales the level. */
  velocity?: number;
  /** Where on the screen it happened: a viewport point or an element. */
  at?: { x: number; y: number } | Element;
  /**
   * Whose hand did it. `true`, the player's: the governor never skips or rolls it and ignores the cue's
   * `cooldownMs`, and repetition lowers it 3 dB at most. `false`, the machine's. Either way the mix shapes it by
   * `SoundOptions.presence` (by default the player's plays as written and the machine's 6 dB down, with more of its
   * first send). Absent: neither, and untouched by `presence`.
   */
  mine?: boolean;
  /** A ratio on top of everything else. */
  rate?: number;
  /** dB on top of everything else. */
  db?: number;
  /** A scale degree for a `pitched` cue. */
  degree?: number;
  /** Starts this many milliseconds from now. */
  delayMs?: number;
  /** Fades in over this many milliseconds (default: the voice's own 2 ms): a bed arriving under another. */
  attackMs?: number;
  /** Waits for a line of the transport's grid, whatever the cue's own `quantise` says. */
  when?: Grid;
}

/** What a playing voice can have moved. */
export type VoiceParam = "gain" | "pan" | "rate" | "send1" | "send2";

/** A playing voice. Calls on a voice that has ended do nothing. */
export interface VoiceHandle {
  /** Releases it over `releaseMs` (default: its own release). */
  stop(releaseMs?: number): void;
  /** Moves a parameter to `value` over `slewMs` (default 0). Gain is linear, pan -1..1, rate a ratio. */
  set(param: VoiceParam, value: number, slewMs?: number): void;
}

/** One sample of a pack, as `buildPack` measured it. */
export interface PackSample {
  /** The encoded file's URL (a bundler's fingerprinted import). */
  url: string;
  seconds: number;
  channels: 1 | 2;
  /** Integrated loudness after the pipeline's gain. */
  lufs: number;
  /** True peak after the pipeline's gain, linear. */
  peak: number;
  kind: "shot" | "loop" | "ir";
  /** The detected root, for a tonal sample. */
  rootHz?: number;
  /** A loop's length in bars at the pack's tempo. */
  bars?: number;
  /** Where the recording came from (the sidecar's `source`). */
  source?: string;
}

/** A pack: what `buildPack` writes and a game imports. */
export interface PackManifest {
  name: string;
  /** The tempo every loop in the pack is cut to. */
  tempo?: number;
  /** The pack's key (`"C"`, `"Am"`). */
  key?: string;
  samples: Readonly<Record<string, PackSample>>;
}

/** A pack as a game hands it over: the manifest, or a function that imports it on first use. */
export type PackSource = PackManifest | (() => Promise<PackManifest>);

/**
 * Options for `createSound`. `B` names the buses a game declares beside the five defaults: it is read from `buses`,
 * and every place a bus is named takes a default or one of those.
 */
export interface SoundOptions<K extends string, F extends string = string, B extends string = never> {
  /** What was saved from the mix desk: laid over everything declared here, in development and in production. */
  mix?: MixFile | MixFileV1;
  /** Every cue by key: a `Cue`, or a shorthand string (a preset voice name, or a `"<pack>/<sample>"` key). */
  cues: Readonly<Record<K, Cue<DefaultBus | NoInfer<B>, F> | CueShorthand>>;
  /**
   * The 0.6 clip registry: every clip by name, to its URL.
   * @deprecated Still read; a new game ships `packs`.
   */
  samples?: Readonly<Record<F, string>>;
  /** Every pack by name: loaded by `loadPack(name)`, freed by `unloadPack(name)`. */
  packs?: Readonly<Record<string, PackSource>>;
  /** The master volume, 0..1 (default 0.3, zzfx's own). */
  volume?: number;
  /** How many voices the core mixes at once (default 64). */
  voices?: number;
  /**
   * Buses beside the five defaults, or a default redefined: each with its output, its level, its effects and its
   * sends. At most 15 in all.
   */
  buses?: Readonly<Partial<Record<DefaultBus | B, BusDef<DefaultBus | NoInfer<B>>>>>;
  /** Named mixes: `sound.mixer.scene(name)` fades to one. */
  scenes?: Readonly<Record<string, SceneDef<DefaultBus | NoInfer<B>>>>;
  /** Routes of the mod matrix known up front; `sound.mod.route` adds more. */
  routes?: readonly ModRoute<DefaultBus | NoInfer<B>>[];
  /**
   * What a play's hand does to its voice: `mine` for `play(key, { mine: true })`, `other` for `mine: false`. A play
   * that says neither is untouched. Default: the player's own is as written, the machine's is 6 dB down with 6 dB
   * more of its first send.
   */
  presence?: { mine?: Presence; other?: Presence };
  /** Seeds the picks and the variation, so a run can be repeated (default 1). */
  seed?: number;
}

/** A bus by name, the master included. */
export type BusName<B extends string> = B | "master";

/**
 * One effect in a bus's chain, by kind, with its settings in natural units (Hz, seconds, dB, 0..1). Every setting
 * left out is the effect's own default.
 *
 * `id` names it on its bus (not all digits, and no other effect of the bus has it): what a scene, a mod route, a
 * handle and the mix desk's file call it, wherever the desk has since moved it in the chain. One with no `id` is
 * named by its place in the declared chain (`"0"`, `"1"`). `on: false` declares it bypassed.
 */
export type FxDef<B extends string = string> = FxUnit<B> & { id?: string; on?: boolean };

/** An effect's kind and settings: `FxDef` without its name. */
export type FxUnit<B extends string = string> =
  | { kind: "filter"; mode?: "low" | "high" | "band" | "notch"; cutoff?: number; q?: number; slope?: 12 | 24 }
  | {
      kind: "eq";
      lowFreq?: number;
      lowGain?: number;
      mid1Freq?: number;
      mid1Gain?: number;
      mid1Q?: number;
      mid2Freq?: number;
      mid2Gain?: number;
      mid2Q?: number;
      highFreq?: number;
      highGain?: number;
    }
  | {
      kind: "compressor";
      threshold?: number;
      ratio?: number;
      attack?: number;
      release?: number;
      knee?: number;
      makeup?: number;
      /** The most gain reduction, in dB. */
      range?: number;
      mix?: number;
      /** The bus it listens to instead of its own: with a key it ducks its bus under another. */
      key?: B;
    }
  | { kind: "saturator"; drive?: number; tilt?: number; mix?: number }
  | {
      kind: "delay";
      time?: number;
      /** Above 0: the time as beats, and `time` is ignored. */
      beats?: number;
      /** The bpm `beats` count. Left out (or 0), they are beats of `sound.transport`. */
      tempo?: number;
      feedback?: number;
      /** The cutoff of the filter in the loop, in Hz. */
      filter?: number;
      pingpong?: boolean;
      /** A time change swoops in pitch instead of crossfading. */
      glide?: boolean;
      mix?: number;
    }
  | {
      kind: "tape";
      wow?: number;
      wowRate?: number;
      flutter?: number;
      flutterRate?: number;
      /** 0..2: 1 is normal, 0 a stopped tape. */
      speed?: number;
      hiss?: number;
    }
  | { kind: "crush"; rate?: number; bits?: number; mix?: number }
  /** `width`: 0 is mono, 1 as it is, up to 2. `pan`: -1..1, the whole bus moved across the field. */
  | { kind: "stereo"; width?: number; pan?: number }
  | {
      kind: "reverb";
      /** 0..1: the room, playable while it sounds. */
      size?: number;
      /** Seconds. */
      decay?: number;
      damping?: number;
      predelay?: number;
      width?: number;
      mod?: number;
      early?: number;
      mix?: number;
    }
  | {
      kind: "freeze";
      /** 0..1: how much of the held spectrum replaces the live signal. `sound.freeze(bus, amount)` moves it. */
      amount?: number;
      /** Instead of holding the spectrum, repeat the last eighth, sixteenth or thirty-second of a bar. */
      stutter?: 0 | 8 | 16 | 32;
    }
  | {
      kind: "convolver";
      /** The impulse response: a sample's key in a loaded pack (`"pack/sample"`). */
      ir: string;
      mix?: number;
      gain?: number;
    };

/** One bus: where it sums, how loud, what it runs through, where else it goes. */
export interface BusDef<B extends string = string> {
  /** The bus it sums into (default the master). */
  out?: B;
  /**
   * A bus whose player volume (`setBusVolume`) this one takes too, on top of its own: a bus kept apart from the
   * music's (so it is not ducked with it, say) that the player's music volume should still turn down.
   */
  volume?: B;
  /** dB (default 0). */
  level?: number;
  /** Its effects, in order, before its fader; at most eight. */
  fx?: readonly FxDef<B>[];
  /** Send levels to other buses, 0..1, after its fader. */
  sends?: Readonly<Partial<Record<B, number>>>;
}

/** What a scene says of one bus. Anything left out stays as the mix under the scene has it. */
export interface SceneBus<B extends string = string> {
  /** dB. */
  level?: number;
  sends?: Readonly<Partial<Record<B, number>>>;
  /**
   * Effect settings by effect (its `id`, or its place in the declared chain), then by the setting's name in its
   * `FxDef`; `on` (0 or 1) bypasses it.
   */
  fx?: Readonly<Record<number | string, Readonly<Record<string, number>>>>;
}

/** A named mix: bus levels, send levels and effect settings a game fades to. */
export interface SceneDef<B extends string = string> {
  /** What the mix desk calls it (default: its name). */
  label?: string;
  buses?: Readonly<Partial<Record<BusName<B>, SceneBus<B>>>>;
}

/**
 * What a mod route drives: a bus's level (dB), one of its sends (0..1), or a setting of one of its effects (`fx` is
 * the effect's `id`, or its place in the declared chain).
 */
export type ModTarget<B extends string = string> =
  | { bus: BusName<B>; level: true }
  | { bus: B; send: B }
  | { bus: BusName<B>; fx: number | string; param: string };

/** One route of the mod matrix: a source's 0..1 mapped through `curve` onto `range`, slewed, written to `to`. */
export interface ModRoute<B extends string = string> {
  /** The source's name: `sound.mod.source(name).set(value)`. */
  from: string;
  to: ModTarget<B>;
  /** What 0 and 1 map to, in the target's unit. Several routes to one target sum. */
  range: readonly [number, number];
  /** The shape between the ends (default `"lin"`). */
  curve?: "lin" | "exp" | "log" | "s";
  /** How long the target takes to follow (default 30). */
  slewMs?: number;
}

/** What a play's hand does to its voice: dB on the voice, dB on its first send, and how far away it may be. */
export interface Presence {
  db: number;
  sendDb: number;
  /**
   * How much of a placed sound's distance this hand's plays take, 0..1 (default 1). At 0 a play keeps its pan and
   * loses its distance: it is where it happened, and close.
   */
  distance?: number;
}

/** One effect of a bus, live. */
export interface FxHandle {
  /** Moves a setting (its name in the effect's `FxDef`) to `value` over `slewMs` (default 0). */
  set(param: string, value: number, slewMs?: number): void;
}

/** One bus, live. */
export interface BusHandle<B extends string = string> {
  /** An effect of the bus: by its `id`, or by its place in the declared chain (0 is the first in the bus's `fx`). */
  fx(slot: number | string): FxHandle;
  /** Sets the send to another bus, 0..1. */
  send(to: B, level: number, slewMs?: number): void;
  /** Sets the mix's own level for the bus, in dB. */
  level(db: number, slewMs?: number): void;
}

/**
 * Fades to a scene; `push` lays one over the current mix and returns what takes it off again, over the fade it came
 * in with unless told another (`off({ fadeMs })`).
 */
export interface SceneControl {
  (name: string, options?: { fadeMs?: number }): void;
  push(name: string, options?: { fadeMs?: number }): (options?: { fadeMs?: number }) => void;
}

/** The mix: buses, their effects and sends, the player's volumes, and scenes. Safe to call before `unlock()`. */
export interface Mixer<B extends string = DefaultBus> {
  bus(name: BusName<B>): BusHandle<B>;
  /** The player's volume for a bus, 0..1, apart from the mix's own level (a settings slider). */
  setBusVolume(name: BusName<B>, volume: number): void;
  busVolume(name: BusName<B>): number;
  scene: SceneControl;
}

/** The mod matrix: numbers a game feeds in, driving the mix. Safe to call before `unlock()`. */
export interface ModMatrix<B extends string = DefaultBus> {
  /** A source by name; `set` takes 0..1, and many sets in a frame send once. */
  source(name: string): { set(value: number): void };
  /** Adds a route; the returned function removes it. */
  route(route: ModRoute<B>): () => void;
}

/** Where a sound is: `pan` -1..1 across the screen, `distance` 0..1 from its middle, `occlusion` 0..1 behind something. */
export interface Placement {
  pan: number;
  distance: number;
  occlusion: number;
}

/** The space: how a place on the screen becomes what each ear hears. */
export interface Space {
  /** Speakers (a pan law) or headphones (time and level differences between the ears). */
  listener(options: { mode: "speakers" | "headphones" }): void;
  /** Says an element is behind something: plays placed at it are occluded by `occluded` (0..1). */
  place(at: Element, options: { occluded?: number }): void;
  /** Where a point or an element is, read now. */
  resolve(at: NonNullable<PlayOptions["at"]>): Placement;
}

/**
 * A game's sound: its cues played by key, behind one gesture gate and one mute. `B` names the buses the game
 * declared beside the five defaults.
 */
export interface Sound<K extends string, B extends string = never> {
  /**
   * Plays a cue by key and returns its voice (one handle over every voice the play started), or null when there is
   * no voice to hand back: nothing started (muted, before `unlock()`, while the context is not running, a `loop`
   * cue on the fallback path), or it played on the fallback path (`mode()` is "fallback"), which sounds but keeps
   * no voice to stop. Null is not proof of silence.
   */
  play(key: K, options?: PlayOptions<DefaultBus | B>): VoiceHandle | null;
  /** Starts the engine and resumes its AudioContext. Call from inside a user gesture; safe to call repeatedly. */
  unlock(): Promise<void>;
  /**
   * Wires `unlock()` to every gesture on `target` (the window by default) until the returned cleanup runs. A gesture
   * while the AudioContext runs costs one state read; one that does not grant activation (a touch's pointerdown,
   * Escape) leaves it to the next; a context the OS suspends or interrupts resumes on the next gesture.
   */
  armUnlock(target?: EventTarget): () => void;
  setMuted(value: boolean): void;
  isMuted(): boolean;
  /** Sets the master volume, now and for an engine not yet unlocked. */
  setVolume(value: number): void;
  /** True once `unlock()` has loaded the engine. */
  audioUnlocked(): boolean;
  /**
   * What is playing the cues: `"locked"` before `unlock()`, `"core"` once the DSP core runs in its worklet,
   * `"fallback"` where it cannot (no AudioWorklet, no WebAssembly, or the boot failed): zzfx voices and 0.6 clips
   * through plain Web Audio.
   */
  mode(): "locked" | "core" | "fallback";
  /** The AudioContext everything plays through, or null before `unlock()`. */
  context(): AudioContext | null;
  /** Fetches, decodes and uploads a pack's samples. Resolves when its takes can play; safe to call again. */
  loadPack(name: string): Promise<void>;
  /** Frees a pack's samples. Its cues play their zzfx voices again. */
  unloadPack(name: string): void;
  /** True once every sample of the pack can play. */
  packReady(name: string): boolean;
  /**
   * Fetches and decodes every 0.6 clip not yet decoded. A clip that fails stays out (its cues use their zzfx
   * voices) and is tried again on the next call. Needs `unlock()` first.
   * @deprecated The 0.6 clip registry is still read; a new game ships packs and loads them with `loadPack`.
   */
  loadSamples(): Promise<void>;
  /** Whether a cue plays a recording or its zzfx voices right now, and for how many seconds. */
  soundInfo(key: K): { source: "sample" | "zzfx"; seconds: number };
  /** The node everything leaves through, or null while the core is not running. For a development capture. */
  output(): AudioNode | null;
  /** The mix: buses, effects, sends, scenes. */
  mixer: Mixer<DefaultBus | B>;
  /** The mod matrix: a game's numbers driving the mix. */
  mod: ModMatrix<DefaultBus | B>;
  /** Where a sound is on the screen, and how it is heard. */
  space: Space;
  /** The musical clock: tempo, bars, and the grid a play can wait for. */
  transport: Transport;
  /** The key, the scale and the chord every pitched cue is transposed onto. */
  harmony: Harmony;
  /** A score: stems that follow the transport, sections that change on the bar. Loads its pack and starts the clock. */
  music<S extends string>(def: MusicDef<S, DefaultBus | B>): Music<S>;
  /** A step pattern on the grid that plays a cue. */
  sequence(def: SequenceDef<K>): Sequence;
  /** A grain cloud over a sample (`"pack/sample"`): its playhead a number the game drives. */
  grain(sample: string, def?: GrainDef<DefaultBus | B>): Grain;
  /** Moves the freeze on a bus that declares one (`{ kind: "freeze" }`): 0 lets the bus through, 1 holds it. */
  freeze(bus: BusName<DefaultBus | B>, amount: number, slewMs?: number): void;
  /** A voice that speaks a line of text as syllables of shaped buzz. */
  babble(def?: BabbleDef<DefaultBus | B>): Babble;
  /** A modelled source with no recording behind it, driven by numbers. */
  gen(kind: GenKind, def?: GenDef<DefaultBus | B>): Gen;
  /** What the master sounds like now, as numbers to draw with. */
  tap: Tap;
  /** The mix desk: every level, send and setting of the mix, moved live and saved as a `MixFile` (`desk.ts`). */
  desk: Desk;
}

/** The scales the harmony clock knows. */
export type Scale = "major" | "minor" | "dorian" | "mixolydian" | "pentatonic" | "minorPentatonic";

/** The musical clock. Safe to call before `unlock()`. */
export interface Transport {
  /** `swing` is 0..1, on the off 16ths. A tempo change keeps the beat's phase. */
  set(options: { bpm?: number; beatsPerBar?: number; swing?: number }): void;
  start(): void;
  stop(): void;
  /** Whether the clock is running: started and not stopped (it may be asked before the sound is unlocked). */
  running(): boolean;
  /** The tempo, the bar and the swing as they are set now. */
  tempo(): { bpm: number; beatsPerBar: number; swing: number };
  /** Where it is now: the bar and the beat (from 0) and how far through the beat (0..1). */
  position(): { bar: number; beat: number; phase: number };
  /** Calls `fn` on every beat; the returned function stops it. */
  onBeat(fn: (beat: { bar: number; beat: number }) => void): () => void;
}

/** The harmony clock. */
export interface Harmony {
  /** Sets the key (`"C"` to `"B"`, with `m` for minor), the scale and the chord (scale degrees); `when` waits for a grid line. */
  set(options: { key: string; scale?: Scale; chord?: readonly number[] }, when?: Grid): void;
  /** The ratio that moves a recording rooted at `rootHz` to a degree of the key's scale, in the octave nearest it. */
  rateFor(rootHz: number, degree: number): number;
  current(): { key: string; scale: Scale; chord: readonly number[] };
}

/** One section of a score: how loud each stem is, and optionally the harmony it sets. */
export interface MusicSection {
  /** Stem levels, 0..1; a stem left out is silent. */
  stems: Readonly<Record<string, number>>;
  harmony?: { key: string; scale?: Scale; chord?: readonly number[] };
}

/** A score: stems from one pack, cut to one tempo, arranged into sections. */
export interface MusicDef<S extends string = string, B extends string = string> {
  /** The pack that holds the stems; loaded on first use. */
  pack: string;
  /** The stems: samples of the pack, each a loop a whole number of bars long. */
  stems: readonly string[];
  /**
   * A stem's other takes: samples of the pack that can play in its place, one at a time (`take`). A take the pack
   * does not hold is left out.
   */
  takes?: Readonly<Record<string, readonly string[]>>;
  /** Loops no section moves: each plays at the level `layer` gives it. One the pack does not hold is silent. */
  layers?: readonly string[];
  /** The tempo the stems are cut to (default: the pack's). */
  tempo?: number;
  beatsPerBar?: number;
  /** The key the score starts in (default: the pack's). */
  key?: string;
  scale?: Scale;
  /** The bus the stems play on (default `"music"`). */
  bus?: B;
  sections: Readonly<Record<S, MusicSection>>;
  /** The riser `tension` drives: where it plays and how loud it gets, in dB. */
  riser?: { bus?: B; level?: number };
}

/** A score, live. Changes land on the bar unless `when` says otherwise. */
export interface Music<S extends string = string> {
  section(name: S, options?: { when?: Grid; fadeBeats?: number }): void;
  /** Moves one stem's level over the section's own, or a layer's, which stays until it is moved again. */
  layer(stem: string, level: number, options?: { fadeBeats?: number }): void;
  /**
   * Which take a stem plays from the next bar line: 0 is the stem's own sample, 1 up its `takes` in order. The
   * stem keeps its level; the two cross over a quarter of a beat.
   */
  take(stem: string, index: number, options?: { when?: Grid; fadeBeats?: number }): void;
  /** Plays a cue on the grid, in key. */
  stinger(key: string, options?: { when?: Grid }): void;
  /** 0..1: a riser that builds with it and lets go at 0 or at the next section. */
  tension(value: number): void;
  stop(options?: { when?: Grid }): void;
}

/** A sequence: a cue, a grid and a pattern. */
export interface SequenceDef<K extends string = string> {
  cue: K;
  /** The grid a step is (default `"16"`). */
  grid?: Grid;
  /** The pattern: a string of `0` and `1`, or a velocity per step (0 is a rest). At most 64 steps. */
  steps: string | readonly number[];
  /** dB on every step. */
  level?: number;
  /** A scale degree per step, on the harmony clock. */
  degrees?: readonly number[];
}

/** A sequence, live. */
export interface Sequence {
  /** Replaces the pattern, from the next bar. */
  steps(pattern: string | readonly number[]): void;
  set(options: { cue?: string; grid?: Grid; level?: number; degrees?: readonly number[] }): void;
  /** Calls `fn` with each step's index as it sounds; the returned function stops it. */
  onStep(fn: (index: number) => void): () => void;
  stop(): void;
}

/** What a grain cloud can have moved. */
export interface GrainSettings {
  /** 0..1: where in the sample the grains start. */
  position?: number;
  /** The playhead's own speed when nothing scrubs it: 1 is real time, 0 holds. */
  rate?: number;
  /** A grain's length, in milliseconds (10 to 500). */
  size?: number;
  /** Grains a second. */
  density?: number;
  /** 0..1: how far a grain may start from the playhead. */
  spray?: number;
  /** A ratio, apart from `rate`: slower without lower. */
  pitch?: number;
  /** 0..1: how wide the grains are thrown across the stereo field. */
  spread?: number;
  /** 0..1. */
  level?: number;
}

/** A grain cloud's definition: where it plays and how it starts. */
export interface GrainDef<B extends string = string> extends GrainSettings {
  /** What the mix desk calls it (`grain:<name>`); without one it is named for its sample. */
  name?: string;
  bus?: B;
  pan?: number;
  /** Send levels by bus name, at most two. */
  sends?: Readonly<Partial<Record<B, number>>>;
}

/** A grain cloud, live. */
export interface Grain {
  set(settings: GrainSettings, slewMs?: number): void;
  stop(releaseMs?: number): void;
}

/** The modelled sources. */
export type GenKind = "motor" | "noise" | "modal";

/** A generator's definition. Its settings are by name, per kind (`GEN_PARAMS` in `protocol.ts`). */
export interface GenDef<B extends string = string> {
  /** What the mix desk calls it (`gen:<name>`); without one it is named for its kind and the order it was made in. */
  name?: string;
  bus?: B;
  /** dB. */
  level?: number;
  pan?: number;
  sends?: Readonly<Partial<Record<B, number>>>;
  /** The settings it starts with. */
  params?: Readonly<Record<string, number>>;
  /** A modal bank's resonators, at most 12: frequency in Hz, decay in seconds, gain. */
  modes?: readonly { freq: number; decay: number; gain: number }[];
}

/** A generator, live. `set({ strike: 1 })` strikes a modal bank. */
export interface Gen {
  set(settings: Readonly<Record<string, number>>, slewMs?: number): void;
  stop(releaseMs?: number): void;
}

/** A babble voice's definition. */
export interface BabbleDef<B extends string = string> {
  /** What the mix desk calls it (`voice:<name>`); without one it is named for the order it was made in. */
  name?: string;
  /** The bus it speaks on (default `"voice"`). */
  bus?: B;
  /** A looped sample (`"pack/sample"`) to shape, in place of the built-in buzz. */
  carrier?: string;
  /** dB. */
  level?: number;
  /** Syllables a second (default 9). */
  rate?: number;
  /** A ratio on the voice's pitch (default 1). */
  pitch?: number;
}

/** A babble voice. */
export interface Babble {
  /**
   * Speaks a line. `onChar` is called with the index of each syllable's first character as it starts, so the page
   * can print along. Returns how long the line takes and what cuts it short.
   */
  say(
    text: string,
    options?: {
      rate?: number;
      pitch?: number;
      /** dB on this line alone, over the voice's own level: one voice speaks loud and soft. */
      db?: number;
      at?: PlayOptions["at"];
      onChar?: (index: number) => void;
    },
  ): { seconds: number; stop(): void };
}

/** The tap: the master now, each figure 0..1. */
export interface Tap {
  /** `level`, `bass` (under 150 Hz), `mid` and `high` (over 4 kHz) over a 30 dB range; `flux` jumps on a transient and decays in 120 ms. */
  read(): { level: number; bass: number; mid: number; high: number; flux: number };
}
