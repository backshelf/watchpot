/**
 * Snapshots: a sim's whole state at a moment of play, as plain data, so a later run can start there instead of from
 * nothing and play on exactly as the run that took it would have.
 *
 * A snapshot holds the world (the plain store's data and the sim clock: the rng's position is in the data, since every
 * draw is seeded from the state), the auto-player's memory, a fit's progress when a fit took it, and whatever the
 * game's own run keeps beside them (`extra`). The engine never chooses a file or reads one: `encodeSnapshot` gives
 * the text and `decodeSnapshot` reads it back, and the caller puts it where it likes.
 */

import { Decimal, isDecimal } from "../core";
import type { AutoPlayer, AutoPlayerMemory } from "./auto";
import type { FitProgress } from "./fit";
import type { SimWorld, WorldSnapshot } from "./world";

/** The format a snapshot is written in; `decodeSnapshot` refuses another. */
export const SNAPSHOT_FORMAT = 1;

/** A sim stopped at a moment of play. Plain data: Decimals and all, it survives `encodeSnapshot` exactly. */
export interface SimSnapshot<X = unknown> {
  readonly format: typeof SNAPSHOT_FORMAT;
  /** Ms of play when it was taken (the caller's played clock, not the world's wall). */
  readonly atMs: number;
  /** The store's data and the sim clock. */
  readonly world: WorldSnapshot;
  /** The auto-player's memory, when the run has one. */
  readonly player?: AutoPlayerMemory;
  /** A fit's own progress, when a fit took it. */
  readonly fit?: FitProgress;
  /** What the game's own run keeps besides (its records, its pilot's memory, a fit's holdings): plain data. */
  readonly extra?: X;
}

/** The parts of a snapshot a run gives: everything but the format, the moment and a fit's progress. */
export interface SnapshotParts<X = unknown> {
  world: WorldSnapshot;
  player?: AutoPlayerMemory;
  extra?: X;
}

/**
 * A snapshot of a run now: `world.snapshot()`, the player's memory, and `extra`, at `atMs` of play. The world's store
 * must be a plain store (`simStore`).
 */
export function takeSnapshot<X = unknown>(parts: {
  atMs: number;
  world: SimWorld;
  player?: AutoPlayer<never>;
  extra?: X;
}): SimSnapshot<X> {
  return {
    format: SNAPSHOT_FORMAT,
    atMs: parts.atMs,
    world: parts.world.snapshot(),
    ...(parts.player ? { player: parts.player.remember() } : {}),
    ...(parts.extra === undefined ? {} : { extra: parts.extra }),
  };
}

// ------------------------------------------------------------------------------------------------ the codec

/**
 * Tags. A Decimal is written as its three parts, not its string: the save's `{"$d": "<string>"}` loses the last
 * digit of about one large Decimal in a thousand, and a resumed run must be the same run. A number JSON cannot hold
 * (infinite, not a number) is written as its name.
 */
const DECIMAL = "$D";
const NUMBER = "$n";

function toTagged(value: unknown): unknown {
  if (isDecimal(value)) return { [DECIMAL]: [value.sign, value.layer, value.mag].map(toTagged) };
  if (typeof value === "number") return Number.isFinite(value) ? value : { [NUMBER]: String(value) };
  if (Array.isArray(value)) return value.map(toTagged);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "function" || v === undefined) continue;
      out[k] = toTagged(v);
    }
    return out;
  }
  return typeof value === "function" ? undefined : value;
}

function fromTagged(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fromTagged);
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    const only = keys.length === 1 ? keys[0] : undefined;
    const tag = only === undefined ? undefined : (value as Record<string, unknown>)[only];
    if (only === DECIMAL && Array.isArray(tag) && tag.length === 3) {
      const [sign, layer, mag] = tag.map(fromTagged) as [number, number, number];
      return Decimal.fromComponents_noNormalize(sign, layer, mag);
    }
    if (only === NUMBER && typeof tag === "string") return Number(tag);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = fromTagged(v);
    return out;
  }
  return value;
}

