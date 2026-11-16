import { type Decimal, type DecimalSource } from "../decimal";
import type { Effect } from "../graph/stats";
/** Helpers for a game's layer definitions. */
/**
 * `log10(x + 10)`: 1 at zero, about one more per tenfold. Put an effect that reads an unbounded resource through
 * it, so a loop of effects feeding each other stays damped.
 */
export declare const damp: (x: DecimalSource) => Decimal;
/** An effect that multiplies a stat. `quiet` marks it for a breakdown that hides constants its text states. */
export declare const mulStat: <S extends string, Q>(stat: S, value: (q: Q) => DecimalSource, quiet?: boolean) => Effect<S, Q>;
/** An effect that adds to a stat's base, before any multiplier. */
export declare const addStat: <S extends string, Q>(stat: S, value: (q: Q) => DecimalSource, quiet?: boolean) => Effect<S, Q>;
