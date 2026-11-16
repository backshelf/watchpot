import type { Draft } from "immer";
import { type Decimal, type DecimalSource } from "./decimal";
import { type Feature, type NeedsOf, type ReachOf, type ReachShape, type ResetRule } from "./feature";
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
export type XpCurve = {
    readonly kind: "geometric";
    readonly base: DecimalSource;
    readonly growth: DecimalSource;
} | {
    readonly kind: "polynomial";
    readonly base: DecimalSource;
    readonly power: number;
} | {
    readonly kind: "table";
    readonly totals: readonly DecimalSource[];
} | ((level: number) => DecimalSource);
/** The highest level the readers go to: past it a function curve is not searched. */
export declare const LEVEL_LIMIT: number;
/** The total XP to reach `level` from level 0. A table past its end is out of reach (Infinity). */
export declare function totalXpAt(curve: XpCurve, level: number): Decimal;
/** The XP to go from `level` to `level + 1`. */
export declare function xpForLevel(curve: XpCurve, level: number): Decimal;
/**
 * The level a total of `totalXp` reaches: the highest `L` with `totalXpAt(L) ≤ totalXp`. Closed form for geometric
 * and polynomial curves (checked either side, since the logarithm and the root are floats), binary search over a
 * table, bisection over a function.
 */
export declare function levelAt(curve: XpCurve, totalXp: DecimalSource): number;
/** Where a total stands: its level, the XP into the next, the XP the next takes, and the share filled (0 to 1). */
export interface LevelProgress {
    readonly level: number;
    readonly into: Decimal;
    readonly need: Decimal;
    readonly share: number;
}
/** Where `totalXp` stands on the curve. At a table's top level the need is Infinity and the share 1. */
export declare function levelProgress(curve: XpCurve, totalXp: DecimalSource): LevelProgress;
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
export type LevelsGame<K extends string> = {
    readonly [P in K]: Pick<LevelsState, "xp">;
};
/** The read-only questions over state, for recipes, steps, callbacks and screens. */
export interface LevelSelect<K extends string, E> {
    /** The track's level. */
    level(state: LevelsGame<K>, track: string): number;
    /** Where the track stands. */
    progress(state: LevelsGame<K>, track: string): LevelProgress;
    /** Every track's effects at its level, sourced `<key>:<track>`, as the `stats` feature's `contributions` take them. */
    contributions(state: LevelsGame<K>): {
        source: string;
        effect: E;
    }[];
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
export type LevelsFeature<K extends string, T extends TrackDef, E> = Feature<K, LevelsState, LevelActions> & LevelHelpers<K, T, E>;
/**
 * Levelled tracks as a feature. It saves `{ xp }` (a total per track) under `key` (the contributions' source prefix
 * too); levels are read off the totals, never stored. `gain(track, amount)` adds XP (the action, or `draft.gain` inside
 * a recipe), stops at the track's `maxLevel`, runs `onLevel(draft, track, from, to)` in the same recipe when the level
 * rises, and returns the levels gained. `effects(track, level)` (`{ stat, add }` / `{ stat, mul }`) feeds the `stats`
 * feature through `select.contributions`. A prestige reset clears the XP unless `reset` says otherwise.
 *
 * `select`: `level`, `progress`, `contributions`. `def`: `tracks`, `track(id)`. `draft`: `gain`.
 */
export declare function defineLevels<const K extends string, T extends TrackDef, E = never, const R extends ReachShape = readonly [], G extends object = Record<K, LevelsState> & ReachOf<R>>(def: {
    readonly key: K;
    /** The features `onLevel` reads, as `feature`'s `reach`. */
    readonly reach?: R | (() => R);
    readonly tracks: readonly T[];
    /** The level every track stops at unless its own says otherwise (default: none). */
    readonly maxLevel?: number;
    readonly onLevel?: (draft: Draft<G>, track: string, from: number, to: number) => void;
    readonly effects?: (track: T, level: number) => readonly E[];
    readonly reset?: ResetRule<LevelsState>;
}): LevelsFeature<K, T, E> & {
    readonly needs?: NeedsOf<R>;
};
