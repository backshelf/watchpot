import type { Draft } from "immer";
import { type Feature, type NeedsOf, type ReachOf, type ReachShape, type ResetRule } from "./feature";
/**
 * The daily streak: one claim a local calendar day, and a run of consecutive days that a missed day breaks. Days are
 * the player's local calendar days (`dayKey`), so a day of 23 or 25 hours across a daylight-saving change is still one
 * day. `grace` lets a run survive that many missed days; `keep` lets a game charge to save a run that would break.
 * The kernel is pure over the state and the `now` it is handed; `streak({ key, rewards })` is the feature.
 */
/** The streak's saved state: the day last claimed, the current run, the longest run and the claims ever. */
export interface StreakState {
    /** The local day key of the last claim, or null before the first. */
    lastDay: string | null;
    /** Consecutive days claimed, the last one included. */
    count: number;
    best: number;
    total: number;
}
/** The streak at a moment: whether today can be claimed, the run that is still alive, and the wait to the next day. */
export interface StreakStatus {
    readonly canClaim: boolean;
    /** The run as it stands: 0 once broken. */
    readonly count: number;
    /** More days were missed than `grace` allows: the next claim starts a new run (unless kept). */
    readonly broken: boolean;
    /** Days missed since the last claim (0 when it was yesterday or today), 366 at most. */
    readonly missed: number;
    /** Until the next local midnight when today is claimed; 0 when it can be claimed now. */
    readonly msUntilNext: number;
}
/** The rules a claim follows: missed days a run survives, and the game's offer to save one that would break. */
export interface StreakRules {
    /** Missed days a run survives (default 0). */
    readonly grace?: number;
    /** Called when a claim would break the run: true keeps it (the game charged for it). */
    readonly keep?: (missed: number) => boolean;
}
/** A fresh streak. */
export declare const NO_STREAK: StreakState;
/**
 * The streak at `now`. A claim from a later day than today (a clock set back) blocks claiming until that day comes,
 * and breaks nothing.
 */
export declare function streakStatus(state: StreakState, now: number, rules?: Pick<StreakRules, "grace">): StreakStatus;
/**
 * Claims today at `now`: the run goes up by one, or starts again at one when it broke and `keep` did not save it.
 * Pure: returns the new state and the day of the run claimed (1 the first), or null when today is claimed already.
 */
export declare function claimStreak(state: StreakState, now: number, rules?: StreakRules): {
    state: StreakState;
    day: number;
    kept: boolean;
} | null;
/** What a claim gave: the day of the run and its reward. */
export interface StreakClaim<R> {
    readonly day: number;
    readonly reward: R;
    /** The run would have broken and the game's `keep` saved it. */
    readonly kept: boolean;
}
/** The streak feature's actions. */
export interface StreakActions<R> {
    /** Claims today at game time now: the day and its reward, or null when today is claimed already. */
    claim(): StreakClaim<R> | null;
}
/** Any game state holding the feature's slice under its key. */
export type StreakGame<K extends string> = {
    readonly [P in K]: StreakState;
};
/** The read-only questions over state, for recipes, steps, callbacks and screens. */
export interface StreakSelect<K extends string> {
    /** The streak at `now`, by the feature's grace. */
    status(state: StreakGame<K>, now: number): StreakStatus;
}
/** The fixed configuration of a streak feature. */
export interface StreakDefs<R> {
    /** Missed days a run survives. */
    readonly grace: number;
    /** The reward of the day of the run. */
    readonly rewards: (day: number) => R;
}
/** The helpers that take a draft first and change it. Streak has none: its one change is its action. */
export type StreakDraftHelpers = Record<never, never>;
/** The three namespaces of a streak feature. */
export interface StreakHelpers<K extends string, R> {
    readonly select: StreakSelect<K>;
    readonly def: StreakDefs<R>;
    readonly draft: StreakDraftHelpers;
}
/** A `streak` feature: the feature plus `select`, `def` and `draft`. */
export type StreakFeature<K extends string, R> = Feature<K, StreakState, StreakActions<R>> & StreakHelpers<K, R>;
/**
 * The daily return as a feature. It saves `StreakState` under `key` and never resets with a run (unless `reset` says
 * otherwise). `claim()` claims today, reads `rewards(day)` for the day of the run claimed and runs `onClaim(draft,
 * reward, day, now)` in the same recipe. When the run would break, `keep(draft, missed)` may charge and return true to
 * save it. No steps: nothing happens until the player claims. The callbacks read the game state: the feature's own
 * slice and whatever `reach` names.
 *
 * `select`: `status(state, now)`. `def`: `grace`, `rewards`. `draft`: empty.
 */
export declare function streak<const K extends string, R, const Re extends ReachShape = readonly [], G extends object = Record<K, StreakState> & ReachOf<Re>>(def: {
    readonly key: K;
    /** The features the callbacks read, as `feature`'s `reach`. */
    readonly reach?: Re | (() => Re);
    readonly rewards: (day: number) => R;
    readonly onClaim?: (draft: Draft<G>, reward: R, day: number, now: number) => void;
    readonly grace?: number;
    readonly keep?: (draft: Draft<G>, missed: number) => boolean;
    readonly reset?: ResetRule<StreakState>;
}): StreakFeature<K, R> & {
    readonly needs?: NeedsOf<Re>;
};
