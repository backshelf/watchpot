import { D, isDecimal } from "./decimal";
import { isPlainObject } from "./storage";

/**
 * A deep fill of a saved value from a fresh one, for a feature's `merge` (the loader fills one level down). Where
 * both sides are plain objects it recurses; a missing key takes the fresh value; a saved key `fresh` lacks is kept
 * (an id-keyed record); a Decimal in `fresh` coerces a saved number or string; anything else, arrays included,
 * the saved value wins whole. Returns a new object and mutates neither side. A `saved` that is not a plain object
 * gives `fresh` itself.
 */
export function fillDeep<T extends object>(saved: unknown, fresh: T): T {
  if (!isPlainObject(saved)) return fresh;
  const out: Record<string, unknown> = { ...(fresh as Record<string, unknown>) };
  for (const [k, v] of Object.entries(saved)) {
    const def = out[k];
    if (isPlainObject(def) && isPlainObject(v)) out[k] = fillDeep(v, def);
    else if (isDecimal(def) && !isDecimal(v) && (typeof v === "number" || typeof v === "string"))
      out[k] = D(v);
    else out[k] = v;
  }
  return out as T;
}
