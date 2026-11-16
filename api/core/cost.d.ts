import { type Decimal, type DecimalSource } from "./decimal";
/**
 * Cost curves and bulk buying. A price is a function of how many are already bought; the usual one is geometric
 * (`base x growth^bought`), whose sums have closed forms, so "buy 10", "buy max" and "how many can I afford" are
 * worked out in one step however large the numbers. With `every`, the price holds for a set and steps between
 * sets (`base x growth^floor(bought / every)`: ten at one price, the next ten at the next). A game with its own
 * curve passes a function instead, and the same three questions are answered by walking it. Each price is a whole
 * number (rounded up unless `round` says otherwise): the small prices are added one by one and the rest in closed
 * form, since past what a double holds exactly a rounded price is the price.
 */
/** A price that grows geometrically: the first costs `base`, each further step `growth` times the last. */
export interface GeometricCost {
    readonly base: DecimalSource;
    readonly growth: DecimalSource;
    /** How many are bought at one price before it steps (default 1: every one costs more than the last). */
    readonly every?: number;
    /**
     * How each price is made a whole number: `"ceil"` (the default) rounds up, `"floor"` down, `"nearest"` to the
     * closest; `"none"` keeps the price as it falls, fractions and all. Up is the default because `fmt` floors: a price
     * of 11.5 left as it falls reads as 11 and a player holding 11.2 cannot buy, where a rounded-up 12 reads as what
     * it costs. A bulk price (`costOfMany`) is always the sum of the rounded single prices.
     */
    readonly round?: "ceil" | "floor" | "nearest" | "none";
}
/** A cost curve: geometric, or the game's own price for the next one when `bought` are bought. */
export type CostCurve = GeometricCost | ((bought: number) => DecimalSource);
/** The most a walked (non-geometric) curve is asked for in one call. */
export declare const WALK_LIMIT = 10000;
/** The price of the next one when `bought` are bought. */
export declare function costAt(curve: CostCurve, bought: number): Decimal;
/**
 * The price of the next `count` together when `bought` are bought. Geometric: `base x growth^bought x (growth^count
 * - 1) / (growth - 1)`, or `base x count` at a growth of 1; with `every`, the rest of the current set at its price,
 * the whole sets after it as one geometric sum, then the part of the last set. A function curve is summed,
 * `WALK_LIMIT` at most.
 */
export declare function costOfMany(curve: CostCurve, bought: number, count: number): Decimal;
/**
 * How many more `balance` covers when `bought` are bought, `limit` at most. Geometric: `floor(log_growth(balance x
 * (growth - 1) / next + 1))`, then checked against the sum either side, since the logarithm is a float. A curve
 * that costs nothing and never grows is bounded by `limit` alone (0 without one).
 */
export declare function maxAffordable(curve: CostCurve, bought: number, balance: DecimalSource, limit?: number): number;
/** A count of whole steps: `floor(value / every)`, the "every ten bought" of a set bonus or a milestone rank. */
export declare function stepsOf(value: number, every: number): number;
/** How many more complete the current step of `every`: 10 bought of 10 is a fresh step, so the answer is `every`. */
export declare function untilStep(value: number, every: number): number;
/** One threshold on a count, and what the game attaches to it. */
export interface Threshold<T> {
    readonly at: number;
    readonly gives: T;
}
/** What every threshold reached at `value` gives, in the order listed. */
export declare function reached<T>(thresholds: readonly Threshold<T>[], value: number): T[];
/** The lowest threshold `value` has not reached, or null past the last. */
export declare function nextThreshold<T>(thresholds: readonly Threshold<T>[], value: number): Threshold<T> | null;
