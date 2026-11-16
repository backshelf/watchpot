/**
 * What the desk's window reads from a `Desk` on each change, where a control's value comes from and where a write to
 * it lands, and the few writes that take more than one call (an exclusive solo). Pure functions of the desk: React
 * holds none of it.
 */
import type {
  Desk,
  DeskBus,
  DeskChannel,
  DeskPack,
  DeskSample,
  DeskStaged,
  DeskTunable,
  MixFile,
} from "../../sound/desk";

export const MASTER = "master";
export const MIX = "mix";
export const busId = (bus: string) => `bus:${bus}`;
export const levelKey = (bus: string) => `level:${bus}`;
export const sendKey = (bus: string, to: string) => `send:${bus}>${to}`;
export const fxKey = (bus: string, id: string, param: string) => `fx:${bus}:${id}:${param}`;
export const trimKey = (bus: string) => `trim:${bus}`;
export const chKey = (channel: string) => `ch:${channel}`;
export const chSendKey = (channel: string, to: string) => `chsend:${channel}>${to}`;
export const tuneKey = (id: string) => `tune:${id}`;
export const sceneLayer = (name: string) => `scene:${name}`;

export interface Snapshot {
  buses: readonly DeskBus[];
  channels: readonly DeskChannel[];
  tunables: readonly DeskTunable[];
  /** The layers in force, bottom first: `"mix"`, then the current scene, then each pushed over it. */
  stack: readonly string[];
  current: string | null;
  pushed: readonly string[];
  labels: Readonly<Record<string, string>>;
  /** Scenes that may be named: every one that has been in force (stored) and every one in force now. */
  seen: readonly string[];
  file: MixFile;
  dirty: boolean;
  solos: number;
  mutes: number;
  packs: readonly DeskPack[];
  samples: readonly DeskSample[];
  staged: readonly DeskStaged[];
  canUndo: boolean;
  canRedo: boolean;
  limits: { fx: number; buses: number };
}

export function snapshot(desk: Desk, stored: readonly string[]): Snapshot {
  const buses = desk.buses();
  const channels = desk.channels();
  const scenes = desk.scenes();
  const inForce = [...(scenes.current === null ? [] : [scenes.current]), ...scenes.pushed];
  const seen = [...stored];
  for (const name of inForce) if (!seen.includes(name)) seen.push(name);
  let solos = 0;
  let mutes = 0;
  for (const x of [...buses, ...channels]) {
    if (x.soloed) solos++;
    if (x.muted) mutes++;
  }
  return {
    buses,
    channels,
    tunables: desk.tunables(),
    stack: [MIX, ...inForce.map(sceneLayer)],
    current: scenes.current,
    pushed: scenes.pushed,
    labels: scenes.labels,
    seen,
    file: desk.file(),
    dirty: desk.dirty(),
    solos,
    mutes,
    packs: desk.packs(),
    samples: desk.samples(),
    staged: desk.staged(),
    canUndo: desk.canUndo(),
    canRedo: desk.canRedo(),
    limits: desk.limits(),
  };
}

/** The layers a person may edit and see named: the mix, then every scene that has been in force, in the order heard. */
export const editLayers = (snap: Snapshot): string[] => [MIX, ...snap.seen.map(sceneLayer)];

/**
 * A layer's name as the desk shows it ("All scenes" for the mix, a scene's label), or null when it names a scene
 * that has not been in force in this browser: that one is never named.
 */
export function layerName(layer: string, snap: Pick<Snapshot, "seen" | "labels">): string | null {
  if (layer === MIX) return "All scenes";
  if (!layer.startsWith("scene:")) return layer;
  const name = layer.slice("scene:".length);
  return snap.seen.includes(name) ? (snap.labels[name] ?? name) : null;
}

export type Tone = "default" | "mix" | "scene" | "route";

/** The kind of layer an owner is, for colour. */
export const toneOf = (owner: string): Tone =>
  owner === "route" ? "route" : owner === MIX ? "mix" : owner.startsWith("scene:") ? "scene" : "default";