/** A snapshot as text, to write wherever the caller keeps them. Exact: `decodeSnapshot` gives back the same run. */
export function encodeSnapshot<X>(snapshot: SimSnapshot<X>): string {
  return JSON.stringify(toTagged(snapshot));
}

/** Reads `encodeSnapshot`'s text back; throws on text that is not a snapshot of this format. */
export function decodeSnapshot<X = unknown>(text: string): SimSnapshot<X> {
  const value = fromTagged(JSON.parse(text)) as Partial<SimSnapshot<X>> | null;
  if (!value || typeof value !== "object" || value.format !== SNAPSHOT_FORMAT || !value.world)
    throw new Error(
      `decodeSnapshot: not a sim snapshot of format ${SNAPSHOT_FORMAT} (format ${String(value?.format)})`,
    );
  return value as SimSnapshot<X>;
}

/**
 * Where two values differ, as paths (`.world.state.wallet.gold: 12 against 13`), at most `limit` of them. Decimals
 * compare by value, and a key holding `undefined` is the same as no key. Empty when they are the same.
 */
export function snapshotDiff(a: unknown, b: unknown, limit = 4): string[] {
  const found: string[] = [];
  const show = (v: unknown) => String(JSON.stringify(toTagged(v))).slice(0, 60);
  const walk = (x: unknown, y: unknown, path: string): void => {
    if (found.length >= limit || Object.is(x, y)) return;
    if (isDecimal(x) && isDecimal(y)) {
      if (x.sign !== y.sign || x.layer !== y.layer || !Object.is(x.mag, y.mag))
        found.push(`${path}: ${show(x)} against ${show(y)}`);
      return;
    }
    const isObj = (v: unknown): v is Record<string, unknown> =>
      typeof v === "object" && v !== null && !isDecimal(v);
    if (isObj(x) && isObj(y) && Array.isArray(x) === Array.isArray(y)) {
      const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
      for (const k of keys) {
        if (typeof x[k] === "function" || typeof y[k] === "function") continue;
        walk(x[k], y[k], `${path}.${k}`);
      }
      return;
    }
    found.push(`${path || "."}: ${show(x)} against ${show(y)}`);
  };
  walk(a, b, "");
  return found;
}

// ------------------------------------------------------------------------------------------------ when to take one

/** A snapshot every `everyMs` of play: `due(playedMs)` is true once a mark is passed, and moves to the next. */
export interface SnapshotCadence {
  /** Whether a mark has been reached since the last true; the marks it skipped over count as this one. */
  due(playedMs: number): boolean;
  /** The next mark, in ms of play. */
  next(): number;
}

/** Marks every `everyMs` of play after `fromMs` (default 0): a run resumed at hour 6 takes its next at the mark after. */
export function snapshotCadence(everyMs: number, fromMs = 0): SnapshotCadence {
  if (!(everyMs > 0)) throw new Error(`snapshotCadence: everyMs must be above 0 (got ${everyMs})`);
  let next = (Math.floor(fromMs / everyMs) + 1) * everyMs;
  return {
    due(playedMs) {
      if (playedMs < next) return false;
      while (next <= playedMs) next += everyMs;
      return true;
    },
    next: () => next,
  };
}

/**
 * The latest snapshot taken at or before `atMs` that `holds` accepts (default every one), or undefined: how a script
 * picks where to carry on from among those it kept.
 */
export function latestSnapshot<X>(
  snapshots: Iterable<SimSnapshot<X>>,
  atMs: number,
  holds: (snapshot: SimSnapshot<X>) => boolean = () => true,
): SimSnapshot<X> | undefined {
  let best: SimSnapshot<X> | undefined;
  for (const s of snapshots) if (s.atMs <= atMs && (!best || s.atMs > best.atMs) && holds(s)) best = s;
  return best;
}
