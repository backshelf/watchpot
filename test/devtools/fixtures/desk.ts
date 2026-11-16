// A scripted fake `Desk` for the mix desk's tests and for looking at its window (`scripts/desk-harness.ts`): a dozen
// buses with two returns and one the desk made, an effect of every kind, five declared scenes (one current, one pushed
// over it, two never in force), sources of every kind with a cue of three roles, tunables with and without cells, two
// packs with their samples, and meters with gain reduction. It holds what it is told like the real desk (layers,
// owners, the graph, routes, takes, staged recordings, undo, the file and its dirty state) and logs every call.
// `runScript` makes it play; `fakeSampleHost` is the host a game's dev server would be.
import type {
  Desk,
  DeskBus,
  DeskChannel,
  DeskMeter,
  DeskSample,
  DeskStaged,
  DeskTunable,
  GraphBus,
  GraphFx,
  MixFile,
  MixFileV1,
  SampleEntry,
  SampleHost,
  SampleRequest,
  SampleResult,
  SampleSource,
} from "../../../src/sound/desk";
import { DESK_FX, deskParam } from "../../../src/sound/desk-fx";
import type { FxDef, Take } from "../../../src/sound/types";

type Kind = FxDef["kind"];
interface Unit {
  id: string;
  kind: Kind;
  declared: boolean;
  key?: string;
  ir?: string;
}

const MASTER = "master";
const MIX = "mix";
const LIMITS = { fx: 8, buses: 15 };

/** [name, out, effects]: an effect is a kind, or `[kind, key bus or response]`. */
const BUSES: readonly [string, string | null, readonly (Kind | [Kind, string])[]][] = [
  [MASTER, null, ["compressor", "stereo"]],
  ["music", MASTER, ["eq", ["compressor", "voice"], "tape"]],
  ["pads", "music", ["filter", "saturator"]],
  ["drums", MASTER, ["compressor", "crush"]],
  ["ambience", MASTER, ["filter", "stereo"]],
  ["sfx", MASTER, ["filter"]],
  ["ui", MASTER, ["filter", "freeze"]],
  ["ticks", MASTER, []],
  ["voice", MASTER, ["compressor", "eq"]],
  ["foley", MASTER, ["filter"]],
  ["room", MASTER, ["reverb", ["convolver", "kit/hall"]]],
  ["echo", MASTER, ["delay", "filter"]],
];

const DECLARED: Record<string, Record<string, number>> = {
  mix: {
    "level:master": 0,
    "level:music": -6,
    "level:pads": -10,
    "level:drums": -4,
    "level:ambience": -14,
    "level:sfx": -3,
    "level:ui": -8,
    "level:ticks": -18,
    "level:voice": -2,
    "level:foley": -12,
    "level:room": -9,
    "level:echo": -12,
    "send:sfx>room": 0.3,
    "send:ambience>room": 0.5,
    "send:pads>room": 0.4,
    "send:voice>echo": 0.2,
    "send:ui>echo": 0.15,
    "fx:music:1:threshold": -30,
    "fx:music:1:range": 9,
  },
  "scene:tier1": { "level:music": -8, "fx:music:0:lowGain": -3, "level:drums": -12 },
  "scene:tier2": { "level:music": -5, "fx:music:1:range": 12, "level:drums": -6 },
  "scene:tier3": { "level:drums": -2, "fx:pads:0:cutoff": 6000 },
  "scene:dialog": { "level:ambience": -24, "fx:pads:0:cutoff": 1200, "send:sfx>room": 0.1 },
  "scene:storm": { "level:ambience": -4 },
};
const SCENES = ["tier1", "tier2", "tier3", "dialog", "storm"] as const;
const LABELS: Record<string, string> = {
  tier1: "Tier 1",
  tier2: "Tier 2",
  tier3: "Tier 3",
  dialog: "Dialog",
  storm: "Storm",
};

interface Src {
  id: string;
  bus: string;
  loops?: boolean;
  /** A cue's roles: the buses its plays ask for. */
  roles?: readonly string[];
  /** A cue's declared sends. */
  sends?: Readonly<Record<string, number>>;
  takes?: readonly Take[];
}

/** In the order they are first heard. */
const ROSTER: readonly Src[] = [
  { id: "stem:theme/bass", bus: "music", loops: true },
  { id: "stem:theme/drums", bus: "drums", loops: true },
  { id: "stem:theme/pads", bus: "pads", loops: true },
  { id: "gen:wind", bus: "ambience", loops: true },
  { id: "cue:click", bus: "ui", roles: ["ui"], takes: [{ sample: "kit/click" }] },
  {
    id: "cue:chime",
    bus: "sfx",
    roles: ["sfx", "ui", "voice"],
    sends: { room: 0.3 },
    takes: [
      { sample: "kit/chime-a", weight: 2 },
      { sample: "kit/chime-b", level: -3 },
    ],
  },
  { id: "cue:tick", bus: "ticks", roles: ["ticks"], takes: [{ sample: "kit/tick" }] },
  {
    id: "cue:pop",
    bus: "sfx",
    roles: ["sfx"],
    sends: { room: 0.2, echo: 0.1 },
    takes: [{ sample: "kit/pop" }],
  },
  { id: "cue:step", bus: "foley", roles: ["foley"], takes: [{ sample: "kit/step" }] },
  { id: "voice:narrator", bus: "voice" },
  { id: "grain:shimmer", bus: "pads", loops: true },
  { id: "cue:confirm", bus: "ui", roles: ["ui", "sfx"], takes: [{ sample: "kit/confirm" }] },
  { id: "cue:whoosh", bus: "sfx", roles: ["sfx"], takes: [{ sample: "kit/whoosh" }] },
  { id: "stem:theme/lead", bus: "music", loops: true },
  { id: "gen:noise#1", bus: "ambience", loops: true },
  { id: "cue:alarm", bus: "sfx", roles: ["sfx"], takes: [{ sample: "kit/alarm" }] },
  { id: "grain:dust", bus: "ambience", loops: true },
  { id: "voice:crowd", bus: "voice", loops: true },
  { id: "cue:latch", bus: "foley", roles: ["foley"], takes: [{ sample: "kit/latch" }] },
];

