/**
 * The mixer: a game's buses, their effects and sends, the player's volumes and the scenes, kept on the main thread
 * and sent to the core.
 *
 * Every number the mix can move is a target: a bus's level (dB), one of its sends (0..1), one setting of one of its
 * effects, or an effect's on/off. What a target is worth, highest first:
 *
 * 1. the mod matrix: while any route drives it, the routes' sum (`drive`);
 * 2. the scenes: the topmost pushed scene that names it, else the current scene (`scene(name)`);
 * 3. the mix: the bus's definition, moved by the handles (`bus(name).level`, `.send`, `.fx(slot).set`).
 *
 * A layer that stops saying (a route removed, a scene popped) uncovers the one under it. The player's volume
 * (`setBusVolume`) is apart from all three: it multiplies the bus's gain. The master's gain in the core, a fader after
 * the master's effects, is the sound's volume (`volume`, what `sound.setVolume` sets) times the master's level times
 * the player's master volume. An effect setting nothing below has a value for stays where it was.
 *
 * **The structure can change while it plays** (the mix desk's doing): a bus made or removed, a bus's output, an
 * effect added, removed, moved or re-keyed. An effect is named by its `id` on its bus, never by where it sits, so a
 * scene, a route and a saved key reach the same effect wherever it has been moved; the core's slot is its place in
 * the bus's chain now. A chain that changes is defined again in the core from the first slot that differs, with
 * every setting sent again (those effects start over: their tails are cut). A declared effect that was taken out
 * keeps its targets: what a scene or a route says of it is held and sent nowhere.
 *
 * Everything may be called before the core is up; it is remembered and sent from `boot()`. While the core is up,
 * writes are gathered and sent once in a microtask, each target only when its value changed.
 */
import type { GraphBus, GraphFx } from "./desk";
import type { CorePort } from "./port";
import { BUS_PARAM, CURVE, concat, encode, FX_KIND, FX_PARAMS, LIMITS, MASTER_PARAM } from "./protocol";
import type {
  BusDef,
  BusHandle,
  BusName,
  DefaultBus,
  FxDef,
  FxHandle,
  Mixer,
  ModTarget,
  Presence,
  SceneBus,
  SceneDef,
} from "./types";

/** The buses every sound has, in index order from 1 (0 is the master). */
export const DEFAULT_BUSES: readonly DefaultBus[] = ["sfx", "ui", "music", "ambience", "voice"];

export interface MixerOptions<B extends string> {
  buses?: Readonly<Partial<Record<B, BusDef<B>>>>;
  scenes?: Readonly<Record<string, SceneDef<B>>>;
  presence?: { mine?: Presence; other?: Presence };
}

/** The mixer as `engine.ts` holds it. */
export interface MixerCore<B extends string> {
  /** What a game sees: `sound.mixer`. */
  api: Mixer<B>;
  /** A bus's index in the core: 0 for `"master"`, `sfx`'s for a name that is not a bus or for none. */
  index(name: string | undefined): number;
  /** Sends everything declared and set so far. Called each time the core comes up, before anything plays. */
  boot(): void;
  /** A sample became ready or was freed: a convolver waiting for its impulse response can load it. */
  samples(): void;
  /** What a play's hand adds: `mine` true, false, or not said. */
  presence(mine: boolean | undefined): Presence;
  /** A mod target's key, for `drive`. Throws on a bus, an effect or a setting that does not exist. */
  target(target: ModTarget<B>): string;
  /** The mod matrix's value for a target (`undefined`: no route drives it), reached over `slewMs`. */
  drive(key: string, value: number | undefined, slewMs: number): void;
  /** The sound's master volume (`sound.setVolume`, 0..1): lands at once, and is sent from `boot()` before then. */
  volume(value: number): void;
  /** What the mix desk reaches the mix through. */
  desk: MixerDesk;
}

/** One effect of a bus's chain, as the desk reads it. */
export interface ChainUnit {
  id: string;
  kind: FxDef["kind"];
  /** True for one the code declares. */
  declared: boolean;
  /** A compressor's key bus in force. */
  key?: string;
  /** A convolver's impulse response in force. */
  ir?: string;
}

/**
 * The mix desk's hold on the mixer. A desk write sits over what the code declared in the same layer (the mix, or one
 * scene) and is kept apart from it, so taking the write away uncovers the declared value. A bus's trim and its
 * listening gain (mute and solo) multiply its gain beside the player's volume, outside the mix, the scenes and the
 * routes. The structure is the desk's to change: each change answers false (or null) when it is refused.
 */
export interface MixerDesk {
  /** Every bus but the master, in index order (the order the core numbers them). */
  names(): readonly string[];
  /** A bus's index in the core (0: the master), or -1 for a name that is not a bus. */
  indexOf(name: string): number;
  /** True for the master and every bus. */
  isBus(name: string): boolean;
  /** True for a bus the desk made. */
  made(name: string): boolean;
  /** A bus's name as a play resolves it: a name that is not a bus is `sfx`, as `index` reads it. */
  resolve(name: string | undefined): string;
  /** The bus a bus sums into (`null` for the master). */
  outOf(name: string): string | null;
  /** The bus whose player volume a bus takes on top of its own, or null. */
  follows(name: string): string | null;
  /** Says which bus's player volume a bus takes too (`null`: none). Refused for itself or a name that is no bus. */
  follow(bus: string, of: string | null): boolean;
  /** The buses a bus sends to now: a send known to the mix at a level above 0 in force. */
  sendsOf(name: string): readonly string[];
  /** A bus's effects in the order they run. */
  chain(name: string): readonly ChainUnit[];
  /** A bus's declared effects that are out of its chain, in declared order. */
  dropped(name: string): readonly ChainUnit[];
  /** The scenes, which are in force (bottom first), and what each is called where its definition says. */
  scenes(): {
    names: readonly string[];
    current: string | null;
    pushed: readonly string[];
    labels: Readonly<Record<string, string>>;
  };
  /** A target key in its canonical form, made known to the mixer, or null when no such target exists. */
  key(key: string): string | null;
  /** A layer's value for a key: the desk's write over the declared one. `"live"` is the value in force. */
  get(layer: string, key: string): number | undefined;
  /** Which layer the value in force comes from: `"route"`, `"scene:<name>"`, `"mix"` or `"default"`. */
  owner(key: string): string;
  /** A desk write into `"mix"` or `"scene:<name>"` (`undefined` takes it away), heard over `slewMs`. False when refused. */
  write(layer: string, key: string, value: number | undefined, slewMs: number): boolean;
  /** Every target a layer says and what it says: the declared values under the desk's writes. */
  says(layer: string): ReadonlyMap<string, number>;
  /** A bus's trim in dB (0: none). */
  trim(bus: string, db: number, slewMs: number): void;
  /** A bus's listening gain: 0 while muted or soloed out, else 1. */
  listen(bus: string, gain: number, slewMs: number): void;
  /** Hears a scene set, pushed or popped, a route starting or ending on a target, and the structure changing. */
  onChange(fn: () => void): void;

