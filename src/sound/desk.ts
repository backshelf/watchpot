/**
 * The mix desk: everything about a sound's mix that a person sets by ear, as one live surface and one file.
 *
 * A game's code declares a mix (buses, effects, scenes, cue levels, its own constants). The desk lets someone listening
 * to the running game move any of it, hear the change at once, and save what they moved as a `MixFile`. The game
 * hands that file back to `createSound({ mix })`, in development and in production, so the file is the mix: nothing
 * is copied into code by hand. A window onto the desk (`watchpot/react`'s `SoundDesk`) is a development tool; the
 * desk itself and the file's effect are always there.
 *
 * What it reaches:
 * - **Buses**: a trim in dB on top of whatever the mix and its scenes say, and mute and solo.
 * - **The mix and its scenes**: every bus level, send and effect setting, in the mix itself (`"mix"`) or in one named
 *   scene (`"scene:<name>"`), by the same target keys the mixer uses (`level:<bus>`, `send:<bus>><to>`,
 *   `fx:<bus>:<slot>:<param>`).
 * - **Channels**: every source that has sounded, each with a trim, mute and solo: a cue (`cue:<key>`: its plays, its
 *   roll, a sequence of it, a stinger), a music stem (`stem:<pack>/<stem>`), a generator (`gen:<name>`), a grain cloud
 *   (`grain:<name>`) and a babble voice (`voice:<name>`). A trim moves what is already sounding as well as what
 *   starts next.
 * - **Tunables**: a game's own numbers (`tunable`), each a named value with a range.
 *
 * Mute and solo are for listening and are never saved.
 */
import { DESK_FX, deskParam } from "./desk-fx";
import type { MixerDesk } from "./mixer";
import type { CorePort } from "./port";
import type { SoundEvent } from "./protocol";
import type { FxDef, PackSample, Take } from "./types";

/**
 * What a person saved from the desk. Every part is optional and holds only what was moved.
 *
 * `layers` holds every number, by layer (`"mix"`, or `"scene:<name>"`) and key:
 * - `level:<bus>` (dB), `send:<bus>><to>` (0 and up), `fx:<bus>:<id>:<param>` (the effect's own unit; a filter's
 *   mode 0..3, a switch 0 or 1) and `fx:<bus>:<id>:on` (0 or 1): the mixer's targets;
 * - `trim:<bus>` (dB on a bus's gain, beside the mix), `ch:<channel>` (a source's trim, dB),
 *   `chsend:<channel>><bus>` (a source's own send, 0 and up), `tune:<id>` (a game's tunable).
 *
 * A scene says only what it changes; what a number is worth is the topmost pushed scene that says it, else the
 * current scene, else `"mix"`, else what the code declares.
 */
export interface MixFile {
  version: 2;
  layers?: Record<string, Record<string, number>>;
  /** The structure, where it differs from the declared one: the same in every scene. */
  graph?: MixGraph;
  /** A cue's takes, replacing the ones its code declares. */
  cues?: Record<string, { takes: Take[] }>;
}

/** The structure a desk changed. */
export interface MixGraph {
  buses?: Record<string, GraphBus>;
  /** The bus a source plays on, by channel id (`cue:<key>`, `cue:<key>@<role>`, `stem:<pack>/<stem>`, ...). */
  routes?: Record<string, string>;
}

/** What a desk changed of one bus's structure. */
export interface GraphBus {
  /** True for a bus the desk made: the code declares none of that name. */
  made?: true;
  /** The bus it sums into, when not the declared one (`"master"` for the master). */
  out?: string;
  /** The bus whose player volume it takes too, when not the declared one (`null`: none). */
  volume?: string | null;
  /**
   * Its chain in order, by effect id. An entry with a `kind` is an effect the desk added; one without names a
   * declared effect. `key` overrides a compressor's key bus (`null`: none); `ir` is a convolver's response.
   */
  fx?: GraphFx[];
  /** Declared effects taken out, by id. */
  drop?: string[];
}

export interface GraphFx {
  id: string;
  kind?: FxDef["kind"];
  key?: string | null;
  ir?: string;
}

/** The first desk's file: still read. Its `trims`, `channels` and `tunables` are `trim:`, `ch:` and `tune:` of `"mix"`. */
export interface MixFileV1 {
  version: 1;
  trims?: Record<string, number>;
  layers?: Record<string, Record<string, number>>;
  channels?: Record<string, number>;
  tunables?: Record<string, number>;
}

/**
 * A source of sound the desk has a strip for. A cue played on more than one bus (a play names its `bus`) has a
 * child strip per bus asked for, its **role**: `cue:<key>@<role>`. What is written on the cue reaches every role;
 * what is written on a role reaches it alone.
 */
export interface DeskChannel {
  /** `cue:<key>`, `cue:<key>@<role>`, `stem:<pack>/<stem>`, `gen:<name>`, `grain:<name>` or `voice:<name>`. */
  id: string;
  kind: "cue" | "stem" | "gen" | "grain" | "voice";
  /** The part after the kind: the cue's key (with `@<role>` for a role), the stem's `pack/stem`, the given name. */
  name: string;
  /** A role's cue: the channel id it is a child of. */
  parent?: string;
  /** A role's name: the bus its plays asked for. */
  role?: string;
  /** The bus it last sounded on (after any route). */
  bus: string;
  /** The bus the desk routes it to, when it does (a role's own, not its cue's). */
  route?: string;
  /** The buses it sends into on its own, each with the level in force. */
  sends: readonly { to: string; level: number }[];
  /** The samples it plays, by key (`"pack/sample"`): a cue's takes in force, a stem's loop. Empty for the rest. */
  samples: readonly string[];
  /** Its trim in dB in force (0 when nothing says one): a role's own, not its cue's. */
  trim: number;
  muted: boolean;
  soloed: boolean;
  /** True while something of it sounds (a loop, a generator); a one-shot counts for as long as it rings. */
  sounding: boolean;
  /** When it last started, in the sound's own seconds (`context.currentTime`); for a light. */
  lastAt: number;
}

/** One setting of an effect, with what a control needs to draw it. */
export interface DeskParam {
  /** The setting's name in `FxDef` (`cutoff`, `threshold`, ...). */
  param: string;
  min: number;
  max: number;
  /** What the effect starts at when the mix says nothing. */
  initial: number;
  unit: "Hz" | "s" | "dB" | "ratio" | "" | "bpm" | "beats" | "bits";
  /** `log` for frequencies and times; `choice` for a switch or a mode (then `choices` names each value from 0). */
  scale: "lin" | "log" | "choice";
  choices?: readonly string[];
}

export interface DeskFx {
  /** Its place in the chain now, from 0. */
  slot: number;
  /** Its name on its bus: what a key (`fx:<bus>:<id>:<param>`) and the graph call it. */
  id: string;
  /** The `FxDef` kind: `filter`, `compressor`, `reverb`, ... */
  kind: FxDef["kind"];
  /** True for an effect the code declares; false for one the desk added. */
  declared: boolean;
  /** For a compressor that listens to another bus. */
  key?: string;
  /** For a convolver: its impulse response's sample key. */
  ir?: string;
  /** Its settings but `on`, which every effect has (`fx:<bus>:<id>:on`, 1 unless a layer says 0). */
  params: readonly DeskParam[];
}

export interface DeskBus {
  /** `"master"` or a bus's name. */
  name: string;
  /** True for a bus the desk made. */
  made: boolean;
  /** The bus it sums into (`"master"` for one that sums straight into the master; `null` for the master). */
  out: string | null;
  /** The buses it can send to (every bus but itself and the master; a send into a loop is refused by the core). */
  sends: readonly string[];
  /** The bus whose player volume (`setBusVolume`) it takes on top of its own, or null. */
  volume: string | null;
  fx: readonly DeskFx[];
  /** Its declared effects that were taken out of the chain: `fxRestore` brings one back. */
  dropped: readonly { id: string; kind: FxDef["kind"] }[];
  trim: number;
  muted: boolean;
  soloed: boolean;
}