const shot = (seconds: number, lufs = -18): SampleEntry => ({
  seconds,
  channels: 1,
  lufs,
  peak: 0.7,
  kind: "shot",
});
const loop = (bars: number): SampleEntry => ({
  seconds: (bars * 4 * 60) / 96,
  channels: 2,
  lufs: -16,
  peak: 0.8,
  kind: "loop",
  bars,
});
const SAMPLES: Readonly<Record<string, SampleEntry>> = {
  "theme/bass": loop(4),
  "theme/drums": loop(2),
  "theme/pads": loop(8),
  "theme/lead": loop(4),
  "kit/click": shot(0.08),
  "kit/chime-a": { ...shot(1.4), rootHz: 880 },
  "kit/chime-b": { ...shot(1.1), rootHz: 660 },
  "kit/tick": shot(0.05, -24),
  "kit/pop": shot(0.2),
  "kit/step": shot(0.3),
  "kit/confirm": shot(0.5),
  "kit/whoosh": shot(0.9),
  "kit/alarm": shot(1.8),
  "kit/latch": shot(0.25),
  "kit/hall": { seconds: 2.4, channels: 2, lufs: -20, peak: 0.5, kind: "ir" },
  "kit/plate": { seconds: 1.2, channels: 2, lufs: -20, peak: 0.5, kind: "ir" },
};

const SECTIONS = ["intro", "verse", "lift", "peak"] as const;
const STEMS = ["bass", "drums", "pads", "lead"] as const;
const SCORE: readonly number[][] = [
  [0, 0, 1, 0],
  [1, 0.6, 1, 0],
  [1, 1, 0.8, 0.5],
  [1, 1, 1, 1],
];

const TUNABLES: readonly Omit<DeskTunable, "value">[] = [
  ...SECTIONS.flatMap((row, r) =>
    STEMS.map((column, c) => ({
      id: `score.${row}.${column}`,
      group: "Score",
      label: `${row}: ${column}`,
      min: 0,
      max: 1,
      step: 0.05,
      initial: SCORE[r]?.[c] ?? 0,
      hint: "A stem's level in a section of the score; heard from the next bar.",
      cell: { row, column },
    })),
  ),
  {
    id: "ticks.rate",
    group: "Ticks",
    label: "Rate of the stream's ticks at full income",
    min: 1,
    max: 30,
    step: 0.5,
    unit: "Hz",
    initial: 8,
    hint: "How many ticks a second the counter makes when it runs flat out; heard at once.",
  },
  {
    id: "ticks.level",
    group: "Ticks",
    label: "Level",
    min: -40,
    max: 0,
    step: 0.5,
    unit: "dB",
    initial: -28,
    hint: "Each tick's level before its bus.",
  },
  {
    id: "ticks.spread",
    group: "Ticks",
    label: "Pitch spread between one tick and the next",
    min: 0,
    max: 12,
    step: 0.1,
    unit: "st",
    initial: 2,
  },
  { id: "ticks.swing", group: "Ticks", label: "Swing", min: 0, max: 0.5, step: 0.01, initial: 0.1 },
  {
    id: "amb.duck",
    group: "Ambience",
    label: "How far the room ducks under a voice line",
    min: 0,
    max: 24,
    step: 0.5,
    unit: "dB",
    initial: 6,
    hint: "The most the ambience is pushed down while the narrator speaks; heard on the next line.",
  },
  {
    id: "amb.wind",
    group: "Ambience",
    label: "Wind level",
    min: -48,
    max: 0,
    step: 0.5,
    unit: "dB",
    initial: -20,
  },
  { id: "amb.rain", group: "Ambience", label: "Rain chance", min: 0, max: 1, step: 0.01, initial: 0.25 },
  { id: "amb.fade", group: "Ambience", label: "Fade", min: 0, max: 10, step: 0.1, unit: "s", initial: 2 },
  {
    id: "music.xfade",
    group: "Music",
    label: "Crossfade between sections",
    min: 0,
    max: 8,
    step: 0.1,
    unit: "s",
    initial: 1.5,
  },
  { id: "music.gap", group: "Music", label: "Stinger gap", min: 0, max: 30, step: 1, unit: "s", initial: 12 },
  { id: "music.lift", group: "Music", label: "Lift", min: -6, max: 6, step: 0.1, unit: "dB", initial: 0 },
];

export interface FakeDesk extends Desk {
  /** Every call that changes or plays something, in order: `[method, ...args]`. */
  calls: unknown[][];
  /** Starts a source (heard for the first time if it is new); a cue's role by `cue:<key>@<role>`. */
  sound(id: string, ringSeconds?: number): void;
  /** Stops a source sounding. */
  hush(id: string): void;
  setScenes(current: string | null, pushed: readonly string[]): void;
  /** Each source in the order it is first heard, heard or not. */
  readonly roster: readonly string[];
  /** Advances the meters' and sources' clock by `dt` seconds (the script calls it). */
  step(dt: number): void;
}