  /** Makes a bus that sums into `out` (default the master). */
  addBus(name: string, out?: string): boolean;
  /** Removes a bus the desk made, once no bus sums, sends or listens to it. */
  removeBus(name: string): boolean;
  /** Points a bus's output at another bus or the master; refused where it would close a loop. */
  setOut(bus: string, out: string): boolean;
  /** Adds an effect at a place in a bus's chain (default: last); its id. */
  fxAdd(bus: string, kind: FxDef["kind"], at?: number): string | null;
  fxRemove(bus: string, id: string): boolean;
  /** Puts a declared effect that was taken out back in its chain, after its declared predecessor. */
  fxRestore(bus: string, id: string): boolean;
  fxMove(bus: string, id: string, to: number): boolean;
  /** A compressor's key bus (`null`: its own). */
  fxKey(bus: string, id: string, key: string | null): boolean;
  /** A convolver's impulse response, by sample key. */
  fxIr(bus: string, id: string, sample: string): boolean;
  /** The structure where it differs from the declared one, by bus. */
  graph(): Record<string, GraphBus>;
  /** Replaces the structure with the declared one under `graph`, defining again only the chains that differ. */
  loadGraph(graph: Readonly<Record<string, GraphBus>> | undefined): void;
  /** The most effects a bus holds, and the most buses beside the master. */
  limits(): { fx: number; buses: number };
}

/** A scene's fade when none is given. */
const SCENE_FADE_MS = 400;
/** How long a player's volume change takes, so a slider does not click. */
const VOLUME_SLEW_MS = 30;
/** The shortest an effect's on/off takes: the core's crossfade. */
const ON_SLEW_MS = 10;
/** What `play(key, { mine: false })` does when the game says nothing. */
const OTHER: Presence = { db: -6, sendDb: 6 };
const UNTOUCHED: Presence = { db: 0, sendDb: 0 };
const MASTER = "master";
/** A bus the desk makes is named with letters, digits, spaces, dots, dashes and underscores. */
const MADE_NAME = /^[\w][\w .-]{0,31}$/;

/** Each `FxDef` kind's effect in the core (exported for the desk's table and its test). */
export const KIND = {
  filter: "svf",
  eq: "eq",
  compressor: "comp",
  saturator: "sat",
  delay: "delay",
  tape: "tape",
  crush: "crush",
  reverb: "fdn",
  convolver: "conv",
  freeze: "freeze",
  stereo: "stereo",
} as const satisfies Record<FxDef["kind"], Exclude<keyof typeof FX_KIND, "none">>;

/** Settings that travel along the logarithm: frequencies and times. */
const EXP = new Set([
  "cutoff",
  "lowFreq",
  "mid1Freq",
  "mid2Freq",
  "highFreq",
  "attack",
  "release",
  "time",
  "filter",
  "decay",
  "predelay",
  "wowRate",
  "flutterRate",
  "rate",
]);

const FILTER_MODES = ["low", "high", "band", "notch"];

const dbGain = (db: number): number => (Number.isFinite(db) ? 10 ** (db / 20) : 1);

