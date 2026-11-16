import { D, type Decimal, type DecimalSource, ONE, ZERO } from "./decimal";

/**
 * Cost curves and bulk buying. A price is a function of how many are already bought; the usual one is geometric
 * (`base x growth^bought`), whose sums have closed forms, so "buy 10", "buy max" and "how many can I afford" are
 * worked out in one step however large the numbers. With `every`, the price holds for a set and steps between
 * sets (`base x growth^floor(bought / every)`: ten at one price, the next ten at the next). A game with its own
 * curve passes a function instead, and the same three questions are answered by walking it. With `round`, each
 * price is a whole number: the small prices are added one by one and the rest in closed form, since past what a
 * double holds exactly a rounded price is the price.
 */

/** A price that grows geometrically: the first costs `base`, each further step `growth` times the last. */
export interface GeometricCost {
  readonly base: DecimalSource;
  readonly growth: DecimalSource;
  /** How many are bought at one price before it steps (default 1: every one costs more than the last). */
  readonly every?: number;
  /** Rounds each price to a whole number: down, up or to the nearest. Default: the price as it falls. */
  readonly round?: "floor" | "ceil" | "nearest";
}

/** A cost curve: geometric, or the game's own price for the next one when `bought` are bought. */
export type CostCurve = GeometricCost | ((bought: number) => DecimalSource);

/** The most a walked (non-geometric) curve is asked for in one call. */
export const WALK_LIMIT = 10_000;

const isGeometric = (curve: CostCurve): curve is GeometricCost => typeof curve !== "function";
const everyOf = (curve: GeometricCost): number => Math.max(1, Math.floor(curve.every ?? 1));
const whole = (n: number): number => Math.max(0, Math.floor(n));
/** Past this a Decimal holds no fraction, so rounding a price changes nothing and the closed forms are exact. */
const EXACT = 9e15;
const rounded = (curve: GeometricCost, price: Decimal): Decimal =>
  curve.round === "floor"
    ? price.floor()
    : curve.round === "ceil"
      ? price.ceil()
      : curve.round === "nearest"
        ? price.round()
        : price;

/** The price of the next one when `bought` are bought. */
export function costAt(curve: CostCurve, bought: number): Decimal {
  const n = whole(bought);
  if (!isGeometric(curve)) return D(curve(n));
  return rounded(curve, D(curve.base).mul(D(curve.growth).pow(Math.floor(n / everyOf(curve)))));
}

/** The sum of `count` prices from `first`, each `growth` times the last: `first x (growth^count - 1) / (growth - 1)`. */
function geometricSum(first: Decimal, growth: Decimal, count: number): Decimal {
  if (count <= 0) return ZERO;
  if (growth.eq(1)) return first.mul(count);
  return first.mul(growth.pow(count).sub(1)).div(growth.sub(1));
}

/**
 * The price of the next `count` together when `bought` are bought. Geometric: `base x growth^bought x (growth^count
 * - 1) / (growth - 1)`, or `base x count` at a growth of 1; with `every`, the rest of the current set at its price,
 * the whole sets after it as one geometric sum, then the part of the last set. A function curve is summed,
 * `WALK_LIMIT` at most.
 */
export function costOfMany(curve: CostCurve, bought: number, count: number): Decimal {
  const n = whole(count);
  const had = whole(bought);
  if (n === 0) return ZERO;
  if (!isGeometric(curve)) {
    let total = ZERO;
    for (let i = 0; i < Math.min(n, WALK_LIMIT); i++) total = total.add(costAt(curve, had + i));
    return total;
  }
  const growth = D(curve.growth);
  const every = everyOf(curve);
  if (curve.round) {
    // Whole-number prices have no closed form while they are small: add those, then the rest as the plain curve.
    let total = ZERO;
    let i = 0;
    while (i < n && i < WALK_LIMIT) {
      const price = costAt(curve, had + i);
      if (price.gte(EXACT)) break;
      total = total.add(price);
      i += 1;
    }
    return i >= n ? total : total.add(costOfMany({ ...curve, round: undefined }, had + i, n - i));
  }
  if (every === 1) return geometricSum(costAt(curve, had), growth, n);
  const head = Math.min(n, every - (had % every));
  const sets = Math.floor((n - head) / every);
  const tail = n - head - sets * every;
  return costAt(curve, had)
    .mul(head)
    .add(geometricSum(costAt(curve, had + head).mul(every), growth, sets))
    .add(tail > 0 ? costAt(curve, had + head + sets * every).mul(tail) : ZERO);
}