/** A bus's meter, linear: 1 is full scale. */
export interface DeskMeter {
  peak: number;
  rms: number;
  /** The most gain reduction of the bus's compressors now, in dB (0 or more). */
  reduction: number;
}

/** A game's own number on the desk. */
export interface TunableSpec {
  /** Where it sits on the desk: a group's name, shown as a heading. */
  group: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** A sentence saying what it does and when a move is heard, for its hover. */
  hint?: string;
  /**
   * Its place in a grid: the tunables of one group that have a cell are drawn as one table, rows by columns (a
   * score's sections by its stems).
   */
  cell?: { row: string; column: string };
}

/** One sample of a loaded pack, as the desk shows it. */
export interface DeskSample {
  /** `"<pack>/<sample>"`. */
  key: string;
  pack: string;
  name: string;
  /** Its manifest entry (the staged one's while `side` is `"b"`). */
  entry: SampleEntry;
  /** The encoded file's URL, for drawing the one in the pack (none for a sample the pack does not have yet). */
  url?: string;
  /** The channels that play it: cues that take it, the stem that loops it. */
  users: readonly string[];
  /** True while a replacement is held beside it. */
  staged: boolean;
  /** Which one plays: the pack's (`"a"`) or the staged one (`"b"`). */
  side: "a" | "b";
}

/** A pack that has loaded. */
export interface DeskPack {
  name: string;
  tempo?: number;
  key?: string;
}

/** A sample's manifest entry without its URL: what the pack pipeline measured. */
export type SampleEntry = Omit<PackSample, "url">;

/** What a person changed of a recording before the pipeline's own trim and loudness match. Seconds. */
export interface SampleEdit {
  /** Where it starts and ends in the source (default: all of it). */
  start?: number;
  end?: number;
  fadeIn?: number;
  fadeOut?: number;
  /** Pitch in semitones; a loop keeps its length. */
  semitones?: number;
  reverse?: boolean;
}

/** One file through the pack pipeline. */
export interface SampleRequest {
  pack: string;
  sample: string;
  kind: PackSample["kind"];
  /** The recording. Left out: the sample's kept source, processed again (a new edit). */
  file?: Blob;
  /** The file's own name, for its extension and its `source`. */
  fileName?: string;
  edit?: SampleEdit;
  /** A loop's tempo in its source, and its length in bars. */
  bpm?: number;
  bars?: number;
  /** The root as Hz or a note name. */
  root?: string | number;
  /** A shot the game plays round: its ends are left as they are. */
  loop?: boolean;
}

/** What `SampleHost.process` resolves: the encoded audio, its manifest entry, and the name to commit it by. */
export interface SampleResult {
  token: string;
  audio: ArrayBuffer;
  entry: SampleEntry;
}

/** What a kept source says of itself (its sidecar). */
export interface SampleSource {
  edit?: SampleEdit;
  bpm?: number;
  bars?: number;
  root?: string | number;
  loop?: boolean;
  source?: string;
}

/**
 * Who runs the pack pipeline for the desk and writes into the packs: a game's dev server
 * (`watchpot/sound/pack`'s `sampleHost`, reached by `watchpot/react`'s `fetchSampleHost`).
 */
export interface SampleHost {
  /** Processes one file. Nothing in the pack changes. */
  process(request: SampleRequest): Promise<SampleResult>;
  /** What the kept source of a sample says, and the source itself for drawing (the pack's file when none is kept). */
  describe(pack: string, sample: string): Promise<SampleSource & { audio: ArrayBuffer }>;
  /** Writes processed samples into their packs (files and manifests) and keeps each source with its sidecar. */
  commit(tokens: readonly string[]): Promise<void>;
  /** Rebuilds a pack's loops at a new tempo and records its key; resolves each loop as `process` would. */
  retune?(
    pack: string,
    to: { tempo?: number; key?: string },
  ): Promise<readonly (SampleResult & { sample: string })[]>;
}

/** A replacement held beside a sample, not yet in its pack. */
export interface DeskStaged {
  key: string;
  token: string;
  entry: SampleEntry;
  /** True for a sample the pack does not have yet (a new take). */
  fresh: boolean;
}

export interface DeskTunable extends TunableSpec {
  id: string;
  /** What the code declares. */
  initial: number;
  value: number;
}

export interface Desk {
  /** Every bus, the master first, then in the order the mixer sums them. */
  buses(): readonly DeskBus[];
  /**
   * The scenes the mix declares, and which are in force: the current one and those pushed over it, bottom first.
   * `labels` holds what a scene is called where its definition says (`SceneDef.label`).
   */
  scenes(): {
    names: readonly string[];
    current: string | null;
    pushed: readonly string[];
    labels: Readonly<Record<string, string>>;
  };
  /**
   * Every channel that has sounded since the sound was made, or that the mix file names, in the order first heard;
   * a cue's roles follow it.
   */
  channels(): readonly DeskChannel[];
  tunables(): readonly DeskTunable[];

  /**
   * A key's value in a layer: `"mix"` or `"scene:<name>"`. `undefined` when that layer says nothing of it.
   * `"live"` reads what is in force now, and `owner` says which layer that came from (`"mix"`, `"scene:<name>"`, or
   * `"route"` when a mod route drives it; `"default"` when nothing says it: the effect's own start, a trim of 0,
   * the tunable as declared). Every key of a `MixFile`'s layers is read and written here.
   */
  get(layer: string, key: string): number | undefined;
  owner(key: string): string;
  /** Writes a key in a layer, heard at once; `undefined` takes the desk's write away (the declared value returns). */
  set(layer: string, key: string, value: number | undefined): void;
  /** Writes every value `from` says (declared or written) into `to`, as desk writes. */
  copyLayer(from: string, to: string): void;

  /** A bus's trim in dB in `"mix"`; 0 takes it away. */
  trim(bus: string, db: number): void;
  /** A channel's trim in dB in `"mix"`; 0 takes it away. */
  channelTrim(id: string, db: number): void;

  // The structure: heard at once, the same in every scene, saved in the file's `graph`. Each answers false (or null)
  // when refused: a name taken, a loop, a full bus, something that does not exist.

  /** Makes a bus that sums into `out` (default the master). */
  addBus(name: string, options?: { out?: string }): boolean;
  /** Removes a bus the desk made, once nothing is routed, sent or keyed to it. */
  removeBus(name: string): boolean;
  /** Points a bus's output at another bus (or `"master"`). */
  setOut(bus: string, out: string): boolean;
  /**
   * Says which bus's player volume a bus takes on top of its own (`null`: none): a bus the desk made, kept apart from
   * the music's, that the player's music volume should still turn down.
   */
  setVolume(bus: string, of: string | null): boolean;
  /** Adds an effect at a place in a bus's chain (default: last) and answers its id. */
  fxAdd(bus: string, kind: FxDef["kind"], at?: number): string | null;
  fxRemove(bus: string, id: string): boolean;
  /** Puts a declared effect that was taken out back in its chain, after its declared predecessor. */
  fxRestore(bus: string, id: string): boolean;
  /** Moves an effect to a place in its chain. */
  fxMove(bus: string, id: string, to: number): boolean;
  /** A compressor's key bus (`null`: its own bus). */
  fxKey(bus: string, id: string, key: string | null): boolean;
  /** A convolver's impulse response, by sample key. */
  fxIr(bus: string, id: string, sample: string): boolean;
  /** The most effects a bus holds, and the most buses beside the master. */
  limits(): { fx: number; buses: number };
  /** Routes a source to a bus whatever its plays ask for; `undefined` takes the route away. */
  route(channel: string, bus: string | undefined): boolean;