/** A setting as the core reads it: a filter's mode as 0..3, its slope as 0 (12 dB) or 1 (24 dB), a switch as 0 or 1. */
function toWire(param: string, value: unknown): number | undefined {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (param === "mode" && typeof value === "string") {
    const at = FILTER_MODES.indexOf(value);
    return at >= 0 ? at : undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (param === "slope") return value === 24 || value === 1 ? 1 : 0;
  return value;
}

type Target =
  | { type: "level"; bus: string }
  | { type: "send"; bus: string; to: string }
  | { type: "fx"; bus: string; id: string; param: string; pid: number; exp: boolean }
  | { type: "on"; bus: string; id: string };

/** One effect, wherever it is: in its bus's chain, or a declared one taken out of it. */
interface Unit {
  id: string;
  kind: FxDef["kind"];
  declared: boolean;
  /** A compressor's key bus in force, and the one the code declares. */
  key: string | undefined;
  declaredKey: string | undefined;
  /** A convolver's impulse response in force. */
  ir: string | undefined;
}

/** A scene, read once: its value for each target it names. */
type Layer = ReadonlyMap<string, number>;

/** Builds the mixer. Throws on a bus graph with a cycle, a scene naming a bus that does not exist, or over 15 buses. */
export function createMixer<B extends string>(options: MixerOptions<B>, port: CorePort): MixerCore<B> {
  const declared: Readonly<Partial<Record<string, BusDef<string>>>> = options.buses ?? {};
  /** The buses by core index less one; a hole is an index a removed bus gave back. */
  const slots: (string | null)[] = [...DEFAULT_BUSES];
  for (const name of Object.keys(declared)) if (name !== MASTER && !slots.includes(name)) slots.push(name);
  if (slots.length > LIMITS.MAX_BUSES - 1)
    throw new Error(`watchpot/sound: ${slots.length} buses, but the core holds ${LIMITS.MAX_BUSES - 1}`);
  /** The buses the desk made. */
  const madeBuses = new Set<string>();

  const live = (): string[] => slots.filter((name): name is string => name !== null);
  const isBus = (name: string): boolean => slots.includes(name);
  const defOf = (name: string): BusDef<string> => declared[name] ?? {};
  const declaredOut = (name: string): string => {
    const out = defOf(name).out;
    return out === undefined || out === MASTER ? MASTER : out;
  };
  /** Where each bus sums now. */
  const outs = new Map<string, string>();
  const outOf = (name: string): string => outs.get(name) ?? declaredOut(name);
  /** The bus whose player volume a bus takes on top of its own, as declared. */
  const declaredFollow = (name: string): string | undefined => {
    const of = defOf(name).volume;
    return of === undefined || of === name ? undefined : of;
  };
  /** Where the desk says otherwise: the bus it takes, or null for none. */
  const follows = new Map<string, string | null>();
  const followOf = (name: string): string | undefined => {
    const of = follows.has(name) ? (follows.get(name) ?? undefined) : declaredFollow(name);
    return of !== undefined && isBus(of) && of !== name ? of : undefined;
  };

  /** Every declared effect by bus, in declared order: in its chain or taken out. */
  const declaredUnits = new Map<string, Unit[]>();
  /** Each bus's effects in the order they run. */
  const chains = new Map<string, Unit[]>();
  const chainOf = (name: string): Unit[] => chains.get(name) ?? [];
  const declaredOf = (name: string): Unit[] => declaredUnits.get(name) ?? [];

  for (const name of live()) {
    const def = defOf(name);
    const out = declaredOut(name);
    if (out !== MASTER && !isBus(out))
      throw new Error(`watchpot/sound: bus "${name}" sums into "${out}", which is not a bus`);
    for (const to of Object.keys(def.sends ?? {}))
      if (!isBus(to) || to === name)
        throw new Error(`watchpot/sound: bus "${name}" sends to "${to}", which is not another bus`);
    if (def.volume !== undefined && (!isBus(def.volume) || def.volume === name))
      throw new Error(
        `watchpot/sound: bus "${name}" takes the volume of "${def.volume}", which is not another bus`,
      );
    const fx = def.fx ?? [];
    if (fx.length > LIMITS.FX_SLOTS)
      throw new Error(
        `watchpot/sound: bus "${name}" has ${fx.length} effects; a bus holds ${LIMITS.FX_SLOTS}`,
      );
    const units: Unit[] = fx.map((unit, at) => {
      if (unit.kind === "compressor" && unit.key !== undefined && !isBus(unit.key))
        throw new Error(
          `watchpot/sound: a compressor on "${name}" listens to "${unit.key}", which is not a bus`,
        );
      if (unit.id !== undefined && (/^\d*$/.test(unit.id) || unit.id.includes(":")))
        throw new Error(
          `watchpot/sound: an effect on "${name}" is named "${unit.id}"; a name has a letter in it and no colon`,
        );
      const key = unit.kind === "compressor" ? unit.key : undefined;
      return {
        id: unit.id ?? String(at),
        kind: unit.kind,
        declared: true,
        key,
        declaredKey: key,
        ir: unit.kind === "convolver" ? unit.ir : undefined,
      };
    });
    for (const unit of units)
      if (units.some((other) => other !== unit && other.id === unit.id))
        throw new Error(`watchpot/sound: two effects on "${name}" are named "${unit.id}"`);
    declaredUnits.set(name, units);
    chains.set(name, [...units]);
  }

  // The declared graph has no cycle: a bus comes after every bus it sums or sends into.
  {
    const done = new Set<string>();
    const names = live();
    const deps = (name: string) =>
      [declaredOut(name), ...Object.keys(defOf(name).sends ?? {})].filter((to) => to !== MASTER);
    while (done.size < names.length) {
      const next = names.find((name) => !done.has(name) && deps(name).every((to) => done.has(to)));
      if (next === undefined) {
        const left = names.filter((name) => !done.has(name)).join(", ");
        throw new Error(`watchpot/sound: the buses ${left} feed each other in a cycle`);
      }
      done.add(next);
    }
  }

  const index = (name: string | undefined): number => {
    if (name === MASTER) return 0;
    const at = name === undefined ? -1 : slots.indexOf(name);
    return at >= 0 ? at + 1 : 1;
  };

  // The targets, by key.

  const targets = new Map<string, Target>();
  const levelKey = (bus: string): string => {
    const key = `level:${bus}`;
    if (!targets.has(key)) targets.set(key, { type: "level", bus });
    return key;
  };
  const sendKey = (bus: string, to: string): string | null => {
    if (bus === MASTER || !isBus(bus) || !isBus(to) || bus === to) return null;
    const key = `send:${bus}>${to}`;
    if (!targets.has(key)) targets.set(key, { type: "send", bus, to });
    return key;
  };
  /** An effect by what names it: its id, or its place in the declared chain (a number, or digits). */
  const unitOf = (bus: string, ref: number | string): Unit | undefined => {
    const all = declaredOf(bus);
    if (typeof ref === "number") return all[ref];
    const named = chainOf(bus).find((unit) => unit.id === ref) ?? all.find((unit) => unit.id === ref);
    return named ?? (/^\d+$/.test(ref) ? all[Number(ref)] : undefined);
  };
  const fxKey = (bus: string, ref: number | string, param: string): string | null => {
    const unit = unitOf(bus, ref);
    if (!unit) return null;
    const key = `fx:${bus}:${unit.id}:${param}`;
    if (targets.has(key)) return key;
    if (param === "on") {
      targets.set(key, { type: "on", bus, id: unit.id });
      return key;
    }
    const pid = (FX_PARAMS[KIND[unit.kind]] as Readonly<Record<string, number>>)[param];
    if (pid === undefined) return null;
    targets.set(key, { type: "fx", bus, id: unit.id, param, pid, exp: EXP.has(param) });
    return key;
  };
  /** Where an effect sits in its bus's chain now, or -1 for one taken out. */
  const slotOf = (bus: string, id: string): number => chainOf(bus).findIndex((unit) => unit.id === id);

  /** The mix: definitions, moved by the handles. */
  const mix = new Map<string, number>();
  /** The mod matrix's values. */
  const driven = new Map<string, number>();
  const volumes = new Map<string, number>();

  for (const name of live()) {
    const def = defOf(name);
    if (def.level !== undefined && Number.isFinite(def.level)) mix.set(levelKey(name), def.level);
    for (const [to, level] of Object.entries(def.sends ?? {})) {
      const key = sendKey(name, to);
      if (key && typeof level === "number" && Number.isFinite(level)) mix.set(key, Math.max(0, level));
    }
    (def.fx ?? []).forEach((unit, slot) => {
      for (const [param, raw] of Object.entries(unit)) {
        const key = fxKey(name, slot, param);
        const value = toWire(param, raw);
        if (key && value !== undefined) mix.set(key, value);
      }
    });
  }

  const scenes = new Map<string, Layer>();
  const labels: Record<string, string> = {};
  /** Effect settings a scene moves that their bus never declares. */
  const unset = new Set<string>();
  for (const [scene, def] of Object.entries(options.scenes ?? {})) {
    const layer = new Map<string, number>();
    if (def.label !== undefined) labels[scene] = def.label;
    const fail = (what: string) => {
      throw new Error(`watchpot/sound: scene "${scene}" names ${what}, which does not exist`);
    };
    for (const [bus, says] of Object.entries(def.buses ?? {}) as [string, SceneBus<string> | undefined][]) {
      if (bus !== MASTER && !isBus(bus)) fail(`bus "${bus}"`);
      if (!says) continue;
      if (says.level !== undefined) layer.set(levelKey(bus), says.level);
      for (const [to, level] of Object.entries(says.sends ?? {})) {
        const key = sendKey(bus, to);
        if (!key) fail(`a send from "${bus}" to "${to}"`);
        else if (typeof level === "number") layer.set(key, Math.max(0, level));
      }
      for (const [slot, settings] of Object.entries(says.fx ?? {}))
        for (const [param, raw] of Object.entries(settings)) {
          const key = fxKey(bus, slot, param);
          const value = toWire(param, raw);
          if (!key) fail(`"${param}" of effect ${slot} on "${bus}"`);
          else if (value !== undefined) {
            layer.set(key, value);
            // The mix has no value of its own for it (the effect's default lives in the core), so nothing takes the
            // scene's value back when the scene comes off. An effect's on/off has one: on.
            if (!mix.has(key) && param !== "on") unset.add(`"${param}" of effect ${slot} on "${bus}"`);
          }
        }
    }
    scenes.set(scene, layer);
  }
  if (unset.size)
    console.warn(
      `watchpot/sound: a scene sets ${[...unset].join(", ")}, which the bus's own definition leaves at the effect's default: when the scene comes off the setting stays where the scene put it. Declare it in the bus (SoundOptions.buses) with the value it should return to.`,
    );

  /** The current scene, and the scenes pushed over it, bottom first, by name. */
  let current: string | null = null;
  const pushed: { name: string; fadeMs: number }[] = [];

  /** The desk's writes: over the mix, and over each scene, by key. */
  const deskMix = new Map<string, number>();
  const deskScenes = new Map<string, Map<string, number>>();
  /** The desk's bus trims (linear) and listening gains (0 or 1). */
  const trims = new Map<string, number>();
  const listening = new Map<string, number>();
  const changed = new Set<() => void>();
  const changes = () => {
    for (const fn of changed) fn();
  };

  const mixOf = (key: string): number | undefined => deskMix.get(key) ?? mix.get(key);
  const sceneOf = (name: string, key: string): number | undefined =>
    deskScenes.get(name)?.get(key) ?? scenes.get(name)?.get(key);

  const base = (key: string): number | undefined => {
    for (let i = pushed.length - 1; i >= 0; i--) {
      const entry = pushed[i];
      const value = entry ? sceneOf(entry.name, key) : undefined;
      if (value !== undefined) return value;
    }
    return (current === null ? undefined : sceneOf(current, key)) ?? mixOf(key);
  };
  const value = (key: string): number | undefined => driven.get(key) ?? base(key);
  const volumeOf = (bus: string): number => volumes.get(bus) ?? 1;
  /** The player's volume as a bus hears it: its own times that of the bus it takes one from. */
  const heardVolume = (bus: string): number => {
    const of = followOf(bus);
    return volumeOf(bus) * (of === undefined ? 1 : volumeOf(of));
  };

  /** The sound's master volume (`sound.setVolume`). */
  let master = 1;

  /**
   * A bus's gain on the wire: its level times its player's volume and the desk's trim and listening gain, and for
   * the master the sound's volume too.
   */
  function gainOf(bus: string): number {
    const gain =
      dbGain(value(levelKey(bus)) ?? 0) *
      heardVolume(bus) *
      (trims.get(bus) ?? 1) *
      (listening.get(bus) ?? 1);
    return bus === MASTER ? gain * master : gain;
  }

  // Sending.

  /** What was last sent for each target since the core came up. */
  const sent = new Map<string, number>();
  /** Targets written since the last flush, each with the slew of its latest write. */
  const dirty = new Map<string, number>();
  let scheduled = false;

  function recordOf(key: string, slewMs: number): Uint8Array | null {
    const target = targets.get(key);
    if (!target) return null;
    const slew = port.frames(slewMs);
    if (target.type === "level") {
      const gain = gainOf(target.bus);
      if (sent.get(key) === gain) return null;
      sent.set(key, gain);
      if (target.bus === MASTER) return encode("MASTER_SET", { param: MASTER_PARAM.gain, value: gain, slew });
      return encode("BUS_SET", {
        bus: index(target.bus),
        param: BUS_PARAM.gain,
        index: 0,
        value: gain,
        slew,
      });
    }
    if (target.type === "send") {
      const level = Math.max(0, value(key) ?? 0);
      if (sent.get(key) === level || (!sent.has(key) && level === 0)) return null;
      sent.set(key, level);
      return encode("BUS_SET", {
        bus: index(target.bus),
        param: BUS_PARAM.send,
        index: index(target.to),
        value: level,
        slew,
      });
    }
    // An effect taken out of its chain is sent nothing.
    const slot = slotOf(target.bus, target.id);
    if (slot < 0) return null;
    if (target.type === "on") {
      const on = (value(key) ?? 1) >= 0.5 ? 1 : 0;
      // A slot starts on: only an off, or an on after one, is news.
      if (sent.get(key) === on || (!sent.has(key) && on === 1)) return null;
      sent.set(key, on);
      return encode("FX_ON", {
        bus: index(target.bus),
        slot,
        value: on,
        slew: Math.max(slew, port.frames(ON_SLEW_MS)),
      });
    }
    const setting = value(key);
    if (setting === undefined || sent.get(key) === setting) return null;
    sent.set(key, setting);
    return encode("FX_SET", {
      bus: index(target.bus),
      slot,
      param: target.pid,
      value: setting,
      slew,
      curve: target.exp ? CURVE.exp : CURVE.lin,
    });
  }

  function flush(): void {
    scheduled = false;
    if (!port.up()) {
      dirty.clear();
      return;
    }
    const records: Uint8Array[] = [];
    for (const [key, slewMs] of dirty) {
      const record = recordOf(key, slewMs);
      if (record) records.push(record);
    }
    dirty.clear();
    if (records.length) port.send(concat(records));
  }

  function touch(key: string, slewMs: number): void {
    const slew = Math.max(0, Number.isFinite(slewMs) ? slewMs : 0);
    dirty.set(key, slew);
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(flush);
  }

  /** Touches every key a scene names, declared or written by the desk. */
  const touchLayer = (name: string | null, fadeMs: number) => {
    if (name === null) return;
    for (const key of scenes.get(name)?.keys() ?? []) touch(key, fadeMs);
    for (const key of deskScenes.get(name)?.keys() ?? []) touch(key, fadeMs);
  };

  // Convolvers' impulse responses: the sample id each has been handed, by `bus:id`.
  const irs = new Map<string, number>();
  function loadIrs(): Uint8Array[] {
    const records: Uint8Array[] = [];
    for (const bus of live())
      chainOf(bus).forEach((unit, slot) => {
        if (unit.kind !== "convolver" || !unit.ir) return;
        const id = port.sample(unit.ir);
        const at = `${bus}:${unit.id}`;
        if ((irs.get(at) ?? 0) === id) return;
        irs.set(at, id);
        if (id !== 0) records.push(encode("IR_LOAD", { bus: index(bus), slot, sample: id }));
      });
    return records;
  }

  // The structure.

  /** The records that define a slot and hand its effect every setting the mix has for it, with no slew. */
  function defineSlot(bus: string, slot: number, unit: Unit | undefined): Uint8Array[] {
    const key = unit?.key !== undefined && isBus(unit.key) ? index(unit.key) + 1 : 0;
    const kind = unit ? FX_KIND[KIND[unit.kind]] : FX_KIND.none;
    const records = [encode("FX_DEFINE", { bus: index(bus), slot, kind, key })];
    if (!unit) return records;
    irs.delete(`${bus}:${unit.id}`);
    for (const [targetKey, target] of targets) {
      if ((target.type !== "fx" && target.type !== "on") || target.bus !== bus || target.id !== unit.id)
        continue;
      sent.delete(targetKey);
      const record = recordOf(targetKey, 0);
      if (record) records.push(record);
    }
    return records;
  }

  /** Defines a bus's slots again from `from`, after its chain changed; `was` is how long the chain used to be. */
  function redefine(bus: string, from: number, was: number): void {
    const chain = chainOf(bus);
    // What a unit out of the chain was last sent is no longer true of anything.
    for (const [key, target] of targets)
      if ((target.type === "fx" || target.type === "on") && target.bus === bus && slotOf(bus, target.id) < 0)
        sent.delete(key);
    if (!port.up()) return;
    const records: Uint8Array[] = [];
    for (let slot = Math.max(0, from); slot < Math.max(was, chain.length); slot++)
      records.push(...defineSlot(bus, slot, chain[slot]));
    records.push(...loadIrs());
    if (records.length) port.send(concat(records));
  }

  /** The first place two chains differ (an effect, its key or its response), or -1 when they are the same. */
  function firstDifference(a: readonly Unit[], b: readonly Unit[]): number {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const x = a[i];
      const y = b[i];
      if (!x || !y || x.id !== y.id || x.kind !== y.kind || x.key !== y.key || x.ir !== y.ir) return i;
    }
    return -1;
  }

  /** Sets a bus's chain and defines what changed. */
  function setChain(bus: string, next: Unit[]): boolean {
    const now = chainOf(bus);
    const from = firstDifference(now, next);
    if (from < 0) return false;
    chains.set(bus, next);
    redefine(bus, from, now.length);
    return true;
  }

  /** True when, with `bus` summing into `out`, some bus would feed itself (through outputs and live sends). */
  function loops(bus: string, out: string, outsNow: (name: string) => string = outOf): boolean {
    const feeds = (from: string): string[] => {
      const to = from === bus ? out : outsNow(from);
      const list = to === MASTER ? [] : [to];
      for (const other of live()) {
        const key = `send:${from}>${other}`;
        if (targets.has(key) && (value(key) ?? 0) > 0) list.push(other);
      }
      return list;
    };
    const seen = new Set<string>();
    const stack = feeds(bus);
    while (stack.length) {
      const at = stack.pop() as string;
      if (at === bus) return true;
      if (seen.has(at)) continue;
      seen.add(at);
      stack.push(...feeds(at));
    }
    return false;
  }

  /** The buses in dependency order: each after every bus it sums or can send into, ties by index. */
  function ordered(): string[] {
    const names = live();
    const deps = (name: string): string[] => {
      const list = outOf(name) === MASTER ? [] : [outOf(name)];
      for (const target of targets.values())
        if (target.type === "send" && target.bus === name) list.push(target.to);
      return list.filter((to) => isBus(to));
    };
    const order: string[] = [];
    const done = new Set<string>();
    while (order.length < names.length) {
      // A graph a desk left with a loop through a silent send is defined in index order from there.
      const next =
        names.find((name) => !done.has(name) && deps(name).every((to) => done.has(to))) ??
        names.find((name) => !done.has(name));
      if (next === undefined) break;
      order.push(next);
      done.add(next);
    }
    return order;
  }

  function sendBus(name: string): void {
    const gain = gainOf(name);
    sent.set(levelKey(name), gain);
    if (port.up()) port.send(encode("BUS_DEFINE", { bus: index(name), out: index(outOf(name)), gain }));
  }

  /** Forgets every target, value and write under a key prefix (an effect or a bus that is gone). */
  function forget(match: (key: string, target: Target) => boolean): void {
    for (const [key, target] of [...targets]) {
      if (!match(key, target)) continue;
      targets.delete(key);
      mix.delete(key);
      deskMix.delete(key);
      driven.delete(key);
      sent.delete(key);
      dirty.delete(key);
      for (const map of deskScenes.values()) map.delete(key);
    }
  }

  function makeBus(name: string, out: string): boolean {
    if (name === MASTER || isBus(name) || !MADE_NAME.test(name)) return false;
    if (out !== MASTER && !isBus(out)) return false;
    let at = slots.indexOf(null);
    if (at < 0) {
      if (slots.length >= LIMITS.MAX_BUSES - 1) return false;
      at = slots.length;
      slots.push(name);
    } else slots[at] = name;
    madeBuses.add(name);
    outs.set(name, out);
    chains.set(name, []);
    declaredUnits.set(name, []);
    levelKey(name);
    sendBus(name);
    return true;
  }

  /** True when a bus sums into, sends into at a level above 0, or listens to `name`. */
  function used(name: string): boolean {
    for (const other of live()) {
      if (other === name) continue;
      if (outOf(other) === name) return true;
      const key = `send:${other}>${name}`;
      if (targets.has(key) && (value(key) ?? 0) > 0) return true;
      if (chainOf(other).some((unit) => unit.key === name)) return true;
    }
    return false;
  }

  /** Takes a made bus away: silent, empty, its index free. What pointed at it points at the master, or nowhere. */
  function dropBus(name: string): void {
    if (!madeBuses.has(name)) return;
    const was = chainOf(name).length;
    chains.set(name, []);
    redefine(name, 0, was);
    for (const other of live()) {
      if (other === name) continue;
      if (outOf(other) === name) {
        outs.set(other, MASTER);
        sendBus(other);
      }
      const key = `send:${other}>${name}`;
      if (sent.has(key) && port.up())
        port.send(
          encode("BUS_SET", {
            bus: index(other),
            param: BUS_PARAM.send,
            index: index(name),
            value: 0,
            slew: 0,
          }),
        );
      const chain = chainOf(other);
      if (chain.some((unit) => unit.key === name))
        setChain(
          other,
          chain.map((unit) => (unit.key === name ? { ...unit, key: undefined } : unit)),
        );
    }
    if (port.up())
      port.send(encode("BUS_SET", { bus: index(name), param: BUS_PARAM.gain, index: 0, value: 0, slew: 0 }));
    forget((_key, target) => target.bus === name || (target.type === "send" && target.to === name));
    // A bus that took its volume goes back to what it declares.
    for (const [other, of] of [...follows])
      if (of === name) {
        follows.delete(other);
        touch(levelKey(other), VOLUME_SLEW_MS);
      }
    follows.delete(name);
    madeBuses.delete(name);
    outs.delete(name);
    chains.delete(name);
    declaredUnits.delete(name);
    trims.delete(name);
    listening.delete(name);
    volumes.delete(name);
    slots[slots.indexOf(name)] = null;
  }

  /** A fresh id for an effect the desk adds: its kind and the first number no effect of the bus has. */
  function freshId(bus: string, kind: string): string {
    const taken = new Set([...chainOf(bus), ...declaredOf(bus)].map((unit) => unit.id));
    for (let n = 1; ; n++) if (!taken.has(`${kind}-${n}`)) return `${kind}-${n}`;
  }

  /** A bus's chain as a graph says it: the declared chain where the graph says nothing. */
  function chainFrom(bus: string, graph: GraphBus | undefined): Unit[] {
    const all = declaredOf(bus);
    const reset = all.map((unit) => ({ ...unit, key: unit.declaredKey }));
    if (!graph || (graph.fx === undefined && graph.drop === undefined)) return reset;
    const drop = new Set(graph.drop ?? []);
    const out: Unit[] = [];
    const keyOf = (entry: GraphFx, otherwise: string | undefined): string | undefined => {
      if (!("key" in entry)) return otherwise;
      return entry.key === null || entry.key === undefined || !isBus(entry.key) || entry.key === bus
        ? undefined
        : entry.key;
    };
    if (graph.fx === undefined) out.push(...reset.filter((unit) => !drop.has(unit.id)));
    for (const entry of graph.fx ?? []) {
      if (out.some((unit) => unit.id === entry.id)) continue;
      const known = reset.find((unit) => unit.id === entry.id);
      if (entry.kind === undefined) {
        if (known && !drop.has(known.id)) out.push({ ...known, key: keyOf(entry, known.declaredKey) });
        continue;
      }
      if (known || !(entry.kind in KIND) || /^\d*$/.test(entry.id) || entry.id.includes(":")) continue;
      out.push({
        id: entry.id,
        kind: entry.kind,
        declared: false,
        key: entry.kind === "compressor" ? keyOf(entry, undefined) : undefined,
        declaredKey: undefined,
        ir: entry.kind === "convolver" ? (entry.ir ?? "") : undefined,
      });
    }
    // A declared effect the graph neither lists nor drops (the code gained it since) keeps its place after its
    // declared predecessor.
    if (graph.fx !== undefined)
      reset.forEach((unit, at) => {
        if (drop.has(unit.id) || out.some((other) => other.id === unit.id)) return;
        let after = -1;
        for (let i = at - 1; i >= 0 && after < 0; i--)
          after = out.findIndex((other) => other.id === reset[i]?.id);
        out.splice(after + 1, 0, unit);
      });
    return out.slice(0, LIMITS.FX_SLOTS);
  }

  function graph(): Record<string, GraphBus> {
    const out: Record<string, GraphBus> = {};
    for (const name of live()) {
      const made = madeBuses.has(name);
      const chain = chainOf(name);
      const all = declaredOf(name);
      const says: GraphBus = {};
      if (made) says.made = true;
      if (outOf(name) !== (made ? MASTER : declaredOut(name))) says.out = outOf(name);
      if (followOf(name) !== (made ? undefined : declaredFollow(name))) says.volume = followOf(name) ?? null;
      const same =
        chain.length === all.length &&
        chain.every((unit, i) => unit.id === all[i]?.id && unit.key === unit.declaredKey);
      if (!same) {
        says.fx = chain.map((unit) => {
          const entry: GraphFx = { id: unit.id };
          if (!unit.declared) entry.kind = unit.kind;
          if (unit.key !== unit.declaredKey) entry.key = unit.key ?? null;
          if (!unit.declared && unit.ir) entry.ir = unit.ir;
          return entry;
        });
        const dropped = all.filter((unit) => !chain.some((other) => other.id === unit.id));
        if (dropped.length) says.drop = dropped.map((unit) => unit.id);
      }
      if (Object.keys(says).length) out[name] = says;
    }
    return out;
  }

  function loadGraph(next: Readonly<Record<string, GraphBus>> | undefined): void {
    const want = next ?? {};
    for (const name of [...madeBuses]) if (!want[name]?.made) dropBus(name);
    for (const [name, says] of Object.entries(want)) if (says.made && !isBus(name)) makeBus(name, MASTER);
    // The outputs together: a graph that would loop keeps the outputs it has.
    const wanted = new Map<string, string>();
    for (const name of live()) {
      const out = want[name]?.out ?? (madeBuses.has(name) ? MASTER : declaredOut(name));
      wanted.set(name, out === MASTER || (isBus(out) && out !== name) ? out : MASTER);
    }
    const asWanted = (name: string) => wanted.get(name) ?? MASTER;
    if (live().some((name) => loops(name, asWanted(name), asWanted)))
      console.warn(
        "watchpot/sound: a mix file's buses feed each other in a cycle; their outputs are left alone",
      );
    else
      for (const name of live()) {
        const out = asWanted(name);
        if (out === outOf(name)) continue;
        outs.set(name, out);
        sendBus(name);
      }
    for (const name of live()) {
      const was = followOf(name);
      const say = want[name]?.volume;
      if (say === undefined) follows.delete(name);
      else follows.set(name, say);
      if (followOf(name) !== was) touch(levelKey(name), VOLUME_SLEW_MS);
    }
    for (const name of live()) {
      const chain = chainFrom(name, want[name]);
      // A desk effect that is gone takes its settings with it.
      for (const unit of chainOf(name))
        if (!unit.declared && !chain.some((other) => other.id === unit.id))
          forget(
            (_key, target) =>
              target.type !== "level" &&
              target.type !== "send" &&
              target.bus === name &&
              target.id === unit.id,
          );
      setChain(name, chain);
    }
    changes();
  }

  // The game's face.

  const fadeOf = (options: { fadeMs?: number } | undefined): number => {
    const fade = options?.fadeMs ?? SCENE_FADE_MS;
    return Number.isFinite(fade) && fade > 0 ? fade : 0;
  };

  const scene = Object.assign(
    (name: string, options?: { fadeMs?: number }) => {
      if (!scenes.has(name)) return;
      const fade = fadeOf(options);
      const was = current;
      current = name;
      touchLayer(was, fade);
      touchLayer(name, fade);
      changes();
    },
    {
      push(name: string, options?: { fadeMs?: number }): (off?: { fadeMs?: number }) => void {
        if (!scenes.has(name)) return () => {};
        const entry = { name, fadeMs: fadeOf(options) };
        pushed.push(entry);
        touchLayer(name, entry.fadeMs);
        changes();
        return (off) => {
          const at = pushed.indexOf(entry);
          if (at < 0) return;
          pushed.splice(at, 1);
          // Off over its own fade when one is given, else over the fade it came in with.
          touchLayer(name, off?.fadeMs === undefined ? entry.fadeMs : fadeOf(off));
          changes();
        };
      },
    },
  );

  const NO_FX: FxHandle = { set: () => {} };
  const NO_BUS: BusHandle<B> = { fx: () => NO_FX, send: () => {}, level: () => {} };

  function bus(name: BusName<B>): BusHandle<B> {
    if (name !== MASTER && !isBus(name)) return NO_BUS;
    return {
      fx: (slot) => ({
        set(param, raw, slewMs = 0) {
          const key = fxKey(name, slot, param);
          const setting = toWire(param, raw);
          if (!key || setting === undefined) return;
          mix.set(key, setting);
          touch(key, slewMs);
        },
      }),
      send(to, level, slewMs = 0) {
        const key = sendKey(name, to);
        if (!key || !Number.isFinite(level)) return;
        mix.set(key, Math.max(0, level));
        touch(key, slewMs);
      },
      level(db, slewMs = 0) {
        if (!Number.isFinite(db)) return;
        const key = levelKey(name);
        mix.set(key, db);
        touch(key, slewMs);
      },
    };
  }

  return {
    api: {
      bus,
      setBusVolume(name, volume) {
        if ((name !== MASTER && !isBus(name)) || !Number.isFinite(volume)) return;
        volumes.set(name, Math.min(1, Math.max(0, volume)));
        touch(levelKey(name), VOLUME_SLEW_MS);
        for (const other of live()) if (followOf(other) === name) touch(levelKey(other), VOLUME_SLEW_MS);
      },
      busVolume: (name) => volumeOf(name),
      scene,
    },
    index,
    boot() {
      sent.clear();
      dirty.clear();
      irs.clear();
      const records: Uint8Array[] = [];
      const masterGain = recordOf(levelKey(MASTER), 0);
      if (masterGain) records.push(masterGain);
      for (const name of ordered()) {
        const gain = gainOf(name);
        sent.set(levelKey(name), gain);
        records.push(encode("BUS_DEFINE", { bus: index(name), out: index(outOf(name)), gain }));
      }
      for (const name of live())
        chainOf(name).forEach((unit, slot) => {
          records.push(...defineSlot(name, slot, unit));
        });
      records.push(...loadIrs());
      for (const [key, target] of targets)
        if (target.type === "send") {
          const record = recordOf(key, 0);
          if (record) records.push(record);
        }
      port.send(concat(records));
    },
    samples() {
      const records = loadIrs();
      if (records.length && port.up()) port.send(concat(records));
    },
    presence(mine) {
      if (mine === true) return options.presence?.mine ?? UNTOUCHED;
      if (mine === false) return options.presence?.other ?? OTHER;
      return UNTOUCHED;
    },
    target(target) {
      const fail = (): never => {
        throw new Error(`watchpot/sound: a mod route drives ${JSON.stringify(target)}, which does not exist`);
      };
      if ("level" in target)
        return target.bus === MASTER || isBus(target.bus) ? levelKey(target.bus) : fail();
      if ("send" in target) return sendKey(target.bus, target.send) ?? fail();
      return fxKey(target.bus, target.fx, target.param) ?? fail();
    },
    drive(key, driveValue, slewMs) {
      if (!targets.has(key)) return;
      const was = driven.has(key);
      if (driveValue === undefined || !Number.isFinite(driveValue)) driven.delete(key);
      else driven.set(key, driveValue);
      touch(key, slewMs);
      // The desk shows who owns a target: a route starting or ending on one changes that, a value moving does not.
      if (was !== driven.has(key)) changes();
    },
    volume(value) {
      if (!Number.isFinite(value)) return;
      master = Math.max(0, value);
      // At once, as `setVolume` always has; a write already queued for the master goes with it.
      const key = levelKey(MASTER);
      dirty.delete(key);
      const record = port.up() ? recordOf(key, 0) : null;
      if (record) port.send(record);
    },
    desk: deskHold(),
  };

  function deskHold(): MixerDesk {
    const keyOf = (key: string): string | null => {
      if (targets.has(key)) return key;
      if (key.startsWith("level:")) {
        const name = key.slice(6);
        return name === MASTER || isBus(name) ? levelKey(name) : null;
      }
      if (key.startsWith("send:")) {
        const rest = key.slice(5);
        const at = rest.indexOf(">");
        return at < 0 ? null : sendKey(rest.slice(0, at), rest.slice(at + 1));
      }
      if (key.startsWith("fx:")) {
        // From the right: a bus's name is the game's, and may hold a colon; an effect's id and a setting do not.
        const rest = key.slice(3);
        const p = rest.lastIndexOf(":");
        const s = p > 0 ? rest.lastIndexOf(":", p - 1) : -1;
        if (s <= 0) return null;
        return fxKey(rest.slice(0, s), rest.slice(s + 1, p), rest.slice(p + 1));
      }
      return null;
    };
    const sceneName = (layer: string): string | null => {
      if (!layer.startsWith("scene:")) return null;
      const name = layer.slice(6);
      return scenes.has(name) ? name : null;
    };
    const busGain = (name: string, map: Map<string, number>, gain: number, slewMs: number) => {
      if (name !== MASTER && !isBus(name)) return;
      if (gain === 1) map.delete(name);
      else map.set(name, gain);
      touch(levelKey(name), slewMs);
    };
    const unitIn = (name: string, id: string): Unit | undefined =>
      chainOf(name).find((unit) => unit.id === id);
    const replace = (name: string, id: string, patch: Partial<Unit>): boolean => {
      if (!unitIn(name, id)) return false;
      const moved = setChain(
        name,
        chainOf(name).map((unit) => (unit.id === id ? { ...unit, ...patch } : unit)),
      );
      if (moved) changes();
      return true;
    };
    return {
      names: live,
      indexOf: (name) => (name === MASTER ? 0 : slots.indexOf(name) + 1 || -1),
      isBus: (name) => name === MASTER || isBus(name),
      made: (name) => madeBuses.has(name),
      resolve: (name) => (name === MASTER ? MASTER : name !== undefined && isBus(name) ? name : "sfx"),
      outOf: (name) => (name === MASTER ? null : outOf(name)),
      follows: (name) => (name === MASTER ? null : (followOf(name) ?? null)),
      follow(name, of) {
        if (!isBus(name) || (of !== null && (!isBus(of) || of === name))) return false;
        if ((of ?? undefined) === followOf(name)) return true;
        const declares = madeBuses.has(name) ? undefined : declaredFollow(name);
        if ((of ?? undefined) === declares) follows.delete(name);
        else follows.set(name, of);
        touch(levelKey(name), VOLUME_SLEW_MS);
        changes();
        return true;
      },
      sendsOf(name) {
        if (name === MASTER) return [];
        return live().filter((to) => {
          const key = `send:${name}>${to}`;
          return targets.has(key) && (value(key) ?? 0) > 0;
        });
      },
      dropped: (name) =>
        declaredOf(name)
          .filter((unit) => !chainOf(name).some((other) => other.id === unit.id))
          .map((unit) => ({ id: unit.id, kind: unit.kind, declared: true })),
      chain: (name) =>
        chainOf(name).map((unit) => ({
          id: unit.id,
          kind: unit.kind,
          declared: unit.declared,
          ...(unit.key !== undefined ? { key: unit.key } : {}),
          ...(unit.ir !== undefined ? { ir: unit.ir } : {}),
        })),
      scenes: () => ({
        names: [...scenes.keys()],
        current,
        pushed: pushed.map((entry) => entry.name),
        labels,
      }),
      key: keyOf,
      get(layer, raw) {
        const key = keyOf(raw);
        if (!key) return undefined;
        if (layer === "live") {
          // An effect setting nothing says any more stays where it was: what was last sent is what is in force.
          return value(key) ?? (targets.get(key)?.type === "fx" ? sent.get(key) : undefined);
        }
        if (layer === "mix") return mixOf(key);
        const name = sceneName(layer);
        return name === null ? undefined : sceneOf(name, key);
      },
      owner(raw) {
        const key = keyOf(raw);
        if (!key) return "default";
        if (driven.has(key)) return "route";
        for (let i = pushed.length - 1; i >= 0; i--) {
          const entry = pushed[i];
          if (entry && sceneOf(entry.name, key) !== undefined) return `scene:${entry.name}`;
        }
        if (current !== null && sceneOf(current, key) !== undefined) return `scene:${current}`;
        return mixOf(key) !== undefined ? "mix" : "default";
      },
      write(layer, raw, next, slewMs) {
        const key = keyOf(raw);
        if (!key) return false;
        let map: Map<string, number> | undefined;
        if (layer === "mix") map = deskMix;
        else {
          const name = sceneName(layer);
          if (name === null) return false;
          map = deskScenes.get(name);
          if (!map) {
            map = new Map();
            deskScenes.set(name, map);
          }
        }
        if (next === undefined || !Number.isFinite(next)) map.delete(key);
        else map.set(key, targets.get(key)?.type === "send" ? Math.max(0, next) : next);
        touch(key, slewMs);
        return true;
      },
      says(layer) {
        const name = sceneName(layer);
        if (layer !== "mix" && name === null) return new Map();
        const under = name === null ? mix : scenes.get(name);
        const over = name === null ? deskMix : deskScenes.get(name);
        return new Map([...(under ?? []), ...(over ?? [])]);
      },
      trim: (name, db, slewMs) => busGain(name, trims, db === 0 ? 1 : dbGain(db), slewMs),
      listen: (name, gain, slewMs) => busGain(name, listening, gain, slewMs),
      onChange: (fn) => void changed.add(fn),

      addBus(name, out = MASTER) {
        if (!makeBus(name, out)) return false;
        changes();
        return true;
      },
      removeBus(name) {
        if (!madeBuses.has(name) || used(name)) return false;
        dropBus(name);
        changes();
        return true;
      },
      setOut(name, out) {
        if (!isBus(name) || name === out || (out !== MASTER && !isBus(out))) return false;
        if (out === outOf(name)) return true;
        if (loops(name, out)) return false;
        outs.set(name, out);
        sendBus(name);
        changes();
        return true;
      },
      fxAdd(name, kind, at) {
        if (!isBus(name) || !(kind in KIND)) return null;
        const chain = chainOf(name);
        if (chain.length >= LIMITS.FX_SLOTS) return null;
        const unit: Unit = {
          id: freshId(name, kind),
          kind,
          declared: false,
          key: undefined,
          declaredKey: undefined,
          ir: kind === "convolver" ? "" : undefined,
        };
        const place = at === undefined || !Number.isFinite(at) ? chain.length : Math.round(at);
        const next = [...chain];
        next.splice(Math.min(chain.length, Math.max(0, place)), 0, unit);
        setChain(name, next);
        changes();
        return unit.id;
      },
      fxRemove(name, id) {
        const unit = unitIn(name, id);
        if (!unit) return false;
        setChain(
          name,
          chainOf(name).filter((other) => other !== unit),
        );
        if (!unit.declared)
          forget(
            (_key, target) =>
              target.type !== "level" && target.type !== "send" && target.bus === name && target.id === id,
          );
        changes();
        return true;
      },
      fxRestore(name, id) {
        const all = declaredOf(name);
        const at = all.findIndex((unit) => unit.id === id);
        const chain = chainOf(name);
        const unit = all[at];
        if (!unit || chain.some((other) => other.id === id) || chain.length >= LIMITS.FX_SLOTS) return false;
        let after = -1;
        for (let i = at - 1; i >= 0 && after < 0; i--)
          after = chain.findIndex((other) => other.id === all[i]?.id);
        const next = [...chain];
        next.splice(after + 1, 0, { ...unit, key: unit.declaredKey });
        setChain(name, next);
        changes();
        return true;
      },
      fxMove(name, id, to) {
        const chain = chainOf(name);
        const from = chain.findIndex((unit) => unit.id === id);
        if (from < 0 || !Number.isFinite(to)) return false;
        const next = [...chain];
        const [unit] = next.splice(from, 1);
        if (!unit) return false;
        next.splice(Math.min(next.length, Math.max(0, Math.round(to))), 0, unit);
        if (setChain(name, next)) changes();
        return true;
      },
      fxKey(name, id, key) {
        const unit = unitIn(name, id);
        if (unit?.kind !== "compressor") return false;
        if (key !== null && (!isBus(key) || key === name)) return false;
        return replace(name, id, { key: key ?? undefined });
      },
      fxIr(name, id, sample) {
        const unit = unitIn(name, id);
        if (unit?.kind !== "convolver" || unit.declared) return false;
        return replace(name, id, { ir: sample });
      },
      graph,
      loadGraph,
      limits: () => ({ fx: LIMITS.FX_SLOTS, buses: LIMITS.MAX_BUSES - 1 }),
    };
  }
}
