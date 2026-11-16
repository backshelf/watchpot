import Decimal from "break_eternity.js";
export { Decimal };
/** Anything the engine accepts where a Decimal is wanted. */
export type DecimalSource = Decimal | number | string;
/**
 * Coerce anything Decimal-like. A Decimal passes through untouched; Decimal values are never mutated.
 *
 * Compare Decimals with their methods, never with operators: `a.lt(b)`, `a.gte(b)`, `a.eq(b)`. `D(3) < D(20)` and
 * `D(1) === D(1)` compile and are both false (`<` compares the objects' strings, `===` their identity).
 */
export declare function D(value: DecimalSource): Decimal;
/** Decimal zero. */
export declare const ZERO: Decimal;
/** Decimal one. */
export declare const ONE: Decimal;
/** Whether a value is a Decimal. */
export declare function isDecimal(value: unknown): value is Decimal;
/** The Decimal sum of a list of values. */
export declare function sum(values: Iterable<DecimalSource>): Decimal;
/** Floors to a whole number and clamps at zero: the shape every pill shows. */
export declare function wholeNonNegative(value: Decimal): Decimal;
/** Takes `amount` from `balance` if it fits. Returns the new balance or null when it does not. */
export declare function take(balance: Decimal, amount: DecimalSource): Decimal | null;
/** Decimal.toNumber with a finite fallback, for the few places a JS number is needed (NumberFlow, odds). */
export declare function toSafeNumber(value: Decimal, fallback?: number): number;
