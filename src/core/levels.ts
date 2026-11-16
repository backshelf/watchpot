import type { Draft } from "immer";
import { costAt, costOfMany, type GeometricCost, maxAffordable } from "./cost";
import { D, type Decimal, type DecimalSource, ZERO } from "./decimal";
import {
  defineFeature,
  type Feature,
  type FeatureApi,
  type NeedsOf,
  type ReachOf,
  type ReachShape,
  type ResetRule,
} from "./feature";

/**
 * Levels: experience and levels, as curves with exact inverses. A curve says how much XP each level takes; the
 * readers go both ways, from a level to the total XP it needs and from a total back to the level it reaches, always
 * consistent with each other: `totalXpAt(levelAt(x)) ≤ x < totalXpAt(levelAt(x) + 1)`. Geometric and polynomial curves
 * invert in closed form, a table by binary search, a function by bisection.
 *
 * `defineLevels({ key, tracks })` is a feature holding the XP of several named tracks (skills), with `select`, `def` and
 * `draft`, and an action (and its draft helper) to gain XP that report the levels gained.
 */

/**
 * An XP curve. Level 0 is where every track starts, at 0 XP.
 * - `geometric`: going from level `L` to `L + 1` takes `base × growth^L`.
 * - `polynomial`: the total to reach level `L` is `base × L^power`.
 * - `table`: `totals[i]` is the total to reach level `i + 1`, rising; the last entry is the top level.
 * - a function: the total to reach `level`, rising, 0 at level 0.
 */
export type XpCurve =
  | { readonly kind: "geometric"; readonly base: DecimalSource; readonly growth: DecimalSource }
  | { readonly kind: "polynomial"; readonly base: DecimalSource; readonly power: number }
  | { readonly kind: "table"; readonly totals: readonly DecimalSource[] }
  | ((level: number) => DecimalSource);

/** The highest level the readers go to: past it a function curve is not searched. */
export const LEVEL_LIMIT = Number.MAX_SAFE_INTEGER;

const INFINITE = D(Number.POSITIVE_INFINITY);
const whole = (n: number): number =>
  Number.isFinite(n) ? Math.max(0, Math.floor(n)) : n > 0 ? LEVEL_LIMIT : 0;
const geometric = (curve: { base: DecimalSource; growth: DecimalSource }): GeometricCost => ({
  base: curve.base,
  growth: curve.growth,
  // XP is a threshold, not a price a player reads and pays: its fractions stay.
  round: "none",
});

/** The total XP to reach `level` from level 0. A table past its end is out of reach (Infinity). */
export function totalXpAt(curve: XpCurve, level: number): Decimal {
  const L = whole(level);
  if (L === 0) return ZERO;
  if (typeof curve === "function") return D(curve(L));
  switch (curve.kind) {
    case "geometric":
      return costOfMany(geometric(curve), 0, L);
    case "polynomial":
      return D(curve.base).mul(D(L).pow(curve.power));
    case "table": {
      const t = curve.totals[L - 1];
      return t === undefined ? INFINITE : D(t);
    }
  }
}

/** The XP to go from `level` to `level + 1`. */
export function xpForLevel(curve: XpCurve, level: number): Decimal {
  const L = whole(level);
  if (typeof curve !== "function" && curve.kind === "geometric") return costAt(geometric(curve), L);
  return totalXpAt(curve, L + 1).sub(totalXpAt(curve, L));
}

/** Walks a closed-form guess onto the exact level: the highest whose total `xp` covers. */
function settle(curve: XpCurve, guess: number, xp: Decimal): number {
  let L = Math.min(LEVEL_LIMIT, whole(guess));
  while (L > 0 && totalXpAt(curve, L).gt(xp)) L -= 1;
  while (L < LEVEL_LIMIT && totalXpAt(curve, L + 1).lte(xp)) L += 1;
  return L;
}

/** The highest level `lo..hi` whose total `xp` covers, given `totalXpAt(lo) ≤ xp < totalXpAt(hi)`. */
function bisect(curve: XpCurve, lo: number, hi: number, xp: Decimal): number {
  let a = lo;
  let b = hi;
  while (b - a > 1) {
    const mid = a + Math.floor((b - a) / 2);
    if (totalXpAt(curve, mid).lte(xp)) a = mid;
    else b = mid;
  }
  return a;
}

/**
 * The level a total of `totalXp` reaches: the highest `L` with `totalXpAt(L) ≤ totalXp`. Closed form for geometric
 * and polynomial curves (checked either side, since the logarithm and the root are floats), binary search over a
 * table, bisection over a function.
 */
