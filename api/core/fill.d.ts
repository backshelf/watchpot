/**
 * A deep fill of a saved value from a fresh one, for a feature's `merge` (the loader fills one level down). Where
 * both sides are plain objects it recurses; a missing key takes the fresh value; a saved key `fresh` lacks is kept
 * (an id-keyed record); a Decimal in `fresh` coerces a saved number or string; anything else, arrays included,
 * the saved value wins whole. Returns a new object and mutates neither side. A `saved` that is not a plain object
 * gives `fresh` itself.
 */
export declare function fillDeep<T extends object>(saved: unknown, fresh: T): T;