  // Samples and takes.

  /** Every pack that has loaded. */
  packs(): readonly DeskPack[];
  /** Every sample of the loaded packs, and every staged one. */
  samples(): readonly DeskSample[];
  /**
   * Holds a processed recording beside the sample `key` (or as a new sample of its pack) and plays it in the
   * original's place: a cue from its next play, a stem from its next bar. Resolves false when it cannot be decoded
   * or the core is not up.
   */
  stage(key: string, audio: ArrayBuffer, entry: SampleEntry, token: string): Promise<boolean>;
  /** Which one plays: the pack's own (`"a"`) or the staged one (`"b"`). */
  ab(key: string, side: "a" | "b"): void;
  /** Drops a staged recording; the pack's own plays again. */
  unstage(key: string): void;
  staged(): readonly DeskStaged[];
  /** Says the staged recordings of `keys` are in their packs now: each becomes the sample. */
  committed(keys: readonly string[]): void;
  /** A cue's takes in force, the ones its code declares, and whether the desk replaced them; null for no such cue. */
  takes(cue: string): { takes: readonly Take[]; declared: readonly Take[]; replaced: boolean } | null;
  /** Replaces a cue's takes (`undefined`: the declared ones again), from its next play. */
  setTakes(cue: string, takes: readonly Take[] | undefined): void;

  // Undo.

  /** Takes the last change back (writes to one key within 600 ms are one change); staged recordings are not in it. */
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Mutes a bus (`bus:<name>`) or a channel (its id). */
  mute(id: string, on: boolean): void;
  /** Solos a bus (`bus:<name>`) or a channel: while any is soloed, only the soloed sound. */
  solo(id: string, on: boolean): void;
  /** Takes every mute and solo off. */
  clearListening(): void;
  /** Plays a cue channel once, as it would sound from the game with no place and no hand. Other kinds do nothing. */
  audition(id: string): void;
  /** Sets a tunable; `undefined` takes the desk's write away. */
  tune(id: string, value: number | undefined): void;

  /** The meters since the last call: every bus by name (`master` after the limiter), and the master's loudness. */
  meters(): { buses: Readonly<Record<string, DeskMeter>>; lufs: number };

  /** What has been moved, as the file a game hands back to `createSound({ mix })`. */
  file(): MixFile;
  /** Replaces what has been moved with `file` (the declared mix where it says nothing), heard at once. */
  load(file: MixFile | MixFileV1): void;
  /** True when `file()` differs from the file the sound was made with or last `saved()`. */
  dirty(): boolean;
  /** Marks the current state as saved. */
  saved(): void;

  /** Called after anything the desk shows has changed (a write, a new channel, a scene). Not for the meters. */
  subscribe(fn: () => void): () => void;
}

// ---- Tunables ---------------------------------------------------------------------------------------------------
// A game's own numbers live in its modules, declared before any sound exists, so their registry is a module's.

interface Tuned extends TunableSpec {
  initial: number;
  value: number | undefined;
  fns: Set<(value: number) => void>;
}

const registry = new Map<string, Tuned>();
/** Values set for ids nothing has declared yet (a mix file read before a module loads). */
const pending = new Map<string, number>();
const watchers = new Set<() => void>();

/**
 * Declares a number of the game's that the desk can move: `const TICK_DB = tunable("stream.ticks", -28, {...})`,
 * read as `TICK_DB()` each time it is used. `onChange` is for a value that has to be pushed somewhere when it moves
 * (a running voice's gain); it is not called for the declared value.
 */
export function tunable(
  id: string,
  initial: number,
  spec: TunableSpec,
  onChange?: (value: number) => void,
): () => number {
  let entry = registry.get(id);
  if (!entry) {
    entry = { ...spec, initial, value: pending.get(id), fns: new Set() };
    pending.delete(id);
    registry.set(id, entry);
    for (const fn of watchers) fn();
  }
  if (onChange) entry.fns.add(onChange);
  const held = entry;
  return () => held.value ?? held.initial;
}

/** Every tunable declared so far. */
export function tunables(): DeskTunable[] {
  return [...registry].map(([id, t]) => ({
    id,
    group: t.group,
    label: t.label,
    min: t.min,
    max: t.max,
    step: t.step,
    unit: t.unit,
    ...(t.hint !== undefined ? { hint: t.hint } : {}),
    ...(t.cell !== undefined ? { cell: t.cell } : {}),
    initial: t.initial,
    value: t.value ?? t.initial,
  }));
}

/** Sets a tunable (`undefined`: back to what the code declares). An id nothing has declared yet is kept for when it is. */
export function tune(id: string, value: number | undefined): void {
  const next = value !== undefined && Number.isFinite(value) ? value : undefined;
  const entry = registry.get(id);
  if (!entry) {
    if (next === undefined) pending.delete(id);
    else pending.set(id, next);
    return;
  }
  if (entry.value === next) return;
  entry.value = next;
  for (const fn of entry.fns) fn(next ?? entry.initial);
  for (const fn of watchers) fn();
}