export function levelAt(curve: XpCurve, totalXp: DecimalSource): number {
  const xp = D(totalXp);
  if (!(xp.gt(0) || totalXpAt(curve, 1).lte(xp))) return 0;
  if (typeof curve === "function") {
    let hi = 1;
    while (hi < LEVEL_LIMIT && totalXpAt(curve, hi).lte(xp)) hi = Math.min(LEVEL_LIMIT, hi * 2);
    if (totalXpAt(curve, hi).lte(xp)) return hi;
    return bisect(curve, Math.floor(hi / 2), hi, xp);
  }
  switch (curve.kind) {
    case "geometric":
      return Math.min(LEVEL_LIMIT, maxAffordable(geometric(curve), 0, xp));
    case "polynomial": {
      const base = D(curve.base);
      if (base.lte(0) || !(curve.power > 0)) return LEVEL_LIMIT;
      return settle(
        curve,
        xp
          .div(base)
          .pow(1 / curve.power)
          .floor()
          .toNumber(),
        xp,
      );
    }
    case "table": {
      const top = curve.totals.length;
      if (totalXpAt(curve, top).lte(xp)) return top;
      return bisect(curve, 0, top, xp);
    }
  }
}

/** Where a total stands: its level, the XP into the next, the XP the next takes, and the share filled (0 to 1). */
export interface LevelProgress {
  readonly level: number;
  readonly into: Decimal;
  readonly need: Decimal;
  readonly share: number;
}

/** Where `totalXp` stands on the curve. At a table's top level the need is Infinity and the share 1. */
export function levelProgress(curve: XpCurve, totalXp: DecimalSource): LevelProgress {
  const xp = D(totalXp);
  const level = levelAt(curve, xp);
  const at = totalXpAt(curve, level);
  const need = totalXpAt(curve, level + 1).sub(at);
  const into = xp.sub(at).max(0);
  const share = need.lt(INFINITE) && need.gt(0) ? Math.min(1, Math.max(0, into.div(need).toNumber())) : 1;
  return { level, into, need, share };
}

/** One track: its id, its curve and the level it stops at. The game's own fields (a name, a line) ride along. */
export interface TrackDef {
  readonly id: string;
  readonly curve: XpCurve;
  /** The level it stops at; XP past that level's total is not kept. Default: the feature's `maxLevel`. */
  readonly maxLevel?: number;
}

/** The feature's saved state: the total XP per track. */
export interface LevelsState {
  xp: Record<string, Decimal>;
}

/** The feature's actions. */
export interface LevelActions {
  /** Adds XP to a track. Returns the levels gained. */
  gain(track: string, amount: DecimalSource): number;
}

/** Any game state holding the feature's XP under its key. */
export type LevelsGame<K extends string> = { readonly [P in K]: Pick<LevelsState, "xp"> };

/** The read-only questions over state, for recipes, steps, callbacks and screens. */
export interface LevelSelect<K extends string, E> {
  /** The track's level. */
  level(state: LevelsGame<K>, track: string): number;
  /** Where the track stands. */
  progress(state: LevelsGame<K>, track: string): LevelProgress;
  /** Every track's effects at its level, sourced `<key>:<track>`, as the `stats` feature's `contributions` take them. */
  contributions(state: LevelsGame<K>): { source: string; effect: E }[];
}

/** The fixed configuration of a levels feature. */
export interface LevelDefs<T extends TrackDef> {
  readonly tracks: readonly T[];
  /** One track of the list by id. */
  track(id: string): T | undefined;
}

/** The helpers that take a draft first and change it, named like the actions they mirror. */
export interface LevelDraftHelpers {
  /** `gain` inside a recipe or a step: adds XP to a track and returns the levels gained. */
  gain(draft: object, track: string, amount: DecimalSource): number;
}

/** The three namespaces of a levels feature. */
export interface LevelHelpers<K extends string, T extends TrackDef, E> {
  readonly select: LevelSelect<K, E>;
  readonly def: LevelDefs<T>;
  readonly draft: LevelDraftHelpers;
}

/** A `levels` feature: the feature plus `select`, `def` and `draft`. */
export type LevelsFeature<K extends string, T extends TrackDef, E> = Feature<K, LevelsState, LevelActions> &
  LevelHelpers<K, T, E>;