/** How many prices from `first`, each `growth` times the last, `held` covers: the logarithm, not yet checked. */
function geometricCount(first: Decimal, growth: Decimal, held: Decimal): number {
  if (first.lte(0)) return Number.MAX_SAFE_INTEGER;
  if (held.lt(first)) return 0;
  if (growth.eq(1)) return held.div(first).floor().toNumber();
  if (growth.lt(1)) return Number.MAX_SAFE_INTEGER;
  return Math.floor(held.mul(growth.sub(1)).div(first).add(ONE).log(growth).toNumber());
}

/**
 * How many more `balance` covers when `bought` are bought, `limit` at most. Geometric: `floor(log_growth(balance x
 * (growth - 1) / next + 1))`, then checked against the sum either side, since the logarithm is a float. A curve
 * that costs nothing and never grows is bounded by `limit` alone (0 without one).
 */
export function maxAffordable(
  curve: CostCurve,
  bought: number,
  balance: DecimalSource,
  limit = Number.POSITIVE_INFINITY,
): number {
  const held = D(balance);
  const had = whole(bought);
  const cap = limit === Number.POSITIVE_INFINITY ? limit : whole(limit);
  if (cap === 0 || held.lte(0)) return 0;
  if (!isGeometric(curve)) {
    let total = ZERO;
    let n = 0;
    while (n < Math.min(cap, WALK_LIMIT)) {
      total = total.add(costAt(curve, had + n));
      if (total.gt(held)) break;
      n += 1;
    }
    return n;
  }
  const growth = D(curve.growth);
  const every = everyOf(curve);
  // The estimate reads the plain curve; the checks after it read the rounded prices, so the answer is exact.
  const first = costAt({ ...curve, round: undefined }, had);
  if (first.lte(0) && growth.lte(1)) return Number.isFinite(cap) ? cap : 0;
  let n: number;
  if (every === 1) n = geometricCount(first, growth, held);
  else {
    // The rest of the current set, then whole sets; the checks below walk into the set after.
    const head = every - (had % every);
    const headCost = first.mul(head);
    if (held.lt(headCost)) n = geometricCount(first, ONE, held);
    else {
      const sets = geometricCount(costAt(curve, had + head).mul(every), growth, held.sub(headCost));
      n = head + Math.min(sets, Number.MAX_SAFE_INTEGER / (2 * every)) * every;
    }
  }
  if (!Number.isFinite(n)) n = Number.MAX_SAFE_INTEGER;
  n = Math.max(0, Math.min(n, cap));
  while (n > 0 && costOfMany(curve, had, n).gt(held)) n -= 1;
  while (n < cap && costOfMany(curve, had, n + 1).lte(held)) n += 1;
  return n;
}

/** A count of whole steps: `floor(value / every)`, the "every ten bought" of a set bonus or a milestone rank. */
export function stepsOf(value: number, every: number): number {
  return every > 0 ? Math.floor(Math.max(0, value) / every) : 0;
}

/** How many more complete the current step of `every`: 10 bought of 10 is a fresh step, so the answer is `every`. */
export function untilStep(value: number, every: number): number {
  if (!(every > 0)) return 0;
  return every - (whole(value) % every);
}

/** One threshold on a count, and what the game attaches to it. */
export interface Threshold<T> {
  readonly at: number;
  readonly gives: T;
}

/** What every threshold reached at `value` gives, in the order listed. */
export function reached<T>(thresholds: readonly Threshold<T>[], value: number): T[] {
  const out: T[] = [];
  for (const t of thresholds) if (value >= t.at) out.push(t.gives);
  return out;
}

/** The lowest threshold `value` has not reached, or null past the last. */
export function nextThreshold<T>(thresholds: readonly Threshold<T>[], value: number): Threshold<T> | null {
  let next: Threshold<T> | null = null;
  for (const t of thresholds) if (value < t.at && (next === null || t.at < next.at)) next = t;
  return next;
}