/** Hears every change to the tunables (a new one, a value). */
export function watchTunables(fn: () => void): () => void {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

// ---- The real desk ----------------------------------------------------------------------------------------------

/** A source's hold on its channel strip: what it multiplies into its gain, where it goes, and what it tells the desk. */
export interface DeskLink {
  readonly id: string;
  /** The strip's gain now, linear: its trim (and its cue's, for a role), times 0 while muted or soloed out. */
  gain(): number;
  /** The bus the desk routes it to, or undefined: it plays where it asks. */
  route(): string | undefined;
  /**
   * Its own sends in force, at most two: the declared ones at the desk's levels, then any the desk added. Told the
   * declared ones (a cue's `sends`), it remembers them for the desk to show.
   */
  sends(declared?: Readonly<Record<string, number>>): readonly { to: string; level: number }[];
  /**
   * It started sounding, on `bus` (a bus's name as the code gave it; left out: where it last sounded), sending on its
   * own into `sends` (what a solo of it keeps audible).
   */
  started(bus?: string, sends?: readonly string[]): void;
  /** A one-shot voice of it, sounding until the core's `VOICE_ENDED`. */
  voice(id: number): void;
  /** A loop, a generator or a line is running (`true`) or has stopped (`false`). */
  hold(on: boolean): void;
  /** Hears the strip's gain change; the returned function stops it. */
  watch(fn: () => void): () => void;
  /** Hears the strip's route change; the returned function stops it. */
  rerouted(fn: () => void): () => void;
}

/** A link to nothing: what a module uses when its host has no desk. */
export const NO_LINK: DeskLink = {
  id: "",
  gain: () => 1,
  route: () => undefined,
  sends: (declared = {}) =>
    Object.entries(declared)
      .slice(0, 2)
      .map(([to, level]) => ({ to, level })),
  started() {},
  voice() {},
  hold() {},
  watch: () => () => {},
  rerouted: () => () => {},
};

/** The sound's cues and samples as the desk needs them: its takes and what it stages. */
export interface DeskSource {
  /** Every cue's key. */
  cues(): readonly string[];
  /** A cue's declared takes; null for no such cue. */
  takes(key: string): readonly Take[] | null;
  /** A cue's takes changed on the desk: its next play picks among the new ones. */
  retake(key: string): void;
  /** Every pack that has loaded. */
  packs(): readonly DeskPack[];
  /** Every sample of the loaded packs. */
  samples(): readonly { key: string; entry: SampleEntry; url?: string }[];
  /** Decodes a recording and holds it beside `key`, playing in its place. False when it cannot. */
  stage(key: string, audio: ArrayBuffer, entry: SampleEntry): Promise<boolean>;
  /** Which one plays: the pack's (`"a"`) or the staged one (`"b"`). */
  side(key: string, side: "a" | "b"): void;
  /** Drops the staged recording. */
  unstage(key: string): void;
  /** The staged recording is the sample now. */
  keep(key: string): void;
}

/** What `createDesk` needs from the sound. */
export interface DeskDeps {
  mixer: MixerDesk;
  port: CorePort;
  /** Plays a cue by key with no options, on the bus named when one is. */
  audition(key: string, bus?: string): void;
  /** The sound's cues and samples; a desk without them shows no takes and stages nothing. */
  source?: DeskSource;
}

/** The desk as `engine.ts` holds it: the game's face, and the strips its sources sound through. */
export interface DeskCore {
  desk: Desk;
  channel(kind: DeskChannel["kind"], name: string): DeskLink;
  /** A cue's strip for one bus its plays ask for (`cue:<key>@<asked>`). */
  role(key: string, asked: string): DeskLink;
  /** A cue's takes as the desk replaced them, or undefined: the declared ones. */
  takes(key: string): readonly Take[] | undefined;
}

/** A file of either version as the second desk's: the first's parts as keys of `"mix"`. */
function toV2(file: MixFile | MixFileV1): MixFile {
  if (file.version === 2) return file;
  if (file.version !== 1) {
    console.warn(
      `watchpot/sound: a mix file of version ${String((file as { version?: unknown }).version)}; this desk reads versions 1 and 2`,
    );
    return { version: 2 };
  }
  const layers: Record<string, Record<string, number>> = {};
  for (const [layer, values] of Object.entries(file.layers ?? {})) layers[layer] = { ...values };
  const mix: Record<string, number> = { ...layers.mix };
  for (const [bus, db] of Object.entries(file.trims ?? {})) mix[`trim:${bus}`] = db;
  for (const [id, db] of Object.entries(file.channels ?? {})) mix[`ch:${id}`] = db;
  for (const [id, value] of Object.entries(file.tunables ?? {})) mix[`tune:${id}`] = value;
  if (Object.keys(mix).length) layers.mix = mix;
  return { version: 2, layers };
}

/** How quickly a desk write, a trim, a mute or a solo is heard, in milliseconds. */
export const DESK_SLEW_MS = 30;
/** What a trim is held to, in dB. */
const TRIM_MIN = -80;
const TRIM_MAX = 24;
/** Seconds after the last `METERS` event that the meters are still believed. */
const METER_STALE = 0.25;
/** Seconds within which writes of one kind to one key are one step of undo, and how many steps are kept. */
const UNDO_JOIN = 0.6;
const UNDO_DEPTH = 200;
const KINDS: readonly DeskChannel["kind"][] = ["cue", "stem", "gen", "grain", "voice"];
const MASTER = "master";
const MIX = "mix";

const dbToGain = (db: number): number => 10 ** (db / 20);
const clampTrim = (db: number): number => Math.min(TRIM_MAX, Math.max(TRIM_MIN, db));

/** A key of a layer that is the desk's own, not a mixer target. */
type Own =
  | { type: "trim"; bus: string }
  | { type: "ch"; id: string }
  | { type: "chsend"; id: string; to: string }
  | { type: "tune"; id: string };

function ownKey(key: string): Own | null {
  if (key.startsWith("trim:")) return { type: "trim", bus: key.slice(5) };
  if (key.startsWith("chsend:")) {
    const rest = key.slice(7);
    const at = rest.lastIndexOf(">");
    return at <= 0 ? null : { type: "chsend", id: rest.slice(0, at), to: rest.slice(at + 1) };
  }
  if (key.startsWith("ch:")) return { type: "ch", id: key.slice(3) };
  if (key.startsWith("tune:")) return { type: "tune", id: key.slice(5) };
  return null;
}

interface Strip {
  id: string;
  kind: DeskChannel["kind"];
  name: string;
  /** A role's cue, and a cue's roles. */
  parent: Strip | null;
  role: string | undefined;
  children: Strip[];
  bus: string;
  /** The buses it sends into on its own (a cue's `sends`), not through its bus: what a solo keeps audible. */
  sends: string[];
  /** The sends its code declares, as last told. */
  declared: Record<string, number>;
  muted: boolean;
  soloed: boolean;
  /** In `channels()`: it has sounded, or the file names it. */
  listed: boolean;
  voices: Set<number>;
  holds: number;
  lastAt: number;
  /** The gain its sources were last told. */
  gain: number;
  fns: Set<() => void>;
  routeFns: Set<() => void>;
  link: DeskLink | null;
}

const sorted = <T>(entries: Iterable<[string, T]>): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const [key, value] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) out[key] = value;
  return out;
};