/** Who says the value in force, in words. */
export function ownerName(owner: string, snap: Pick<Snapshot, "seen" | "labels">): string {
  if (owner === "route") return "a mod route";
  if (owner === "default") return "the code's own value";
  return layerName(owner, snap) ?? "a scene";
}

/** True when the layer holds a desk write for the key (the file has it): what a reset takes away. */
export const written = (file: MixFile, layer: string, key: string) =>
  file.layers?.[layer]?.[key] !== undefined;

/** One key as a control shows it while `edit` is the layer being edited. */
export interface Resolved {
  /** What the control shows: the edit layer's value, else what lies under it. */
  shown: number;
  /** The value in force: what is heard now. */
  live: number;
  /** The layer whose value is in force: `"mix"`, `"scene:<name>"`, `"route"` or `"default"`. */
  owner: string;
  /** The layer the value shown comes from: the edit layer, `"mix"` under a scene, or `"default"`. */
  from: string;
  /** The edit layer says a value (declared or written). */
  says: boolean;
  /** The edit layer holds a desk write: a reset takes it away. */
  written: boolean;
  /** What is shown is not what is heard: another layer lies over it, or the edit layer is not in force. */
  shadowed: boolean;
  /** A mod route drives it: nothing may move it by hand. */
  locked: boolean;
}

/**
 * Where a key stands for a person editing `edit`. `fallback` is what the key is worth when no layer says it and the
 * desk cannot say (an effect's own start, 0 for a level or a trim, a tunable as declared).
 */
export function resolve(desk: Desk, file: MixFile, key: string, edit: string, fallback: number): Resolved {
  const owner = desk.owner(key);
  const live = desk.get("live", key) ?? fallback;
  const own = desk.get(edit, key);
  const says = own !== undefined;
  const isWritten = written(file, edit, key);
  if (owner === "route") {
    return { shown: live, live, owner, from: owner, says, written: isWritten, shadowed: false, locked: true };
  }
  // Under a scene lies the mix; under the mix, what the code starts with (which is what is live when nothing says).
  const base = owner === "default" ? live : fallback;
  const mix = edit === MIX ? undefined : desk.get(MIX, key);
  const shown = own ?? mix ?? base;
  const shadowed = owner !== edit && (says || owner.startsWith("scene:"));
  const from = says ? edit : mix !== undefined ? MIX : "default";
  return { shown, live, owner, from, says, written: isWritten, shadowed, locked: false };
}

/**
 * A test for "the mix or a scene that may be named says this key, or something in force does". Asked of every pair
 * of buses on every change, so it asks the desk as little as it can: who owns the key now (which covers every layer
 * in force), then the scenes that may be named and are not in force.
 */
function sayer(desk: Desk, snap: Snapshot): (key: string) => boolean {
  const away = editLayers(snap).filter((layer) => !snap.stack.includes(layer));
  return (key) => {
    if (desk.owner(key) !== "default") return true;
    for (const layer of away) if (desk.get(layer, key) !== undefined) return true;
    return false;
  };
}

export interface Tracks {
  /** Buses nothing sends into, in summing order. */
  plain: readonly DeskBus[];
  /** Buses another bus or a source sends into, in summing order. */
  returns: readonly DeskBus[];
  master: DeskBus | undefined;
  /** Each bus's sends that something says: the knobs its strip shows. */
  sends: ReadonlyMap<string, readonly string[]>;
}

/** The tracks as columns: the buses in summing order, the returns to their right, the master last. */
export function tracksOf(desk: Desk, snap: Snapshot): Tracks {
  const sends = new Map<string, string[]>();
  const fed = new Set<string>();
  const said = sayer(desk, snap);
  for (const bus of snap.buses) {
    const live = bus.sends.filter((to) => said(sendKey(bus.name, to)));
    sends.set(bus.name, live);
    for (const to of live) fed.add(to);
  }
  for (const c of snap.channels) for (const send of c.sends) fed.add(send.to);
  const others = snap.buses.filter((b) => b.name !== MASTER);
  return {
    plain: others.filter((b) => !fed.has(b.name)),
    returns: others.filter((b) => fed.has(b.name)),
    master: snap.buses.find((b) => b.name === MASTER),
    sends,
  };
}

