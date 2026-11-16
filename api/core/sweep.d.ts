import type { Draft } from "immer";
import { type Feature, type ResetRule } from "./feature";
import { type RngState } from "./rng";
/**
 * Sweeps: a timing bar. A cursor crosses a track whose length is 1, its place a pure function of game time; targets
 * sit on the track; a strike is graded by how near the cursor is to a target's centre, and a run of hits is a streak.
 * A scanner, a fishing line, a perfect-press meter. `sweepAt` and `gradeStrike` are the kernel; `sweep({ key, motion,
 * grades, targets })` is a feature that keeps the targets, the streak and the tallies and takes `strike()`. What a
 * hit pays is the game's (`onStrike`).
 */
/** How the cursor moves: across in `periodMs` and back at the start (`saw`), or there and back in `periodMs`. */
export interface SweepMotion {
    readonly periodMs: number;
    readonly wave?: "saw" | "triangle";
}
/** Where the cursor is on the track, 0 to 1, at `now` for a motion that began at `since`. */
export declare function sweepAt(now: number, motion: SweepMotion, since?: number): number;
/** How many times the cursor passes any one point in `dtMs`: once a period for a saw, twice for a triangle. */
export declare function passesIn(dtMs: number, motion: SweepMotion): number;
/** A target on the track: its centre and its width (both in track lengths), and the game's own kind for it. */
export interface SweepTarget {
    at: number;
    width: number;
    kind?: string;
}
/** A grade a strike can earn: the cursor within this share of the target's half width. List the tightest first. */
export interface SweepGrade {
    readonly id: string;
    readonly within: number;
}
/** A strike that landed: which target, the grade, and how far off centre (0 dead on, 1 at the edge). */
export interface SweepHit {
    readonly index: number;
    readonly target: SweepTarget;
    readonly grade: string;
    readonly offset: number;
}
/**
 * Grades a strike with the cursor at `pos`: the nearest target whose span holds the cursor, at the first grade
 * (tightest first) it is within. Null for a miss: no target there, or outside every grade.
 */
export declare function gradeStrike(pos: number, targets: readonly SweepTarget[], grades: readonly SweepGrade[]): SweepHit | null;
/**
 * Places one more target of `width` on the track, clear of the ones there where a try finds room: up to twelve
 * random tries, then the middle of the widest gap (which, on a crowded track, may overlap its neighbours). Returns it
 * with the next rng state.
 */
export declare function drawTarget(rng: RngState, width: number, taken: readonly SweepTarget[], kind?: string): [SweepTarget, RngState];
/** A sweep feature's saved state. */
export interface SweepState {
    targets: SweepTarget[];
    /** Hits in a row; the longest ever. */
    streak: number;
    best: number;
    /** Strikes made, misses among them, and hits by grade. */
    strikes: number;
    misses: number;
    hits: Record<string, number>;
    /** The game time the motion counts from (a strike can restart it). */
    since: number;
    rng: RngState;
}
/** What one strike did: the hit (null for a miss) and the streak after it. */
export interface StrikeResult {
    readonly hit: SweepHit | null;
    readonly streak: number;
    /** Where the cursor was. */
    readonly pos: number;
}
/** The sweep feature's actions. */
export interface SweepActions {
    strike(): StrikeResult;
}
/** What a sweep is made of, read off the game state: how fast the cursor moves and what sits on the track. */
export interface SweepSetup {
    readonly motion: SweepMotion;
    /** How many targets the track holds, and how wide each is. */
    readonly count: number;
    readonly width: number;
}
/** A `sweep` feature, carrying its grades and its setup reader. */
export type SweepFeature<K extends string, G> = Feature<K, SweepState, SweepActions> & {
    readonly grades: readonly SweepGrade[];
    setup(state: G): SweepSetup;
    /** The cursor's place now. */
    cursor(state: G, now: number): number;
    /** A strike inside a recipe of the game's. */
    strike(draft: object, now: number): StrikeResult;
};
/**
 * A sweep as a feature. `setup(state)` gives the motion and the targets' count and width, read each pass so an
 * upgrade can widen or add them; the track is topped up to `count` in `<key>.sync.targets` and after every hit, each
 * new target drawn clear of the rest on the feature's own saved stream. `strike()` grades the cursor's place at the
 * game time of the call: a hit removes its target and extends the streak, a miss ends the streak, and `onStrike`
 * runs in the same recipe with the result. `kind(rng)` may name each new target's kind. A prestige reset keeps the
 * tallies and clears the streak unless `reset` says otherwise.
 */
export declare function sweep<const K extends string, G extends object = object>(def: {
    readonly key: K;
    readonly setup: (state: G) => SweepSetup;
    readonly grades: readonly SweepGrade[];
    readonly kind?: (roll: number, state: G) => string | undefined;
    readonly onStrike?: (draft: Draft<G>, result: StrikeResult, now: number) => void;
    readonly reset?: ResetRule<SweepState>;
}): SweepFeature<K, G>;
