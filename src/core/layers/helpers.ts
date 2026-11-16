import { D, type Decimal, type DecimalSource } from "../decimal";
import type { Effect } from "../graph/stats";

/** Helpers for a game's layer definitions. */

/**
 * `log10(x + 10)`: 1 at zero, about one more per tenfold. Put an effect that reads an unbounded resource through
 * it, so a loop of effects feeding each other stays damped.
 */
export const damp = (x: DecimalSource): Decimal => D(x).add(10).log10();

/** An effect that multiplies a stat. `quiet` marks it for a breakdown that hides constants its text states. */
export const mulStat = <S extends string, Q>(
  stat: S,
  value: (q: Q) => DecimalSource,
  quiet = false,
): Effect<S, Q> => ({ stat, mul: value, quiet });

/** An effect that adds to a stat's base, before any multiplier. */
export const addStat = <S extends string, Q>(
  stat: S,
  value: (q: Q) => DecimalSource,
  quiet = false,
): Effect<S, Q> => ({ stat, add: value, quiet });