/**
 * Levelled tracks as a feature. It saves `{ xp }` (a total per track) under `key` (the contributions' source prefix
 * too); levels are read off the totals, never stored. `gain(track, amount)` adds XP (the action, or `draft.gain` inside
 * a recipe), stops at the track's `maxLevel`, runs `onLevel(draft, track, from, to)` in the same recipe when the level
 * rises, and returns the levels gained. `effects(track, level)` (`{ stat, add }` / `{ stat, mul }`) feeds the `stats`
 * feature through `select.contributions`. A prestige reset clears the XP unless `reset` says otherwise.
 *
 * `select`: `level`, `progress`, `contributions`. `def`: `tracks`, `track(id)`. `draft`: `gain`.
 */
export function defineLevels<
  const K extends string,
  T extends TrackDef,
  E = never,
  const R extends ReachShape = readonly [],
  G extends object = Record<K, LevelsState> & ReachOf<R>,
>(def: {
  readonly key: K;
  /** The features `onLevel` reads, as `feature`'s `reach`. */
  readonly reach?: R | (() => R);
  readonly tracks: readonly T[];
  /** The level every track stops at unless its own says otherwise (default: none). */
  readonly maxLevel?: number;
  readonly onLevel?: (draft: Draft<G>, track: string, from: number, to: number) => void;
  readonly effects?: (track: T, level: number) => readonly E[];
  readonly reset?: ResetRule<LevelsState>;
}): LevelsFeature<K, T, E> & { readonly needs?: NeedsOf<R> } {
  const byId = new Map<string, T>();
  for (const t of def.tracks) {
    if (byId.has(t.id)) throw new Error(`levels "${def.key}": the track "${t.id}" appears twice`);
    byId.set(t.id, t);
  }

  type Own = Record<K, LevelsState>;
  const own = (state: unknown): LevelsState => (state as Own)[def.key];
  const xpOf = (slice: Pick<LevelsState, "xp">, id: string): Decimal => slice.xp[id] ?? ZERO;
  const maxOf = (t: T): number | undefined => t.maxLevel ?? def.maxLevel;
  const levelOf = (slice: Pick<LevelsState, "xp">, t: T): number => {
    const level = levelAt(t.curve, xpOf(slice, t.id));
    const max = maxOf(t);
    return max === undefined ? level : Math.min(max, level);
  };

  const select: LevelSelect<K, E> = {
    level: (state, id) => {
      const t = byId.get(id);
      return t ? levelOf(state[def.key], t) : 0;
    },
    progress: (state, id) => {
      const t = byId.get(id);
      if (!t) return { level: 0, into: ZERO, need: ZERO, share: 0 };
      const p = levelProgress(t.curve, xpOf(state[def.key], id));
      const max = maxOf(t);
      return max !== undefined && p.level >= max ? { level: max, into: ZERO, need: ZERO, share: 1 } : p;
    },
    contributions: (state) => {
      const out: { source: string; effect: E }[] = [];
      if (!def.effects) return out;
      for (const t of def.tracks)
        for (const effect of def.effects(t, levelOf(state[def.key], t)))
          out.push({ source: `${def.key}:${t.id}`, effect });
      return out;
    },
  };

  const gain = (draft: object, id: string, amount: DecimalSource): number => {
    const t = byId.get(id);
    const add = D(amount);
    if (!t || !add.gt(0)) return 0;
    const s = own(draft);
    const from = levelOf(s, t);
    let xp = xpOf(s, id).add(add);
    const max = maxOf(t);
    if (max !== undefined) xp = xp.min(totalXpAt(t.curve, max));
    s.xp[id] = xp;
    const to = levelOf(s, t);
    if (to > from) def.onLevel?.(draft as Draft<G>, id, from, to);
    return to - from;
  };

  const made = defineFeature<K, LevelsState, LevelActions, ReachShape, Record<never, never>, Own>({
    reach: def.reach,
    key: def.key,
    initial: (): LevelsState => ({ xp: Object.fromEntries(def.tracks.map((t) => [t.id, ZERO])) }),
    reset: def.reset ?? "run",
    actions: (api: FeatureApi<Own>): LevelActions => ({
      gain: (track, amount) => {
        let n = 0;
        api.set((d) => {
          n = gain(d, track, amount);
        });
        return n;
      },
    }),
  });
  const helpers: LevelHelpers<K, T, E> = {
    select,
    def: { tracks: def.tracks, track: (id) => byId.get(id) },
    draft: { gain },
  };
  return Object.assign(made, helpers) as LevelsFeature<K, T, E> & { readonly needs?: NeedsOf<R> };
}
