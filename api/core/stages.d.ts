import type { Draft } from "immer";
import { Decimal, type DecimalSource } from "./decimal";
import type { DimensionAway } from "./dimensions";
import { type Feature, type NeedsOf, type ReachOf, type ReachShape, type ResetRule } from "./feature";
/**
 * Stages: a track of walls, each with more resistance than the last, worn down by a force. The stage in front takes
 * `force` a second; when what it has taken reaches its resistance it falls and the next one stands. Zones, floors,
 * waves, a front line on a map. A stretch of any length is exact: one long step clears what many short ones would.
 * `advanceTrack` is the kernel; `stages({ key, tracks, force })` is a feature with a track state each, and `select`,
 * `def` and `draft` beside it. What a fallen
 * stage pays is the game's (`onClear`).
 */
/** One track: how its resistance climbs, its bosses, and an optional time limit per stage. */
export interface StageTrack {
    readonly id: string;
    /** Stage `n`'s resistance (from 0): `base × growth ^ n`, or the game's own function. */
    readonly resistance: {
        readonly base: DecimalSource;
        readonly growth: number;
    } | ((stage: number) => DecimalSource);
    /** Every `every`th stage (the 10th, the 20th) has its resistance multiplied by `mult`. */
    readonly boss?: {
        readonly every: number;
        readonly mult: number;
    };
    /**
     * A stage must fall inside this long. One the force cannot wear down in time stands (nothing builds up against it),
     * so the track is a wall until the force grows, not a wait.
     */
    readonly limitMs?: number;
    /** How many stages the track has (default: no end). */
    readonly length?: number;
}
/** A track's saved state: the stage in front (the count cleared), what it has taken, and the furthest reached. */
export interface TrackState {
    stage: number;
    worn: Decimal;
    best: number;
}
/** The most stages one step clears; past it the rest of the step's force is dropped. */
export declare const STAGE_WALK_LIMIT = 10000;
/** Stage `stage`'s resistance on a track. */
export declare function resistanceAt(track: StageTrack, stage: number): Decimal;
/** Whether the track has no stage left. */
export declare const trackEnded: (track: StageTrack, state: Pick<TrackState, "stage">) => boolean;
/** Whether `force` a second can bring the stage in front down at all (always, without a time limit). */
export declare function passable(track: StageTrack, state: Pick<TrackState, "stage">, force: DecimalSource): boolean;
/** One step's result: the state after, and how many stages fell. */
export interface TrackStep {
    readonly state: TrackState;
    readonly cleared: number;
}
/**
 * Wears a track for `dtMs` at `force` a second. The stage in front takes the force until it falls, the next takes
 * what is left, and so on (at most `STAGE_WALK_LIMIT` in one step). With a time limit, a stage the force could not
 * bring down in time takes nothing. Pure; returns a new state.
 */
export declare function advanceTrack(state: TrackState, force: DecimalSource, dtMs: number, track: StageTrack): TrackStep;
/** How far the stage in front is worn, 0 to 1. */
export declare function trackFill(track: StageTrack, state: TrackState): number;
/** Seconds until the stage in front falls at `force`, or null when it cannot. */
export declare function secondsToClear(track: StageTrack, state: TrackState, force: DecimalSource): number | null;
/** A stages feature's saved state: a track state per track id. */
export interface StagesState {
    tracks: Record<string, TrackState>;
}
/** The stages feature's actions. */
export interface StagesActions {
    /** Stands in front of an earlier stage again (never past the furthest reached). Returns whether it moved. */
    enter(track: string, stage: number): boolean;
}
/** The read-only questions over state, for recipes, steps, callbacks and screens. */
export interface StageSelect<G> {
    /** The wear a second the game's `force` gives the track now (never below zero). */
    force(state: G, id: string): Decimal;
    /** How far the stage in front is worn, 0 to 1. */
    fill(state: G, id: string): number;
    /** Whether the force can bring the stage in front down at all. */
    passable(state: G, id: string): boolean;
    /** Seconds until the stage in front falls, or null when it cannot. */
    secondsToClear(state: G, id: string): number | null;
    /** Whether the track has no stage left (true for an unknown track). */
    ended(state: G, id: string): boolean;
}
/** The fixed configuration of a stages feature. */
export interface StageDefs {
    readonly tracks: readonly StageTrack[];
    /** One track of the list by id. */
    track(id: string): StageTrack | undefined;
    /** Stage `stage`'s resistance on the track (zero for an unknown track). */
    resistance(id: string, stage: number): Decimal;
}
/** The helpers that take a draft first and change it. Stages has none: its changes are its step and its action. */
export type StageDraftHelpers = Record<never, never>;
/** The three namespaces of a stages feature. */
export interface StageHelpers<G> {
    readonly select: StageSelect<G>;
    readonly def: StageDefs;
    readonly draft: StageDraftHelpers;
}
/** A `stages` feature: the feature plus `select`, `def` and `draft`. */
export type StagesFeature<K extends string, G> = Feature<K, StagesState, StagesActions> & StageHelpers<G>;
/**
 * Stages as a feature. It saves a `TrackState` per track under `key` and wears every open track in
 * `<key>.produce.advance`: over a tick for its length, over an absence for what `away(state)` credits (default: all
 * of it). `force(state, track)` is the wear a second, read off the whole game state; `open(state, track)` holds a
 * track still until it is unlocked. `onClear(draft, track, from, to, now)` runs in the same recipe as a step that
 * cleared stages `from` up to (not including) `to`. A prestige reset starts every track over and keeps `best`, unless
 * `reset` says otherwise. The callbacks read the game state: the feature's own slice and whatever `reach` names.
 *
 * `select`: `force`, `fill`, `passable`, `secondsToClear`, `ended`. `def`: `tracks`, `track(id)`, `resistance(id,
 * stage)`. `draft`: empty.
 */
export declare function stages<const K extends string, const R extends ReachShape = readonly [], G extends object = Record<K, StagesState> & ReachOf<R>>(def: {
    readonly key: K;
    /** The features the callbacks read, as `feature`'s `reach`. */
    readonly reach?: R | (() => R);
    readonly tracks: readonly StageTrack[];
    readonly force: (state: G, track: StageTrack) => DecimalSource;
    readonly open?: (state: G, track: StageTrack) => boolean;
    readonly onClear?: (draft: Draft<G>, track: string, from: number, to: number, now: number) => void;
    readonly away?: (state: G) => DimensionAway;
    readonly reset?: ResetRule<StagesState>;
}): StagesFeature<K, G> & {
    readonly needs?: NeedsOf<R>;
};
