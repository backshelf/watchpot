import Decimal from "break_eternity.js";

export { Decimal };

/** Anything the engine accepts where a Decimal is wanted. */
export type DecimalSource = Decimal | number | string;

/** Coerce anything Decimal-like. A Decimal passes through untouched; Decimal values are never mutated. */
export function D(value: DecimalSource): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

/** Decimal zero. */
export const ZERO = new Decimal(0);
/** Decimal one. */
export const ONE = new Decimal(1);

/** Whether a value is a Decimal. */
export function isDecimal(value: unknown): value is Decimal {
  return value instanceof Decimal;
}

/** The Decimal sum of a list of values. */
export function sum(values: Iterable<DecimalSource>): Decimal {
  let total = ZERO;
  for (const v of values) total = total.add(v);
  return total;
}

/** Floors to a whole number and clamps at zero: the shape every pill shows. */
export function wholeNonNegative(value: Decimal): Decimal {
  return value.lt(0) ? ZERO : value.floor();
}

/** Takes `amount` from `balance` if it fits. Returns the new balance or null when it does not. */
export function take(balance: Decimal, amount: DecimalSource): Decimal | null {
  const a = D(amount);
  return balance.gte(a) ? balance.sub(a) : null;
}

/** Decimal.toNumber with a finite fallback, for the few places a JS number is needed (NumberFlow, odds). */
export function toSafeNumber(value: Decimal, fallback = 0): number {
  const n = value.toNumber();
  return Number.isFinite(n) ? n : fallback;
}
