import type { Draft } from "immer";
import { type Feature, type ResetRule } from "./feature";
/**
 * Gauges: a bounded level that a rate fills or drains over time, and that trips at the top. A trip locks the gauge
 * for a while and drops the level; what a lock means (no output, a closed shop) is the game's to read. The risk
 * meter of a push-your-luck loop: heat, pressure, suspicion, strain. `stepGauge` is the pure kernel; `gauge({ key,
 * max, rate, trip })` is a feature that steps its level every tick and over an absence.
 */
/** A gauge's saved state: its level and the game time its lock ends (0 when it never tripped). */
export interface GaugeState {
    level: number;
    lockedUntil: number;
    /** Trips, ever (or since the last reset that cleared the gauge). */
    trips: number;
}
/** What a trip does: how long the gauge locks and the level it drops to. */
export interface GaugeTrip {
    /** How long the lock lasts. */
    readonly lockMs: number;
    /** The level after the trip, as a share of `max` (default 0). */
    readonly dropTo?: number;
    /** The rate while locked, per second (default 0: the level holds). */
    readonly lockedRate?: number;
}
/** The bounds and the trip `stepGauge` works to. */
export interface GaugeRules {
    readonly max: number;
    readonly trip?: GaugeTrip;
}
/** One step's result: the state after, and whether the gauge tripped inside the step. */
export interface GaugeStep {
    readonly state: GaugeState;
    readonly tripped: boolean;
}
/** Whether the gauge is locked at `now`. */
export declare function gaugeLocked(state: Pick<GaugeState, "lockedUntil">, now: number): boolean;
/** The level as a share of `max`, 0 to 1. */
export declare function gaugeFill(state: Pick<GaugeState, "level">, max: number): number;
/** Seconds until the level reaches the top at `perSecond`, or null when it is not rising. */
export declare function secondsToTrip(state: Pick<GaugeState, "level">, perSecond: number, max: number): number | null;
/**
 * Steps a gauge over `dtMs` ending at `now` with the level moving `perSecond`. The part of the step that falls
 * inside a lock moves at the trip's `lockedRate`; the rest at `perSecond`. A level that reaches `max` trips once:
 * the lock starts at the moment it got there, the level drops, and what is left of the step runs locked. Without a
 * `trip` the level just holds at `max`. Pure; returns a new state.
 */
export declare function stepGauge(state: GaugeState, perSecond: number, dtMs: number, now: number, rules: GaugeRules): GaugeStep;
/** The gauge feature's actions. */
export interface GaugeActions {
    /** Moves the level by `amount` (clamped); a rise to the top trips it. Returns whether it tripped. */
    nudge(amount: number): boolean;
}
/** A `gauge` feature, carrying its rules as `.rules`. */
export type GaugeFeature<K extends string> = Feature<K, GaugeState, GaugeActions> & {
    readonly rules: GaugeRules;
};
/**
 * A gauge as a feature. `rate(state)` is the level's change per second with the tab open, read off the whole game
 * state each tick; `awayRate(state)` the same over an absence (default: the gauge drains at `max` per hour, so a
 * player comes back to a cool one). `onTrip(draft, now)` runs in the same recipe as a trip. Its step is
 * `<key>.rates.level`, before `produce`, so a game's income step already sees a lock. A prestige reset starts the
 * gauge over unless `reset` says otherwise.
 */
export declare function gauge<const K extends string, G extends object = object>(def: {
    readonly key: K;
    readonly max: number;
    readonly trip?: GaugeTrip;
    readonly rate: (state: G) => number;
    readonly awayRate?: (state: G) => number;
    readonly onTrip?: (draft: Draft<G>, now: number) => void;
    readonly reset?: ResetRule<GaugeState>;
}): GaugeFeature<K>;
