import type { Draft } from "immer";
import { type Feature, type ResetRule } from "./feature";
/**
 * Gauges: a bounded level that a rate fills or drains over time, and that trips at the top. A trip locks the gauge
 * for a while and drops the level; what a lock means (no output, a closed shop) is the game's to read. The risk
 * meter of a push-your-luck loop: heat, pressure, suspicion, strain. `stepGauge` is the pure kernel; `gauge({ key,
 * max, rate, trip })` is a feature that steps its level every tick and over an absence. Without a `trip` a gauge is a
 * plain bounded meter (fill, mood, stamina) that holds at `max`: a supported use, not a half-made one.
 */
/**
 * What a factory's state callbacks get after the state: the game time of the pass (or the action) they are read in,
 * so a callback can ask a buff or a lock where it applies (`buffActive(s.buffs, "rush", now)`).
 */
export interface CallbackContext {
    readonly now: number;
}
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
/**
 * Moves a gauge's level by `amount` at `now`, clamped to 0 and `max`; a rise to the top trips it, the lock starting at
 * `now`. A locked gauge does not move. Pure; returns a new state and whether it tripped.
 */
export declare function nudgeGauge(state: GaugeState, amount: number, now: number, rules: GaugeRules): GaugeStep;
/** The gauge feature's actions. */
export interface GaugeActions {
    /** Moves the level by `amount` (clamped); a rise to the top trips it. Returns whether it tripped. */
    nudge(amount: number): boolean;
}
/** A `gauge` feature, carrying its rules as `.rules` and its draft helper as `.nudge`. */
export type GaugeFeature<K extends string> = Feature<K, GaugeState, GaugeActions> & {
    readonly rules: GaugeRules;
    /**
     * Draft helper: the `nudge` action inside a recipe at game time `now` (a press that warms the gauge), with the same
     * clamp, trip and `onTrip`. Returns whether it tripped.
     */
    nudge(draft: object, amount: number, now: number): boolean;
};
/**
 * A gauge as a feature. `rate(state, { now })` is the level's change per second with the tab open, read off the whole
 * game state each tick; `awayRate(state, { now })` the same over an absence (default: the gauge drains at `max` per
 * hour, so a player comes back to a cool one). A rate is read once per step and held across it, so one that depends on
 * the level is only as fine as the step: a live tick steps at most `MAX_STEP_MS`, and an absence is one step.
 * `onTrip(draft, now)` runs in the same recipe as a trip. Its step is
 * `<key>.rates.level`, before `produce`, so a game's income step already sees a lock. A prestige reset starts the
 * gauge over unless `reset` says otherwise.
 */
export declare function gauge<const K extends string, G extends object = object>(def: {
    readonly key: K;
    readonly max: number;
    readonly trip?: GaugeTrip;
    readonly rate: (state: G, ctx: CallbackContext) => number;
    readonly awayRate?: (state: G, ctx: CallbackContext) => number;
    readonly onTrip?: (draft: Draft<G>, now: number) => void;
    readonly reset?: ResetRule<GaugeState>;
}): GaugeFeature<K>;