/** Builds the desk over a sound's mixer. */
export function createDesk({ mixer, port, audition, source }: DeskDeps): DeskCore {
  const strips = new Map<string, Strip>();
  const listed: Strip[] = [];
  const voiceOwner = new Map<number, Strip>();
  const busMuted = new Set<string>();
  const busSoloed = new Set<string>();
  /** The listening gain each bus was last given (absent: 1). */
  const busListen = new Map<string, number>();
  /**
   * Every desk write by layer and key: the mixer's targets (as it canonises them), the desk's own keys, and those a
   * loaded file names that the mix no longer has.
   */
  const layers = new Map<string, Map<string, number>>();
  /** The bus each source is routed to, by channel id. */
  const routes = new Map<string, string>();
  /** The takes that replace a cue's declared ones, by cue key. */
  const takesOver = new Map<string, Take[]>();
  /** Recordings held beside a sample, by sample key. */
  const stagedBy = new Map<string, DeskStaged & { side: "a" | "b" }>();
  /** Bus trims and tunables the desk has applied, so one a layer stops saying is taken back. */
  const trimmed = new Set<string>();
  const tuned = new Set<string>();
  let baseline = "";

  // Change, and the caches that hand a window the same array until something changes.

  const subscribers = new Set<() => void>();
  let queued = false;
  let cache: {
    buses?: readonly DeskBus[];
    scenes?: ReturnType<Desk["scenes"]>;
    channels?: readonly DeskChannel[];
    tunables?: readonly DeskTunable[];
    samples?: readonly DeskSample[];
  } = {};
  function notify(): void {
    cache = {};
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      for (const fn of [...subscribers]) fn();
    });
  }
  watchTunables(notify);

  const allBuses = (): string[] => [MASTER, ...mixer.names()];
  const sceneLayer = (layer: string): boolean =>
    layer.startsWith("scene:") && mixer.scenes().names.includes(layer.slice(6));

  /** The layers in force, topmost first: each pushed scene, the current one, the mix. Kept until a scene moves. */
  let inForce: string[] | null = null;
  function stack(): string[] {
    if (!inForce) {
      const { current, pushed } = mixer.scenes();
      inForce = [...pushed].reverse().map((name) => `scene:${name}`);
      if (current !== null) inForce.push(`scene:${current}`);
      inForce.push(MIX);
    }
    return inForce;
  }
  /** What the layers in force say of one of the desk's own keys, and which says it. */
  function said(key: string): { value: number; layer: string } | undefined {
    for (const layer of stack()) {
      const value = layers.get(layer)?.get(key);
      if (value !== undefined) return { value, layer };
    }
    return undefined;
  }

  // Listening: mute and solo.

  const pathOpen = (bus: string): boolean => {
    for (let at: string | null = bus, hops = 0; at !== null && hops < 32; at = mixer.outOf(at), hops++)
      if ((busListen.get(at) ?? 1) === 0) return false;
    return true;
  };
  const isSoloed = (strip: Strip): boolean => strip.soloed || strip.parent?.soloed === true;
  const anyChannelSolo = (): boolean => {
    for (const strip of strips.values()) if (strip.soloed) return true;
    return false;
  };
  const trimOf = (strip: Strip): number => said(`ch:${strip.id}`)?.value ?? 0;
  const gainOf = (strip: Strip, channelSolo: boolean): number => {
    if (strip.muted || strip.parent?.muted || (channelSolo && !isSoloed(strip))) return 0;
    if (strip.bus !== "" && !pathOpen(strip.bus)) return 0;
    const db = clampTrim(trimOf(strip) + (strip.parent ? trimOf(strip.parent) : 0));
    return db === 0 ? 1 : dbToGain(db);
  };
  /** Tells each strip's sources its gain when it has changed. */
  function regain(): void {
    const channelSolo = anyChannelSolo();
    for (const strip of strips.values()) {
      const gain = gainOf(strip, channelSolo);
      if (gain === strip.gain) continue;
      strip.gain = gain;
      for (const fn of [...strip.fns]) fn();
    }
  }
  /** Works out every bus's listening gain from the mutes and solos, then every strip's. */
  function relisten(): void {
    const soloing = busSoloed.size > 0 || anyChannelSolo();
    let audible: Set<string> | null = null;
    if (soloing) {
      // A soloed bus, and a soloed channel's bus and the returns its own sends reach, sound with everything carrying
      // them to the master and every return they send into (and that return's own way out).
      audible = new Set([MASTER]);
      const todo = [...busSoloed];
      for (const strip of strips.values())
        if (isSoloed(strip)) {
          if (strip.bus !== "") todo.push(strip.bus);
          todo.push(...strip.sends);
        }
      while (todo.length) {
        const bus = todo.pop() as string;
        if (audible.has(bus) && bus !== MASTER) continue;
        audible.add(bus);
        const out = mixer.outOf(bus);
        if (out !== null && !audible.has(out)) todo.push(out);
        for (const to of mixer.sendsOf(bus)) if (!audible.has(to)) todo.push(to);
      }
    }
    for (const bus of allBuses()) {
      const gain = busMuted.has(bus) || (audible !== null && !audible.has(bus)) ? 0 : 1;
      if ((busListen.get(bus) ?? 1) === gain) continue;
      if (gain === 1) busListen.delete(bus);
      else busListen.set(bus, gain);
      mixer.listen(bus, gain, DESK_SLEW_MS);
    }
    regain();
  }

  // Strips.

  function stripOf(id: string, kind: DeskChannel["kind"], name: string): Strip {
    let strip = strips.get(id);
    if (!strip) {
      strip = {
        id,
        kind,
        name,
        parent: null,
        role: undefined,
        children: [],
        bus: "",
        sends: [],
        declared: {},
        muted: false,
        soloed: false,
        listed: false,
        voices: new Set(),
        holds: 0,
        lastAt: 0,
        gain: 1,
        fns: new Set(),
        routeFns: new Set(),
        link: null,
      };
      strips.set(id, strip);
      // A cue's role: the child of its cue's strip.
      const at = kind === "cue" ? name.lastIndexOf("@") : -1;
      if (at > 0) {
        const parent = stripOf(`cue:${name.slice(0, at)}`, "cue", name.slice(0, at));
        strip.parent = parent;
        strip.role = name.slice(at + 1);
        parent.children.push(strip);
      }
      strip.gain = gainOf(strip, anyChannelSolo());
    }
    return strip;
  }
  const list = (strip: Strip) => {
    if (strip.parent) list(strip.parent);
    if (strip.listed) return;
    strip.listed = true;
    listed.push(strip);
  };
  const sounding = (strip: Strip) => strip.voices.size > 0 || strip.holds > 0;
  const routeOf = (strip: Strip): string | undefined => {
    const to = routes.get(strip.id) ?? (strip.parent ? routes.get(strip.parent.id) : undefined);
    return to !== undefined && mixer.isBus(to) ? to : undefined;
  };

  /** A strip's own sends in force: its declared ones at the desk's levels, then any the desk added, two at most. */
  function sendsOf(strip: Strip): { to: string; level: number }[] {
    const declared =
      strip.parent && !Object.keys(strip.declared).length ? strip.parent.declared : strip.declared;
    const ids = strip.parent ? [strip.id, strip.parent.id] : [strip.id];
    const levelOf = (to: string): number | undefined => {
      for (const id of ids) {
        const value = said(`chsend:${id}>${to}`)?.value;
        if (value !== undefined) return value;
      }
      return undefined;
    };
    const out: { to: string; level: number }[] = [];
    for (const [to, level] of Object.entries(declared).slice(0, 2))
      out.push({ to, level: Math.max(0, levelOf(to) ?? (Number.isFinite(level) ? level : 0)) });
    // What the desk added: a send the code never declared.
    for (const id of ids)
      for (const to of sendTargets().get(id) ?? []) {
        if (out.length >= 2) return out;
        if (out.some((send) => send.to === to) || !mixer.isBus(to) || to === MASTER) continue;
        const level = levelOf(to) ?? 0;
        if (level > 0) out.push({ to, level });
      }
    return out;
  }
  /** The buses any layer names in a source's own sends, by channel: read at every play, so kept until a write. */
  let sendsSaid: Map<string, Set<string>> | null = null;
  function sendTargets(): Map<string, Set<string>> {
    if (!sendsSaid) {
      sendsSaid = new Map();
      for (const map of layers.values())
        for (const key of map.keys()) {
          const own = ownKey(key);
          if (own?.type !== "chsend") continue;
          const set = sendsSaid.get(own.id);
          if (set) set.add(own.to);
          else sendsSaid.set(own.id, new Set([own.to]));
        }
    }
    return sendsSaid;
  }

  function linkOf(strip: Strip): DeskLink {
    strip.link ??= {
      id: strip.id,
      gain: () => strip.gain,
      route: () => routeOf(strip),
      sends(declared) {
        if (declared) {
          strip.declared = { ...declared };
          if (strip.parent) strip.parent.declared = strip.declared;
        }
        return sendsOf(strip);
      },
      started(bus, sends) {
        strip.lastAt = port.time();
        if (strip.parent) strip.parent.lastAt = strip.lastAt;
        list(strip);
        let moved = false;
        if (bus !== undefined || strip.bus === "") {
          const name = mixer.resolve(bus);
          moved = name !== strip.bus;
          strip.bus = name;
          if (strip.parent) strip.parent.bus = name;
        }
        if (sends) {
          const next = sends.filter((to) => to !== MASTER && mixer.isBus(to));
          if (next.join(">") !== strip.sends.join(">")) {
            strip.sends = next;
            moved ||= isSoloed(strip);
          }
        }
        // A soloed strip moving bus moves what the solo keeps.
        if (moved) {
          if (isSoloed(strip)) relisten();
          else regain();
        }
        notify();
      },
      voice(id) {
        voiceOwner.set(id, strip);
        strip.voices.add(id);
      },
      hold(on) {
        const was = sounding(strip);
        strip.holds = Math.max(0, strip.holds + (on ? 1 : -1));
        if (was !== sounding(strip)) notify();
      },
      watch(fn) {
        strip.fns.add(fn);
        return () => void strip.fns.delete(fn);
      },
      rerouted(fn) {
        strip.routeFns.add(fn);
        return () => void strip.routeFns.delete(fn);
      },
    };
    return strip.link;
  }

  /** A strip by channel id, or null for an id whose kind is not a source's. */
  function stripById(id: string): Strip | null {
    const cut = id.indexOf(":");
    const kind = id.slice(0, cut) as DeskChannel["kind"];
    if (cut < 0 || cut === id.length - 1 || !KINDS.includes(kind)) return null;
    return stripOf(id, kind, id.slice(cut + 1));
  }

  port.listen((event) => {
    if (event.op === "VOICE_ENDED") {
      const strip = voiceOwner.get(event.voice);
      if (!strip) return;
      voiceOwner.delete(event.voice);
      strip.voices.delete(event.voice);
      if (!sounding(strip)) notify();
    } else if (event.op === "METERS") hearMeters(event);
  });

  // Meters.

  const peaks = new Float32Array(16);
  const rmss = new Float32Array(16);
  const reductions = new Float32Array(16);
  let lufs = -200;
  let heardAt = Number.NEGATIVE_INFINITY;
  function hearMeters(event: Extract<SoundEvent, { op: "METERS" }>): void {
    for (let i = 0; i < 16; i++) {
      const peak = event.peak[i] ?? 0;
      if (peak > (peaks[i] ?? 0)) peaks[i] = peak;
      rmss[i] = event.rms[i] ?? 0;
      const reduction = event.reduction?.[i] ?? 0;
      if (reduction > (reductions[i] ?? 0)) reductions[i] = reduction;
    }
    lufs = event.loudness;
    heardAt = port.time();
  }

  // Layers.

  function store(layer: string, key: string, value: number | undefined): void {
    if (key.startsWith("chsend:")) sendsSaid = null;
    let map = layers.get(layer);
    if (value === undefined) {
      map?.delete(key);
      if (map && map.size === 0) layers.delete(layer);
      return;
    }
    if (!map) {
      map = new Map();
      layers.set(layer, map);
    }
    map.set(key, value);
  }

  /** Puts one of the desk's own keys in force as the layers now say it. */
  function applyOwn(key: string, own: Own): void {
    const value = said(key)?.value;
    if (own.type === "trim") {
      if (!mixer.isBus(own.bus)) return;
      if (value === undefined && !trimmed.has(own.bus)) return;
      if (value === undefined) trimmed.delete(own.bus);
      else trimmed.add(own.bus);
      mixer.trim(own.bus, value ?? 0, DESK_SLEW_MS);
    } else if (own.type === "tune") {
      if (value === undefined && !tuned.has(own.id)) return;
      if (value === undefined) tuned.delete(own.id);
      else tuned.add(own.id);
      tune(own.id, value);
    }
    // A channel's trim is read by `regain`, a source's send at its next play.
  }

  /** Every own key any layer says, and every one the desk has in force. */
  function ownKeys(): Set<string> {
    const keys = new Set<string>();
    for (const map of layers.values()) for (const key of map.keys()) if (ownKey(key)) keys.add(key);
    for (const bus of trimmed) keys.add(`trim:${bus}`);
    for (const id of tuned) keys.add(`tune:${id}`);
    return keys;
  }
  /** After the layers in force changed (a scene, a load): every own key as they now say it. */
  function refreshOwn(): void {
    for (const key of ownKeys()) {
      const own = ownKey(key);
      if (own) applyOwn(key, own);
    }
    regain();
  }
  /** True while a file is being laid in: its own keys are put in force once, at the end. */
  let restoring = false;
  mixer.onChange(() => {
    inForce = null;
    if (!restoring) refreshOwn();
    notify();
  });

  /** One write into a layer, of either kind of key. False when the layer or the key is not one. */
  function write(layer: string, key: string, value: number | undefined): boolean {
    if (layer !== MIX && !sceneLayer(layer)) return false;
    const own = ownKey(key);
    if (!own) {
      const canon = mixer.key(key);
      if (canon === null || !mixer.write(layer, canon, value, DESK_SLEW_MS)) return false;
      store(layer, canon, value !== undefined && Number.isFinite(value) ? value : undefined);
      return true;
    }
    let next = value !== undefined && Number.isFinite(value) ? value : undefined;
    if (own.type === "trim") {
      if (!mixer.isBus(own.bus)) return false;
    } else if (own.type === "ch" || own.type === "chsend") {
      const strip = stripById(own.id);
      if (!strip) return false;
      if (own.type === "chsend" && (!mixer.isBus(own.to) || own.to === MASTER)) return false;
      list(strip);
    }
    if (next !== undefined && (own.type === "trim" || own.type === "ch")) {
      next = clampTrim(next);
      // In the mix a trim of 0 is no trim; in a scene it is one that says so over the mix's.
      if (next === 0 && layer === MIX) next = undefined;
    }
    if (next !== undefined && own.type === "chsend") next = Math.max(0, next);
    store(layer, key, next);
    applyOwn(key, own);
    if (own.type === "ch") regain();
    return true;
  }

  /** What an effect starts at, a level's 0 dB, a send's 0: the value in force when nothing says one. */
  function initialOf(key: string): number | undefined {
    if (key.startsWith("level:") || key.startsWith("send:")) return 0;
    const rest = key.slice(3);
    const p = rest.lastIndexOf(":");
    const s = rest.lastIndexOf(":", p - 1);
    const param = rest.slice(p + 1);
    if (param === "on") return 1;
    const id = rest.slice(s + 1, p);
    const unit = mixer.chain(rest.slice(0, s)).find((each) => each.id === id);
    return unit ? deskParam(unit.kind, param)?.initial : undefined;
  }

  /** What one of the desk's own keys is worth when no layer says it. */
  function ownDefault(own: Own): number | undefined {
    if (own.type === "trim" || own.type === "ch") return 0;
    if (own.type === "tune") return tunables().find((each) => each.id === own.id)?.value;
    const strip = strips.get(own.id);
    const declared = strip?.declared[own.to] ?? strip?.parent?.declared[own.to];
    return declared ?? 0;
  }

  // The file.

  function file(): MixFile {
    const out: MixFile = { version: 2 };
    const layerOut: [string, Record<string, number>][] = [];
    for (const [layer, map] of layers) if (map.size) layerOut.push([layer, sorted(map)]);
    if (layerOut.length) out.layers = sorted(layerOut);
    const buses = mixer.graph();
    const graph: MixGraph = {};
    if (Object.keys(buses).length) graph.buses = sorted(Object.entries(buses));
    if (routes.size) graph.routes = sorted(routes);
    if (graph.buses || graph.routes) out.graph = graph;
    if (takesOver.size)
      out.cues = sorted(
        [...takesOver].map(([key, takes]) => [key, { takes: takes.map((take) => ({ ...take })) }]),
      );
    return out;
  }

  /** Replaces what has been moved with a file's, heard at once: only what differs is sent or defined again. */
  function restore(given: MixFile | MixFileV1): void {
    const next = toV2(given);
    restoring = true;
    for (const [layer, map] of layers)
      for (const key of map.keys()) if (!ownKey(key)) mixer.write(layer, key, undefined, DESK_SLEW_MS);
    layers.clear();
    sendsSaid = null;
    // The structure first: a number for an effect or a bus the desk made needs it to exist.
    mixer.loadGraph(next.graph?.buses);

    for (const [layer, values] of Object.entries(next.layers ?? {}))
      for (const [key, value] of Object.entries(values ?? {})) {
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        // A key, a scene or a channel the mix no longer has is kept for the file, and reaches nothing.
        if (!write(layer, key, value)) store(layer, key, value);
      }

    const routed = new Set([...routes.keys(), ...Object.keys(next.graph?.routes ?? {})]);
    const before = new Map(routes);
    routes.clear();
    for (const [id, bus] of Object.entries(next.graph?.routes ?? {}))
      if (typeof bus === "string") routes.set(id, bus);
    for (const id of routed) {
      if (before.get(id) === routes.get(id)) continue;
      const strip = stripById(id);
      if (!strip) continue;
      if (routes.has(id)) list(strip);
      for (const each of [strip, ...strip.children]) for (const fn of [...each.routeFns]) fn();
    }

    const retaken = new Set([...takesOver.keys(), ...Object.keys(next.cues ?? {})]);
    takesOver.clear();
    for (const [key, cue] of Object.entries(next.cues ?? {}))
      if (Array.isArray(cue?.takes))
        takesOver.set(
          key,
          cue.takes.map((take) => ({ ...take })),
        );
    for (const key of retaken) source?.retake(key);

    restoring = false;
    refreshOwn();
    relisten();
    notify();
  }

  // Undo.

  const undone: string[] = [];
  const redone: string[] = [];
  let lastTag = "";
  let lastAt = Number.NEGATIVE_INFINITY;
  /**
   * Runs one change and, when it took, keeps the file as it was before it for `undo`. Changes with the same tag
   * within `UNDO_JOIN` seconds are one step (a slider dragged).
   */
  function change(tag: string, run: () => boolean): boolean {
    const now = port.time();
    const joins = tag !== "" && tag === lastTag && now - lastAt <= UNDO_JOIN && undone.length > 0;
    const before = joins ? null : JSON.stringify(file());
    if (!run()) return false;
    if (before !== null) {
      undone.push(before);
      if (undone.length > UNDO_DEPTH) undone.shift();
    }
    redone.length = 0;
    lastTag = tag;
    lastAt = now;
    notify();
    return true;
  }
  function step(from: string[], to: string[]): void {
    const text = from.pop();
    if (text === undefined) return;
    to.push(JSON.stringify(file()));
    lastTag = "";
    restore(JSON.parse(text) as MixFile);
  }

  /** Drops every desk write under keys a predicate names (an effect or a bus that is gone). */
  function prune(match: (key: string) => boolean): void {
    for (const [layer, map] of [...layers])
      for (const key of [...map.keys()]) if (match(key)) store(layer, key, undefined);
  }

  // Samples and takes.

  const takesOf = (key: string): readonly Take[] => takesOver.get(key) ?? source?.takes(key) ?? [];
  const cueOf = (strip: Strip): string => (strip.parent ? strip.parent.name : strip.name);
  function samplesOf(strip: Strip): string[] {
    if (strip.kind === "stem") return [strip.name];
    if (strip.kind !== "cue") return [];
    return [...new Set(takesOf(cueOf(strip)).map((take) => take.sample))];
  }

  const desk: Desk = {
    buses() {
      cache.buses ??= allBuses().map((name) => ({
        name,
        made: mixer.made(name),
        out: mixer.outOf(name),
        volume: mixer.follows(name),
        sends: name === MASTER ? [] : mixer.names().filter((to) => to !== name),
        dropped: mixer.dropped(name).map(({ id, kind }) => ({ id, kind })),
        fx: mixer.chain(name).map((unit, slot) => ({
          slot,
          id: unit.id,
          kind: unit.kind,
          declared: unit.declared,
          ...(unit.key !== undefined ? { key: unit.key } : {}),
          ...(unit.ir !== undefined ? { ir: unit.ir } : {}),
          params: DESK_FX[unit.kind],
        })),
        trim: said(`trim:${name}`)?.value ?? 0,
        muted: busMuted.has(name),
        soloed: busSoloed.has(name),
      }));
      return cache.buses;
    },
    scenes() {
      cache.scenes ??= mixer.scenes();
      return cache.scenes;
    },
    channels() {
      if (!cache.channels) {
        const view = (strip: Strip): DeskChannel => {
          const route = routes.get(strip.id);
          return {
            id: strip.id,
            kind: strip.kind,
            name: strip.name,
            ...(strip.parent ? { parent: strip.parent.id } : {}),
            ...(strip.role !== undefined ? { role: strip.role } : {}),
            bus: strip.bus,
            ...(route !== undefined ? { route } : {}),
            sends: strip.kind === "cue" ? sendsOf(strip) : [],
            samples: samplesOf(strip),
            trim: trimOf(strip),
            muted: strip.muted,
            soloed: strip.soloed,
            sounding: sounding(strip) || strip.children.some(sounding),
            lastAt: strip.lastAt,
          };
        };
        const out: DeskChannel[] = [];
        for (const strip of listed) {
          if (strip.parent) continue;
          out.push(view(strip));
          for (const child of strip.children) if (child.listed) out.push(view(child));
        }
        cache.channels = out;
      }
      return cache.channels;
    },
    tunables() {
      cache.tunables ??= tunables();
      return cache.tunables;
    },
    get(layer, key) {
      const own = ownKey(key);
      if (own) return layer === "live" ? (said(key)?.value ?? ownDefault(own)) : layers.get(layer)?.get(key);
      if (layer !== "live") return mixer.get(layer, key);
      const canon = mixer.key(key);
      return canon === null ? undefined : (mixer.get("live", canon) ?? initialOf(canon));
    },
    owner: (key) => (ownKey(key) ? (said(key)?.layer ?? "default") : mixer.owner(key)),
    set(layer, key, value) {
      change(`set:${layer}:${key}`, () => write(layer, key, value));
    },
    copyLayer(from, to) {
      if (from === to) return;
      change("", () => {
        if ((from !== MIX && !sceneLayer(from)) || (to !== MIX && !sceneLayer(to))) return false;
        const says = mixer.says(from);
        const into = mixer.says(to);
        // Under a scene lies the mix: a scene need not say what the mix already does.
        const under = (key: string): number | undefined =>
          to === MIX ? undefined : (mixer.get(MIX, key) ?? initialOf(key));
        for (const [key, value] of says) if ((into.get(key) ?? under(key)) !== value) write(to, key, value);
        const own = new Map([...(layers.get(from) ?? [])].filter(([key]) => ownKey(key)));
        for (const [key, value] of own) write(to, key, value);
        // Between two scenes, what only the second says goes back to the mix's.
        if (from !== MIX && to !== MIX) {
          for (const key of into.keys()) {
            if (says.has(key)) continue;
            write(to, key, undefined);
            const left = mixer.get(to, key);
            const rest = under(key);
            if (left !== undefined && rest !== undefined && left !== rest) write(to, key, rest);
          }
          for (const key of [...(layers.get(to)?.keys() ?? [])])
            if (ownKey(key) && !own.has(key)) write(to, key, undefined);
        }
        return true;
      });
    },
    trim(bus, db) {
      desk.set(MIX, `trim:${bus}`, Number.isFinite(db) && db !== 0 ? db : undefined);
    },
    channelTrim(id, db) {
      desk.set(MIX, `ch:${id}`, Number.isFinite(db) && db !== 0 ? db : undefined);
    },

    addBus: (name, options) => change("", () => mixer.addBus(name, options?.out)),
    removeBus(name) {
      if ([...routes.values()].includes(name)) return false;
      return change("", () => {
        if (!mixer.removeBus(name)) return false;
        prune((key) => {
          const own = ownKey(key);
          if (own)
            return (own.type === "trim" && own.bus === name) || (own.type === "chsend" && own.to === name);
          return (
            key === `level:${name}` ||
            key.startsWith(`send:${name}>`) ||
            (key.startsWith("send:") && key.endsWith(`>${name}`)) ||
            key.startsWith(`fx:${name}:`)
          );
        });
        busMuted.delete(name);
        busSoloed.delete(name);
        relisten();
        return true;
      });
    },
    setOut: (bus, out) => change("", () => mixer.setOut(bus, out)),
    setVolume: (bus, of) =>
      // Saying what already holds is no change, and no step of undo.
      bus !== MASTER && mixer.isBus(bus) && mixer.follows(bus) === of
        ? true
        : change("", () => mixer.follow(bus, of)),
    fxAdd(bus, kind, at) {
      let id: string | null = null;
      change("", () => {
        id = mixer.fxAdd(bus, kind, at);
        return id !== null;
      });
      return id;
    },
    fxRemove(bus, id) {
      const unit = mixer.chain(bus).find((each) => each.id === id);
      return change("", () => {
        if (!mixer.fxRemove(bus, id)) return false;
        // A declared effect's writes wait for it to come back; one the desk made takes its own with it.
        if (unit && !unit.declared) prune((key) => key.startsWith(`fx:${bus}:${id}:`));
        return true;
      });
    },
    fxRestore: (bus, id) => change("", () => mixer.fxRestore(bus, id)),
    fxMove: (bus, id, to) => change("", () => mixer.fxMove(bus, id, to)),
    fxKey: (bus, id, key) => change("", () => mixer.fxKey(bus, id, key)),
    fxIr: (bus, id, sample) => change("", () => mixer.fxIr(bus, id, sample)),
    limits: () => mixer.limits(),
    route(channel, bus) {
      const strip = stripById(channel);
      if (!strip || (bus !== undefined && !mixer.isBus(bus))) return false;
      return change("", () => {
        if (routes.get(channel) === bus) return false;
        if (bus === undefined) routes.delete(channel);
        else routes.set(channel, bus);
        list(strip);
        for (const each of [strip, ...strip.children]) for (const fn of [...each.routeFns]) fn();
        return true;
      });
    },

    packs: () => source?.packs() ?? [],
    samples() {
      if (!cache.samples) {
        const users = new Map<string, string[]>();
        const use = (sample: string, channel: string) => {
          const list = users.get(sample);
          if (list) list.push(channel);
          else users.set(sample, [channel]);
        };
        for (const key of source?.cues() ?? [])
          for (const sample of new Set(takesOf(key).map((take) => take.sample))) use(sample, `cue:${key}`);
        for (const strip of strips.values()) if (strip.kind === "stem") use(strip.name, strip.id);
        const view = (key: string, entry: SampleEntry, url: string | undefined): DeskSample => {
          const cut = key.indexOf("/");
          const staged = stagedBy.get(key);
          return {
            key,
            pack: key.slice(0, cut),
            name: key.slice(cut + 1),
            entry: staged?.side === "b" ? staged.entry : entry,
            ...(url !== undefined ? { url } : {}),
            users: users.get(key) ?? [],
            staged: staged !== undefined,
            side: staged?.side ?? "a",
          };
        };
        const out = (source?.samples() ?? []).map(({ key, entry, url }) => view(key, entry, url));
        for (const [key, staged] of stagedBy)
          if (!out.some((sample) => sample.key === key)) out.push(view(key, staged.entry, undefined));
        cache.samples = out;
      }
      return cache.samples;
    },
    async stage(key, audio, entry, token) {
      if (!source || key.indexOf("/") <= 0) return false;
      const fresh = stagedBy.get(key)?.fresh ?? !source.samples().some((sample) => sample.key === key);
      if (!(await source.stage(key, audio, entry))) return false;
      stagedBy.set(key, { key, token, entry, fresh, side: "b" });
      notify();
      return true;
    },
    ab(key, side) {
      const staged = stagedBy.get(key);
      // A sample the pack does not have yet has no other side.
      if (!staged || staged.fresh || staged.side === side) return;
      staged.side = side;
      source?.side(key, side);
      notify();
    },
    unstage(key) {
      if (!stagedBy.delete(key)) return;
      source?.unstage(key);
      notify();
    },
    staged: () =>
      [...stagedBy.values()].map(({ key, token, entry, fresh }) => ({ key, token, entry, fresh })),
    committed(keys) {
      for (const key of keys) {
        if (!stagedBy.delete(key)) continue;
        source?.keep(key);
      }
      notify();
    },
    takes(cue) {
      const declared = source?.takes(cue);
      if (!declared) return null;
      const over = takesOver.get(cue);
      return { takes: over ?? declared, declared, replaced: over !== undefined };
    },
    setTakes(cue, takes) {
      if (!source?.takes(cue)) return;
      change("", () => {
        if (takes === undefined) {
          if (!takesOver.delete(cue)) return false;
        } else
          takesOver.set(
            cue,
            takes.map((take) => ({ ...take })),
          );
        source.retake(cue);
        return true;
      });
    },

    undo: () => step(undone, redone),
    redo: () => step(redone, undone),
    canUndo: () => undone.length > 0,
    canRedo: () => redone.length > 0,

    mute(id, on) {
      if (id.startsWith("bus:")) {
        const bus = id.slice(4);
        if (!mixer.isBus(bus)) return;
        if (on) busMuted.add(bus);
        else busMuted.delete(bus);
      } else {
        const strip = strips.get(id);
        if (!strip) return;
        strip.muted = on;
      }
      relisten();
      notify();
    },
    solo(id, on) {
      if (id.startsWith("bus:")) {
        const bus = id.slice(4);
        if (!mixer.isBus(bus)) return;
        if (on) busSoloed.add(bus);
        else busSoloed.delete(bus);
      } else {
        const strip = strips.get(id);
        if (!strip) return;
        strip.soloed = on;
      }
      relisten();
      notify();
    },
    clearListening() {
      busMuted.clear();
      busSoloed.clear();
      for (const strip of strips.values()) {
        strip.muted = false;
        strip.soloed = false;
      }
      relisten();
      notify();
    },
    audition(id) {
      const strip = id.startsWith("cue:") ? strips.get(id) : undefined;
      if (strip) audition(cueOf(strip), strip.role);
      else if (id.startsWith("cue:")) audition(id.slice(4));
    },
    tune(id, value) {
      desk.set(MIX, `tune:${id}`, value);
    },
    meters() {
      const fresh = port.up() && port.time() - heardAt <= METER_STALE;
      const buses: Record<string, DeskMeter> = {};
      for (const name of allBuses()) {
        const i = mixer.indexOf(name);
        buses[name] =
          fresh && i >= 0
            ? { peak: peaks[i] ?? 0, rms: rmss[i] ?? 0, reduction: reductions[i] ?? 0 }
            : { peak: 0, rms: 0, reduction: 0 };
      }
      peaks.fill(0);
      reductions.fill(0);
      return { buses, lufs: fresh ? lufs : -200 };
    },
    file,
    load(next) {
      for (const strip of strips.values()) {
        strip.muted = false;
        strip.soloed = false;
      }
      busMuted.clear();
      busSoloed.clear();
      restore(next);
      undone.length = 0;
      redone.length = 0;
      lastTag = "";
      baseline = JSON.stringify(file());
    },
    dirty: () => JSON.stringify(file()) !== baseline,
    saved() {
      baseline = JSON.stringify(file());
      notify();
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => void subscribers.delete(fn);
    },
  };

  baseline = JSON.stringify(file());
  return {
    desk,
    channel: (kind, name) => linkOf(stripOf(`${kind}:${name}`, kind, name)),
    role: (key, asked) => linkOf(stripOf(`cue:${key}@${asked}`, "cue", `${key}@${asked}`)),
    takes: (key) => takesOver.get(key),
  };
}