/** A cue with its roles, or any other source alone. */
export interface SourceNode {
  channel: DeskChannel;
  /** A cue's roles when it has more than one: with one, the cue's row stands for it. */
  roles: readonly DeskChannel[];
}

/** The sources as a browser lists them: each parentless channel, a cue's roles gathered under it. */
export function sourcesOf(channels: readonly DeskChannel[]): SourceNode[] {
  const out: SourceNode[] = [];
  const byId = new Map<string, { channel: DeskChannel; roles: DeskChannel[] }>();
  for (const c of channels) {
    if (c.parent === undefined) {
      const node = { channel: c, roles: [] as DeskChannel[] };
      byId.set(c.id, node);
      out.push(node);
    } else byId.get(c.parent)?.roles.push(c);
  }
  return out.map((n) => ({ channel: n.channel, roles: n.roles.length > 1 ? n.roles : [] }));
}

/** A source's name as a row shows it: a role is named by the bus its plays ask for. */
export const sourceLabel = (c: DeskChannel): string => {
  if (c.role !== undefined) return `as ${c.role}`;
  if (c.kind === "stem") return c.name.slice(c.name.indexOf("/") + 1);
  return c.name;
};

/** The cue's key of a cue channel or one of its roles. */
export const cueKeyOf = (c: DeskChannel): string =>
  c.role !== undefined ? c.name.slice(0, c.name.length - c.role.length - 1) : c.name;

/**
 * Solo: alone by default (every other solo comes off), added to the others with `add` (Ctrl or Cmd held). Pressing
 * the only solo takes it off.
 */
export function pressSolo(desk: Desk, snap: Snapshot, id: string, add: boolean): void {
  const soloed = [
    ...snap.buses.filter((b) => b.soloed).map((b) => busId(b.name)),
    ...snap.channels.filter((c) => c.soloed).map((c) => c.id),
  ];
  const on = soloed.includes(id);
  if (add) {
    desk.solo(id, !on);
    return;
  }
  if (on && soloed.length === 1) {
    desk.solo(id, false);
    return;
  }
  for (const other of soloed) if (other !== id) desk.solo(other, false);
  if (!on) desk.solo(id, true);
}

/**
 * The buses still heard while anything is soloed (null when nothing is): each soloed bus and the bus of each soloed
 * channel, every bus on their way to the master, and the returns their sends reach (the core keeps those open).
 * A strip outside it is drawn dimmed, as silenced.
 */
export function audibleBuses(desk: Desk, snap: Snapshot): ReadonlySet<string> | null {
  if (!snap.solos) return null;
  const byName = new Map(snap.buses.map((b) => [b.name, b]));
  const heard = new Set<string>();
  const walk = (name: string | null) => {
    while (name && !heard.has(name)) {
      heard.add(name);
      const bus = byName.get(name);
      if (!bus) return;
      for (const to of bus.sends) if ((desk.get("live", sendKey(name, to)) ?? 0) > 0) walk(to);
      name = bus.out;
    }
  };
  for (const b of snap.buses) if (b.soloed) walk(b.name);
  const soloed = new Set(snap.channels.filter((c) => c.soloed).map((c) => c.id));
  for (const c of snap.channels) {
    if (!soloed.has(c.id) && !(c.parent !== undefined && soloed.has(c.parent))) continue;
    walk(c.bus);
    for (const send of c.sends) walk(send.to);
  }
  return heard;
}

/** A name a pack can hold for a new sample, made from a file's name: letters, digits, ".", "_", "-". */
export function sampleNameFrom(fileName: string, taken: ReadonlySet<string>): string {
  const base =
    fileName
      .replace(/\.[^.]*$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "") || "take";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}
