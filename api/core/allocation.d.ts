import { type CostCurve } from "./cost";
import { type Decimal, type DecimalSource } from "./decimal";
import type { DimensionAway } from "./dimensions";
import { type Feature, type ResetRule } from "./feature";
/** The units assigned across every sink. */
export declare function allocatedUnits(assigned: Readonly<Record<string, number>>): number;
/** What is left of the pool: `pool - allocated`, never negative. */
export declare function freeUnits(assigned: Readonly<Record<string, number>>, pool: number): number;
/**
 * Moves `n` units into sink `id` (or out of it, for a negative `n`): into it no more than is free and than its `cap`
 * leaves room for, out of it no more than it holds. Pure; returns the new record.
 */
export declare function assignUnits(assigned: Readonly<Record<string, number>>, id: string, n: number, pool: number, cap?: number): Record<string, number>;
/**
 * Trims an assigned record to fit: every sink to its cap, then the total to the pool, taking from the end of `order`
 * (the most recently assigned last) first, and from any sink not in `order` after those. Pure and deterministic;
 * returns the new record (the same values when it already fits).
 */
export declare function rebalanceUnits(assigned: Readonly<Record<string, number>>, pool: number, order?: readonly string[], caps?: Readonly<Record<string, number>>): Record<string, number>;
interface SinkBase<G, E> {
    readonly id: string;
    /** The most it can hold, read off the whole game state (default: no cap). */
    readonly cap?: (state: G) => number;
    /** What its level gives, for the stat bus (a bar's level; a counting sink stays at level 0). */
    readonly effects?: (level: number) => readonly E[];
}
/**
 * One sink. Without `cost` it only counts what is assigned to it. With `cost` and `speed` it is a bar: each assigned
 * unit does `speed(state)` work a second, and the level's `cost` of work fills it and levels it up.
 */
export type SinkDef<G, E = never> = SinkBase<G, E> & ({
    readonly cost?: undefined;
    readonly speed?: undefined;
    readonly maxLevel?: undefined;
} | {
    /** The work to fill the bar at each level: a cost curve over the level (geometric is closed-form). */
    readonly cost: CostCurve;
    /** The work one assigned unit does a second. */
    readonly speed: (state: G) => DecimalSource;
    /** The level it stops at (default: none). */
    readonly maxLevel?: number;
});
/** The feature's saved state. */
export interface AllocationState {
    /** Units per sink id. */
    assigned: Record<string, number>;
    /** Sink ids, the most recently assigned last: the order a shrinking pool takes back from. */
    order: string[];
    /** Work into the current level, per bar. */
    progress: Record<string, Decimal>;
    /** Level per bar. */
    level: Record<string, number>;
}
/** The feature's actions. Each returns the units it moved. */
export interface AllocationActions {
    /** Moves `n` free units into a sink, clamped to what is free and to its cap: `assignUnits` on the saved record. */
    assign(id: string, n: number): number;
    /** Takes `n` units back out of a sink: `assignUnits` with `-n`. */
    unassign(id: string, n: number): number;
    /** Takes every unit back. */
    clear(): number;
    /** Moves everything free into one sink. */
    fill(id: string): number;
}
/** An allocation's rules, read off the game state. */
export interface AllocationRules<G, E> {
    readonly sinks: readonly SinkDef<G, E>[];
    sink(id: string): SinkDef<G, E> | undefined;
    /** The pool now. */
    pool(state: G): number;
    /** What is free now. */
    free(state: G): number;
    /** A sink's cap now (Infinity without one). */
    cap(state: G, id: string): number;
    /** A bar's work a second: assigned × speed (zero for a counting sink). */
    perSecond(state: G, id: string): Decimal;
    /** A bar's level, the work into it, the work it needs and the share filled. */
    bar(state: G, id: string): {
        level: number;
        into: Decimal;
        need: Decimal;
        share: number;
    };
    /** Every sink's effects at its level, sourced `<key>:<id>`. */
    contributions(slice: Pick<AllocationState, "level">): {
        source: string;
        effect: E;
    }[];
}
/** An `allocation` feature, carrying its rules as `.rules`. */
export type AllocationFeature<K extends string, G, E> = Feature<K, AllocationState, AllocationActions> & {
    readonly rules: AllocationRules<G, E>;
};
/**
 * A pool split between sinks, as a feature. It saves `{ assigned, order, progress, level }` under `key` (the stat bus's
 * source prefix too). `<key>.sync.pool` trims the record when the pool or a cap shrinks; `<key>.produce.fill` fills the
 * bars over a tick, and over an absence through `away` (default: all of it), several levels in one step when the work
 * covers them. A run reset clears it unless `reset` says otherwise. The callbacks read the whole game state, so
 * annotate one of them with the game's state type.
 */
export declare function allocation<const K extends string, E = never, G extends object = object>(def: {
    readonly key: K;
    readonly pool: (state: G) => number;
    readonly sinks: readonly SinkDef<G, E>[];
    readonly away?: (state: G) => DimensionAway;
    readonly reset?: ResetRule<AllocationState>;
}): AllocationFeature<K, G, E>;
export {};