// ---- A desk with nothing behind it ------------------------------------------------------------------------------

/** A desk that holds what it is told and reaches no sound: what `sound.desk` is until the engine builds the real one. */
export function inertDesk(): Desk {
  return {
    buses: () => [],
    scenes: () => ({ names: [], current: null, pushed: [], labels: {} }),
    channels: () => [],
    tunables,
    get: () => undefined,
    owner: () => "default",
    set() {},
    copyLayer() {},
    trim() {},
    channelTrim() {},
    addBus: () => false,
    removeBus: () => false,
    setOut: () => false,
    setVolume: () => false,
    fxAdd: () => null,
    fxRemove: () => false,
    fxRestore: () => false,
    fxMove: () => false,
    fxKey: () => false,
    fxIr: () => false,
    limits: () => ({ fx: 0, buses: 0 }),
    route: () => false,
    packs: () => [],
    samples: () => [],
    stage: () => Promise.resolve(false),
    ab() {},
    unstage() {},
    staged: () => [],
    committed() {},
    takes: () => null,
    setTakes() {},
    undo() {},
    redo() {},
    canUndo: () => false,
    canRedo: () => false,
    mute() {},
    solo() {},
    clearListening() {},
    audition() {},
    tune,
    meters: () => ({ buses: {}, lufs: -200 }),
    file: () => ({ version: 2 }),
    load() {},
    dirty: () => false,
    saved() {},
    subscribe: () => () => {},
  };
}