export interface FakeDeskOptions {
  /** How many of the roster's sources have already sounded (default 12). */
  heard?: number;
  /** Writes the desk starts with, as if the game had been made with this file. */
  file?: MixFile | MixFileV1;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const sortedOf = <T>(entries: Iterable<[string, T]>): Record<string, T> =>
  Object.fromEntries([...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** What the fake starts with: a trim, writes in the mix and in a scene never in force, a route, a made bus. */
export const STARTING_FILE: MixFile = {
  version: 2,
  layers: {
    mix: { "level:sfx": -4, "trim:drums": -1.5, "ch:cue:chime": -3, "level:glue": -3 },
    "scene:storm": { "level:ambience": -6 },
    "scene:tier2": { "tune:amb.duck": 12 },
  },
  graph: {
    buses: { glue: { made: true, out: "music", fx: [{ id: "compressor-1", kind: "compressor" }] } },
    routes: { "stem:theme/lead": "glue" },
  },
};

const isOwn = (key: string) =>
  key.startsWith("trim:") || key.startsWith("ch:") || key.startsWith("chsend:") || key.startsWith("tune:");

export function fakeDesk(options: FakeDeskOptions = {}): FakeDesk {
  const calls: unknown[][] = [];
  const fns = new Set<() => void>();
  const notify = () => {
    for (const fn of [...fns]) fn();
  };
  const modRoutes = new Set(["level:foley", "fx:ambience:0:cutoff"]);
  let current: string | null = "tier2";
  let pushed: string[] = ["dialog"];
  const writes = new Map<string, Map<string, number>>();
  let names: string[] = [];
  const outs = new Map<string, string>();
  const made = new Set<string>();
  const chains = new Map<string, Unit[]>();
  const routes = new Map<string, string>();
  const takesOver = new Map<string, Take[]>();
  const stagedBy = new Map<string, DeskStaged & { side: "a" | "b" }>();
  const kept = new Map<string, SampleEntry>();
  const mutes = new Set<string>();
  const solos = new Set<string>();
  let time = 100;
  const heard: string[] = [];
  const state = new Map<string, { lastAt: number; until: number }>();
  const env = new Map<string, number>();

  const declaredChain = (bus: string): Unit[] =>
    (BUSES.find(([name]) => name === bus)?.[2] ?? []).map((def, i) => {
      const [kind, arg] = Array.isArray(def) ? def : [def, undefined];
      return {
        id: String(i),
        kind,
        declared: true,
        ...(arg !== undefined ? (kind === "convolver" ? { ir: arg } : { key: arg }) : {}),
      };
    });
  const declaredOut = (bus: string) => BUSES.find(([name]) => name === bus)?.[1] ?? MASTER;
  const isBus = (name: string) => name === MASTER || names.includes(name);
  const srcOf = (id: string) =>
    ROSTER.find((s) => s.id === (id.includes("@") ? id.slice(0, id.indexOf("@")) : id));
  const cueSrc = (key: string) => ROSTER.find((s) => s.id === `cue:${key}`);

  function loadGraph(graph: Readonly<Record<string, GraphBus>> | undefined) {
    names = BUSES.map(([name]) => name).filter((n) => n !== MASTER);
    outs.clear();
    made.clear();
    chains.clear();
    for (const [name] of BUSES) {
      chains.set(name, declaredChain(name));
      if (name !== MASTER) outs.set(name, declaredOut(name));
    }
    for (const [name, g] of Object.entries(graph ?? {})) {
      if (g.made) {
        names.push(name);
        made.add(name);
        outs.set(name, g.out ?? MASTER);
        chains.set(name, []);
      } else if (g.out !== undefined) outs.set(name, g.out);
      if (!g.fx) continue;
      const declared = chains.get(name) ?? [];
      chains.set(
        name,
        g.fx.flatMap((f): Unit[] => {
          const from = declared.find((u) => u.id === f.id);
          if (!f.kind && !from) return [];
          const unit: Unit = from ? { ...from } : { id: f.id, kind: f.kind as Kind, declared: false };
          if (f.key === null) delete unit.key;
          else if (f.key !== undefined) unit.key = f.key;
          if (f.ir !== undefined) unit.ir = f.ir;
          return [unit];
        }),
      );
    }
  }
  function graph(): Record<string, GraphBus> {
    const out: Record<string, GraphBus> = {};
    for (const name of [MASTER, ...names]) {
      const chain = chains.get(name) ?? [];
      const declared = made.has(name) ? [] : declaredChain(name);
      const g: GraphBus = {};
      if (made.has(name)) g.made = true;
      const to = outs.get(name);
      if (name !== MASTER && to !== undefined && to !== (made.has(name) ? MASTER : declaredOut(name)))
        g.out = to;
      const same =
        chain.length === declared.length &&
        chain.every(
          (u, i) => u.id === declared[i]?.id && u.key === declared[i]?.key && u.ir === declared[i]?.ir,
        );
      if (!same) {
        g.fx = chain.map((u): GraphFx => {
          const from = declared.find((d) => d.id === u.id);
          return {
            id: u.id,
            ...(u.declared ? {} : { kind: u.kind }),
            ...(u.key !== from?.key ? { key: u.key ?? null } : {}),
            ...(u.ir !== undefined && u.ir !== from?.ir ? { ir: u.ir } : {}),
          };
        });
        const drop = declared.filter((d) => !chain.some((u) => u.id === d.id)).map((d) => d.id);
        if (drop.length) g.drop = drop;
      }
      if (Object.keys(g).length) out[name] = g;
    }
    return out;
  }

  const toV2 = (f: MixFile | MixFileV1): MixFile => {
    if (f.version === 2) return f;
    const layers: Record<string, Record<string, number>> = clone(f.layers ?? {});
    const mix = { ...layers.mix };
    for (const [bus, db] of Object.entries(f.trims ?? {})) mix[`trim:${bus}`] = db;
    for (const [id, db] of Object.entries(f.channels ?? {})) mix[`ch:${id}`] = db;
    for (const [id, v] of Object.entries(f.tunables ?? {})) mix[`tune:${id}`] = v;
    if (Object.keys(mix).length) layers.mix = mix;
    return { version: 2, layers };
  };
  const list = (id: string) => {
    const at = id.indexOf("@");
    if (at > 0) list(id.slice(0, at));
    if (!heard.includes(id)) heard.push(id);
  };
  const restore = (given: MixFile | MixFileV1) => {
    const f = toV2(given);
    writes.clear();
    for (const [layer, keys] of Object.entries(f.layers ?? {}))
      writes.set(layer, new Map(Object.entries(keys)));
    loadGraph(f.graph?.buses);
    routes.clear();
    for (const [id, bus] of Object.entries(f.graph?.routes ?? {})) routes.set(id, bus);
    takesOver.clear();
    for (const [key, cue] of Object.entries(f.cues ?? {})) takesOver.set(key, clone(cue.takes));
    for (const map of writes.values())
      for (const key of map.keys()) {
        if (key.startsWith("ch:")) list(key.slice(3));
        else if (key.startsWith("chsend:")) list(key.slice(7, key.lastIndexOf(">")));
      }
    for (const id of routes.keys()) list(id);
  };
  const file = (): MixFile => {
    const out: MixFile = { version: 2 };
    const layers = [...writes]
      .filter(([, map]) => map.size)
      .map(([l, map]): [string, Record<string, number>] => [l, sortedOf(map)]);
    if (layers.length) out.layers = sortedOf(layers);
    const buses = graph();
    if (Object.keys(buses).length || routes.size)
      out.graph = {
        ...(Object.keys(buses).length ? { buses: sortedOf(Object.entries(buses)) } : {}),
        ...(routes.size ? { routes: sortedOf(routes) } : {}),
      };
    if (takesOver.size) out.cues = sortedOf([...takesOver].map(([k, takes]) => [k, { takes: clone(takes) }]));
    return out;
  };

  ROSTER.forEach((src, i) => {
    const at = time - (ROSTER.length - i);
    state.set(src.id, { lastAt: at, until: src.loops ? Number.POSITIVE_INFINITY : 0 });
    for (const role of src.roles ?? []) state.set(`${src.id}@${role}`, { lastAt: at, until: 0 });
  });
  for (const src of ROSTER.slice(0, options.heard ?? 12)) {
    heard.push(src.id);
    for (const role of src.roles ?? []) heard.push(`${src.id}@${role}`);
  }
  restore(options.file ?? STARTING_FILE);
  let baseline = JSON.stringify(file());

  // Layers.

  const stack = () => [
    ...[...pushed].reverse().map((n) => `scene:${n}`),
    ...(current === null ? [] : [`scene:${current}`]),
    MIX,
  ];
  const layerValue = (layer: string, key: string) =>
    writes.get(layer)?.get(key) ?? (isOwn(key) ? undefined : DECLARED[layer]?.[key]);
  const said = (key: string) => {
    for (const layer of stack()) {
      const value = layerValue(layer, key);
      if (value !== undefined) return { layer, value };
    }
    return undefined;
  };
  const paramOf = (key: string) => {
    const m = /^fx:([^:]+):([^:]+):(.+)$/.exec(key);
    const unit = m ? chains.get(m[1] as string)?.find((u) => u.id === m[2]) : undefined;
    return unit && m
      ? { unit, param: deskParam(unit.kind, m[3] as string), name: m[3] as string }
      : undefined;
  };
  const initialOf = (key: string): number | undefined => {
    if (key.startsWith("level:") || key.startsWith("send:")) return 0;
    if (key.startsWith("trim:") || key.startsWith("ch:")) return 0;
    if (key.startsWith("tune:")) return TUNABLES.find((t) => t.id === key.slice(5))?.initial;
    if (key.startsWith("chsend:")) {
      const at = key.lastIndexOf(">");
      return srcOf(key.slice(7, at))?.sends?.[key.slice(at + 1)] ?? 0;
    }
    const p = paramOf(key);
    return p?.name === "on" ? 1 : p?.param?.initial;
  };
  const owner = (key: string) =>
    !isOwn(key) && modRoutes.has(key) ? "route" : (said(key)?.layer ?? "default");
  const live = (key: string) => {
    // A mod route holds a value of its own, moving a little so a person sees it is driven.
    if (owner(key) === "route") {
      const p = paramOf(key)?.param;
      return p ? Math.sqrt(p.min * p.max) * (1 + 0.4 * Math.sin(time)) : -14 + 3 * Math.sin(time);
    }
    return said(key)?.value ?? initialOf(key);
  };

  // Undo: the file before each change; writes to one key close together are one step.

  const undone: string[] = [];
  const redone: string[] = [];
  let lastTag = "";
  let lastAt = Number.NEGATIVE_INFINITY;
  const change = (tag: string, run: () => boolean): boolean => {
    const joins = tag !== "" && tag === lastTag && time - lastAt <= 0.6 && undone.length > 0;
    const before = joins ? null : JSON.stringify(file());
    if (!run()) return false;
    if (before !== null) undone.push(before);
    redone.length = 0;
    lastTag = tag;
    lastAt = time;
    notify();
    return true;
  };
  const step = (from: string[], to: string[]) => {
    const text = from.pop();
    if (text === undefined) return;
    to.push(JSON.stringify(file()));
    lastTag = "";
    restore(JSON.parse(text) as MixFile);
    notify();
  };

  // Sources.

  const takesOf = (key: string): readonly Take[] => takesOver.get(key) ?? cueSrc(key)?.takes ?? [];
  const sendsOf = (id: string): { to: string; level: number }[] => {
    const src = srcOf(id);
    const ids = id.includes("@") ? [id, id.slice(0, id.indexOf("@"))] : [id];
    const levelOf = (to: string) => {
      for (const each of ids) {
        const v = said(`chsend:${each}>${to}`)?.value;
        if (v !== undefined) return v;
      }
      return undefined;
    };
    const out = Object.entries(src?.sends ?? {})
      .slice(0, 2)
      .map(([to, level]) => ({ to, level: levelOf(to) ?? level }));
    for (const map of writes.values())
      for (const key of map.keys()) {
        if (out.length >= 2 || !key.startsWith("chsend:")) continue;
        const at = key.lastIndexOf(">");
        const to = key.slice(at + 1);
        if (!ids.includes(key.slice(7, at)) || out.some((s) => s.to === to) || !isBus(to)) continue;
        const level = levelOf(to) ?? 0;
        if (level > 0) out.push({ to, level });
      }
    return out;
  };
  const channel = (id: string): DeskChannel => {
    const cut = id.indexOf(":");
    const kind = id.slice(0, cut) as DeskChannel["kind"];
    const name = id.slice(cut + 1);
    const at = id.indexOf("@");
    const parent = at > 0 ? id.slice(0, at) : undefined;
    const role = at > 0 ? id.slice(at + 1) : undefined;
    const src = srcOf(id);
    const s = state.get(id) ?? { lastAt: 0, until: 0 };
    const route = routes.get(id);
    const asked = role ?? src?.bus ?? "sfx";
    const cueKey = kind === "cue" ? (parent ?? id).slice(4) : "";
    const roleSounding = (src?.roles ?? []).some((r) => (state.get(`${id}@${r}`)?.until ?? 0) > time);
    return {
      id,
      kind,
      name,
      ...(parent !== undefined ? { parent } : {}),
      ...(role !== undefined ? { role } : {}),
      bus: route ?? (parent !== undefined ? routes.get(parent) : undefined) ?? asked,
      ...(route !== undefined ? { route } : {}),
      sends: kind === "cue" ? sendsOf(id) : [],
      samples:
        kind === "stem" ? [name] : kind === "cue" ? [...new Set(takesOf(cueKey).map((t) => t.sample))] : [],
      trim: said(`ch:${id}`)?.value ?? 0,
      muted: mutes.has(id),
      soloed: solos.has(id),
      sounding: s.until > time || (parent === undefined && roleSounding),
      lastAt: s.lastAt,
    };
  };

  const used = (bus: string) =>
    [...outs.values()].includes(bus) ||
    [...routes.values()].includes(bus) ||
    [...chains.values()].some((chain) => chain.some((u) => u.key === bus)) ||
    [MASTER, ...names].some((from) => (live(`send:${from}>${bus}`) ?? 0) > 0);
  const loops = (bus: string, out: string) => {
    for (
      let at: string | undefined = out, hops = 0;
      at && at !== MASTER && hops < 32;
      at = outs.get(at), hops++
    )
      if (at === bus) return true;
    return false;
  };
  const sampleEntry = (key: string) => kept.get(key) ?? SAMPLES[key];

  /** The bus whose player volume each bus takes too. */
  const followed = new Map<string, string>();
  /** Declared effects taken out of their chains, by bus. */
  const removed = new Map<string, { id: string; kind: FxDef["kind"]; declared: boolean }[]>();

  const desk: FakeDesk = {
    calls,
    roster: ROSTER.map((s) => s.id),
    buses: (): DeskBus[] =>
      [MASTER, ...names].map((name) => ({
        name,
        made: made.has(name),
        out: name === MASTER ? null : (outs.get(name) ?? MASTER),
        volume: followed.get(name) ?? null,
        sends: name === MASTER ? [] : names.filter((n) => n !== name),
        dropped: (removed.get(name) ?? []).map(({ id, kind }) => ({ id, kind })),
        fx: (chains.get(name) ?? []).map((u, slot) => ({
          slot,
          id: u.id,
          kind: u.kind,
          declared: u.declared,
          ...(u.key !== undefined ? { key: u.key } : {}),
          ...(u.ir !== undefined ? { ir: u.ir } : {}),
          params: DESK_FX[u.kind],
        })),
        trim: said(`trim:${name}`)?.value ?? 0,
        muted: mutes.has(`bus:${name}`),
        soloed: solos.has(`bus:${name}`),
      })),
    scenes: () => ({ names: [...SCENES], current, pushed: [...pushed], labels: LABELS }),
    channels: () =>
      heard
        .filter((id) => !id.includes("@"))
        .flatMap((id) => [id, ...heard.filter((h) => h.startsWith(`${id}@`))])
        .map(channel),
    tunables: () => TUNABLES.map((t) => ({ ...t, value: said(`tune:${t.id}`)?.value ?? t.initial })),
    get(layer, key) {
      return layer === "live" ? live(key) : layerValue(layer, key);
    },
    owner,
    set(layer, key, value) {
      calls.push(["set", layer, key, value]);
      change(`set:${layer}:${key}`, () => {
        if (layer !== MIX && !SCENES.some((n) => `scene:${n}` === layer)) return false;
        let map = writes.get(layer);
        if (value === undefined) map?.delete(key);
        else {
          if (!map) {
            map = new Map();
            writes.set(layer, map);
          }
          map.set(key, value);
          if (key.startsWith("ch:")) list(key.slice(3));
        }
        return true;
      });
    },
    copyLayer(from, to) {
      calls.push(["copyLayer", from, to]);
      change("", () => {
        const says = new Map([...Object.entries(DECLARED[from] ?? {}), ...(writes.get(from) ?? [])]);
        const into = writes.get(to) ?? new Map<string, number>();
        writes.set(to, into);
        for (const [key, value] of says) into.set(key, value);
        return true;
      });
    },
    trim(bus, db) {
      desk.set(MIX, `trim:${bus}`, db === 0 ? undefined : db);
    },
    channelTrim(id, db) {
      desk.set(MIX, `ch:${id}`, db === 0 ? undefined : db);
    },

    addBus(name, o) {
      calls.push(["addBus", name, o]);
      return change("", () => {
        if (!name || isBus(name) || names.length >= LIMITS.buses) return false;
        names.push(name);
        made.add(name);
        outs.set(name, o?.out ?? MASTER);
        chains.set(name, []);
        return true;
      });
    },
    removeBus(name) {
      calls.push(["removeBus", name]);
      return change("", () => {
        if (!made.has(name) || used(name)) return false;
        names = names.filter((n) => n !== name);
        made.delete(name);
        outs.delete(name);
        chains.delete(name);
        for (const map of writes.values())
          for (const key of [...map.keys()])
            if (
              key === `level:${name}` ||
              key === `trim:${name}` ||
              key.startsWith(`fx:${name}:`) ||
              key.includes(`:${name}>`) ||
              key.endsWith(`>${name}`)
            )
              map.delete(key);
        return true;
      });
    },
    setOut(bus, out) {
      calls.push(["setOut", bus, out]);
      return change("", () => {
        if (!names.includes(bus) || bus === out || !isBus(out) || loops(bus, out)) return false;
        outs.set(bus, out);
        return true;
      });
    },
    setVolume(bus, of) {
      calls.push(["setVolume", bus, of]);
      return change("", () => {
        if (!names.includes(bus) || of === bus) return false;
        if (of === null) followed.delete(bus);
        else followed.set(bus, of);
        return true;
      });
    },
    fxAdd(bus, kind, at) {
      calls.push(["fxAdd", bus, kind, at]);
      let id: string | null = null;
      change("", () => {
        const chain = chains.get(bus);
        if (!chain || chain.length >= LIMITS.fx) return false;
        let n = 1;
        while (chain.some((u) => u.id === `${kind}-${n}`)) n++;
        id = `${kind}-${n}`;
        chain.splice(at ?? chain.length, 0, { id, kind, declared: false });
        return true;
      });
      return id;
    },
    fxRemove(bus, id) {
      calls.push(["fxRemove", bus, id]);
      return change("", () => {
        const chain = chains.get(bus);
        const at = chain?.findIndex((u) => u.id === id) ?? -1;
        if (!chain || at < 0) return false;
        const [unit] = chain.splice(at, 1);
        if (unit?.declared) removed.set(bus, [...(removed.get(bus) ?? []), unit]);
        if (unit && !unit.declared)
          for (const map of writes.values())
            for (const key of [...map.keys()]) if (key.startsWith(`fx:${bus}:${id}:`)) map.delete(key);
        return true;
      });
    },
    fxRestore(bus, id) {
      calls.push(["fxRestore", bus, id]);
      return change("", () => {
        const gone = removed.get(bus) ?? [];
        const unit = gone.find((u) => u.id === id);
        const chain = chains.get(bus);
        if (!unit || !chain) return false;
        removed.set(
          bus,
          gone.filter((u) => u !== unit),
        );
        chain.push(unit);
        return true;
      });
    },
    fxMove(bus, id, to) {
      calls.push(["fxMove", bus, id, to]);
      return change("", () => {
        const chain = chains.get(bus);
        const at = chain?.findIndex((u) => u.id === id) ?? -1;
        if (!chain || at < 0 || to < 0 || to >= chain.length || to === at) return false;
        const [unit] = chain.splice(at, 1);
        if (unit) chain.splice(to, 0, unit);
        return true;
      });
    },
    fxKey(bus, id, key) {
      calls.push(["fxKey", bus, id, key]);
      return change("", () => {
        const unit = chains.get(bus)?.find((u) => u.id === id);
        if (unit === undefined || (key !== null && !isBus(key))) return false;
        if (unit.kind !== "compressor") return false;
        if (key === null) delete unit.key;
        else unit.key = key;
        return true;
      });
    },
    fxIr(bus, id, sample) {
      calls.push(["fxIr", bus, id, sample]);
      return change("", () => {
        const unit = chains.get(bus)?.find((u) => u.id === id);
        if (unit === undefined) return false;
        if (unit.kind !== "convolver") return false;
        unit.ir = sample;
        return true;
      });
    },
    limits: () => LIMITS,
    route(id, bus) {
      calls.push(["route", id, bus]);
      if (bus !== undefined && !isBus(bus)) return false;
      return change("", () => {
        if (routes.get(id) === bus) return false;
        if (bus === undefined) routes.delete(id);
        else routes.set(id, bus);
        list(id);
        return true;
      });
    },

    packs: () => [{ name: "theme", tempo: 96, key: "Am" }, { name: "kit" }],
    samples(): DeskSample[] {
      const users = new Map<string, string[]>();
      const use = (sample: string, id: string) => users.set(sample, [...(users.get(sample) ?? []), id]);
      for (const src of ROSTER) {
        if (src.id.startsWith("stem:")) use(src.id.slice(5), src.id);
        else if (src.id.startsWith("cue:"))
          for (const sample of new Set(takesOf(src.id.slice(4)).map((t) => t.sample))) use(sample, src.id);
      }
      const view = (key: string, entry: SampleEntry, url: string | undefined): DeskSample => {
        const st = stagedBy.get(key);
        return {
          key,
          pack: key.slice(0, key.indexOf("/")),
          name: key.slice(key.indexOf("/") + 1),
          entry: st?.side === "b" ? st.entry : entry,
          ...(url !== undefined ? { url } : {}),
          users: users.get(key) ?? [],
          staged: st !== undefined,
          side: st?.side ?? "a",
        };
      };
      const all = new Set([...Object.keys(SAMPLES), ...kept.keys()]);
      const out = [...all].map((key) => view(key, sampleEntry(key) as SampleEntry, `/packs/${key}.opus`));
      for (const [key, st] of stagedBy) if (!all.has(key)) out.push(view(key, st.entry, undefined));
      return out;
    },
    async stage(key, _audio, entry, token) {
      calls.push(["stage", key, entry, token]);
      if (key.indexOf("/") <= 0) return false;
      const fresh = stagedBy.get(key)?.fresh ?? sampleEntry(key) === undefined;
      stagedBy.set(key, { key, token, entry, fresh, side: "b" });
      notify();
      return true;
    },
    ab(key, side) {
      calls.push(["ab", key, side]);
      const st = stagedBy.get(key);
      if (!st || st.fresh || st.side === side) return;
      st.side = side;
      notify();
    },
    unstage(key) {
      calls.push(["unstage", key]);
      if (stagedBy.delete(key)) notify();
    },
    staged: () =>
      [...stagedBy.values()].map(({ key, token, entry, fresh }) => ({ key, token, entry, fresh })),
    committed(keys) {
      calls.push(["committed", [...keys]]);
      for (const key of keys) {
        const st = stagedBy.get(key);
        if (!st) continue;
        kept.set(key, st.entry);
        stagedBy.delete(key);
      }
      notify();
    },
    takes(cue) {
      const declared = cueSrc(cue)?.takes;
      if (!declared) return null;
      const over = takesOver.get(cue);
      return { takes: over ?? declared, declared, replaced: over !== undefined };
    },
    setTakes(cue, takes) {
      calls.push(["setTakes", cue, takes]);
      if (!cueSrc(cue)) return;
      change("", () => {
        if (takes === undefined) return takesOver.delete(cue);
        takesOver.set(cue, clone(takes) as Take[]);
        return true;
      });
    },

    undo() {
      calls.push(["undo"]);
      step(undone, redone);
    },
    redo() {
      calls.push(["redo"]);
      step(redone, undone);
    },
    canUndo: () => undone.length > 0,
    canRedo: () => redone.length > 0,

    mute(id, on) {
      calls.push(["mute", id, on]);
      if (on) mutes.add(id);
      else mutes.delete(id);
      notify();
    },
    solo(id, on) {
      calls.push(["solo", id, on]);
      if (on) solos.add(id);
      else solos.delete(id);
      notify();
    },
    clearListening() {
      calls.push(["clearListening"]);
      mutes.clear();
      solos.clear();
      notify();
    },
    audition(id) {
      calls.push(["audition", id]);
      if (id.startsWith("cue:")) desk.sound(id, 0.4);
    },
    tune(id, value) {
      desk.set(MIX, `tune:${id}`, value);
    },
    meters() {
      const buses: Record<string, DeskMeter> = {};
      let sum = 0;
      for (const name of names) {
        const lvl = 10 ** (((live(`level:${name}`) ?? 0) + (said(`trim:${name}`)?.value ?? 0)) / 20);
        const e = (env.get(name) ?? 0) * lvl * (mutes.has(`bus:${name}`) ? 0 : 1);
        const wobble = 0.85 + 0.15 * Math.sin(time * 9 + name.length);
        const squeezes = (chains.get(name) ?? []).find((u) => u.kind === "compressor");
        const keyed = squeezes?.key !== undefined ? (env.get(squeezes.key) ?? 0) * 14 : e * wobble * 9;
        buses[name] = {
          peak: Math.min(1.4, e * wobble * 1.6),
          rms: e * wobble * 0.7,
          reduction: squeezes ? Math.max(0, keyed) : 0,
        };
        sum += (e * 0.7) ** 2;
      }
      const m = Math.min(1, Math.sqrt(sum));
      buses.master = { peak: Math.min(1, m * 1.5), rms: m, reduction: m * 4 };
      return { buses, lufs: m > 0 ? 20 * Math.log10(m) - 0.7 : -200 };
    },
    file,
    load(f) {
      calls.push(["load", f]);
      restore(f);
      undone.length = 0;
      redone.length = 0;
      baseline = JSON.stringify(file());
      notify();
    },
    dirty: () => JSON.stringify(file()) !== baseline,
    saved() {
      calls.push(["saved"]);
      baseline = JSON.stringify(file());
      notify();
    },
    subscribe(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    sound(id, ring = 0.5) {
      const src = srcOf(id);
      // A cue sounds through a role: its first when none is named.
      const role = id.includes("@") || !src?.roles?.length ? id : `${id}@${src.roles[0]}`;
      const until = src?.loops ? Number.POSITIVE_INFINITY : time + ring;
      state.set(role, { lastAt: time, until });
      const parent = role.includes("@") ? role.slice(0, role.indexOf("@")) : undefined;
      if (parent) state.set(parent, { lastAt: time, until: 0 });
      const fresh = !heard.includes(role);
      list(role);
      if (fresh) notify();
    },
    hush(id) {
      const s = state.get(id);
      if (s) s.until = time;
    },
    setScenes(next, over) {
      current = next;
      pushed = [...over];
      notify();
    },
    step(dt) {
      time += dt;
      const all = heard.map(channel);
      for (const name of names) {
        // A cue sounds through its roles: the cue's own strip is not counted beside them.
        const leaf = (c: DeskChannel) => c.parent !== undefined || !srcOf(c.id)?.roles?.length;
        const active = all.filter((c) => leaf(c) && c.bus === name && c.sounding).length;
        const target = active ? Math.min(1, 0.35 + 0.2 * active) : 0;
        const prev = env.get(name) ?? 0;
        env.set(name, target > prev ? target : prev * Math.exp(-dt * 6));
      }
    },
  };
  return desk;
}

/**
 * Plays the fake desk on `win`'s timers: cues fire through their roles, loops start and stop, a source not yet heard
 * is heard every few seconds, and the meters' clock runs. Returns a function that stops it.
 */
export function runScript(desk: FakeDesk, win: Window = window): () => void {
  let rand = 7;
  const random = () => {
    rand = (rand * 16807) % 2147483647;
    return rand / 2147483647;
  };
  let elapsed = 0;
  let nextNew = 3;
  const tick = win.setInterval(() => {
    desk.step(0.05);
    elapsed += 0.05;
    const heard = desk.channels();
    for (const c of heard) {
      const leaf = c.kind !== "cue" || c.role !== undefined;
      if (c.kind === "cue" && leaf && random() < (c.name.startsWith("tick") ? 0.25 : 0.012))
        desk.sound(c.id, 0.3);
      if (c.kind !== "cue" && !c.sounding && random() < 0.004) desk.sound(c.id);
      if (c.kind !== "cue" && c.sounding && random() < 0.002) desk.hush(c.id);
    }
    if (elapsed > nextNew) {
      nextNew = elapsed + 4;
      const fresh = desk.roster.find((id) => !heard.some((c) => c.id === id));
      if (fresh) desk.sound(fresh);
    }
  }, 50);
  return () => win.clearInterval(tick);
}

// ---- A sample host ----------------------------------------------------------------------------------------------

/** A short recording as a WAV file: a decaying tone, or four pulses for a loop. Enough to draw and to decode. */
export function fakeWav(seconds: number, hz = 440, pulses = 1): ArrayBuffer {
  const rate = 8000;
  const frames = Math.max(1, Math.round(seconds * rate));
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + frames * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, frames * 2, true);
  const span = frames / pulses;
  for (let i = 0; i < frames; i++) {
    const t = (i % span) / span;
    const amp = Math.exp(-t * 5) * (0.6 + 0.4 * Math.sin(i * 0.013));
    view.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * amp * 30000), true);
  }
  return buffer;
}

export interface FakeSampleHost extends SampleHost {
  /** Every call, in order: `[method, ...args]`. */
  calls: unknown[][];
  retune: NonNullable<SampleHost["retune"]>;
}

export interface FakeSampleHostOptions {
  /** How long each answer takes, in milliseconds (default 0). */
  delay?: number;
  /** Methods that reject, each with this message. */
  fail?: Partial<Record<"process" | "describe" | "commit" | "retune", string>>;
}

/** The host a game's dev server would be: it answers with a made-up recording and writes nothing. */
export function fakeSampleHost(options: FakeSampleHostOptions = {}): FakeSampleHost {
  const calls: unknown[][] = [];
  let n = 0;
  const answer = async <T>(
    method: keyof NonNullable<FakeSampleHostOptions["fail"]>,
    make: () => T,
  ): Promise<T> => {
    if (options.delay) await new Promise((done) => setTimeout(done, options.delay));
    const why = options.fail?.[method];
    if (why !== undefined) throw new Error(why);
    return make();
  };
  const result = (request: Pick<SampleRequest, "kind" | "edit" | "bars">, seconds: number): SampleResult => {
    const start = request.edit?.start ?? 0;
    const length = Math.max(0.05, (request.edit?.end ?? seconds) - start);
    return {
      token: `token-${++n}`,
      audio: fakeWav(length, 330 + 40 * n, request.kind === "loop" ? 4 : 1),
      entry: {
        seconds: length,
        channels: 1,
        lufs: -18,
        peak: 0.7,
        kind: request.kind,
        ...(request.kind === "loop" ? { bars: request.bars ?? 4 } : {}),
      },
    };
  };
  return {
    calls,
    process(request) {
      calls.push(["process", request]);
      return answer("process", () =>
        result(request, SAMPLES[`${request.pack}/${request.sample}`]?.seconds ?? 1),
      );
    },
    describe(pack, sample) {
      calls.push(["describe", pack, sample]);
      return answer("describe", (): SampleSource & { audio: ArrayBuffer } => {
        const entry = SAMPLES[`${pack}/${sample}`];
        const isLoop = entry?.kind === "loop";
        return {
          source: `${sample}.wav`,
          ...(isLoop ? { bpm: 120, bars: entry.bars } : {}),
          audio: fakeWav((entry?.seconds ?? 1) * 1.25, isLoop ? 110 : 440, isLoop ? 8 : 1),
        };
      });
    },
    commit(tokens) {
      calls.push(["commit", [...tokens]]);
      return answer("commit", () => undefined);
    },
    retune(pack, to) {
      calls.push(["retune", pack, to]);
      return answer("retune", () =>
        Object.entries(SAMPLES)
          .filter(([key, entry]) => key.startsWith(`${pack}/`) && entry.kind === "loop")
          .map(([key, entry]) => ({
            ...result({ kind: "loop", bars: entry.bars }, entry.seconds),
            sample: key.slice(pack.length + 1),
          })),
      );
    },
  };
}
