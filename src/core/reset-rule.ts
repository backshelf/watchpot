import type { FeatureSpec, InitialContext } from "./feature-types";

/**
 * What a reset does to the feature once it reaches it: back to `initial` (`"run"`), back to `initial` with the
 * named keys carried over, or a function from the state before and a fresh initial to the state after (its `ctx`
 * carries the reset's `depth`, for a rule that keeps less the deeper the reset).
 */
export type ReachedRule<S extends object> =
  | "run"
  | { readonly keep: readonly (keyof S & string)[] }
  | ((before: S, fresh: S, ctx: InitialContext) => S);

/**
 * What a prestige reset (`resetRun`) does to the feature: a `ReachedRule` (`"run"` is the default), untouched
 * (`"never"`), or `{ depth, rule }`: untouched by a reset shallower than `depth`, and following `rule` (default
 * `"run"`) from that depth on. A second reset layer resets at depth 2, so what the first layer keeps for good but
 * the second wipes says `{ depth: 2 }`.
 */
export type ResetRule<S extends object> =
  | ReachedRule<S>
  | "never"
  | { readonly depth: number; readonly rule?: ReachedRule<S> };

/** A `ReachedRule` with its state type erased, as `FeatureSpec` holds it. */
export type AnyReachedRule =
  | "run"
  | { readonly keep: readonly string[] }
  | ((before: never, fresh: never, ctx: InitialContext) => object);

/** A feature's reset rule split in two: the shallowest reset that touches it (`Infinity` for `"never"`), and what that reset does. */
export function resetRuleOf(reset: FeatureSpec["reset"]): { depth: number; rule: AnyReachedRule } {
  if (reset === "never") return { depth: Number.POSITIVE_INFINITY, rule: "run" };
  if (typeof reset === "object" && "depth" in reset) return { depth: reset.depth, rule: reset.rule ?? "run" };
  return { depth: 1, rule: reset };
}

/**
 * What a `ReachedRule` makes of a state once a reset reaches it: `fresh` for `"run"`, `fresh` with the kept keys
 * from `before`, or the function's result. For a factory that wraps the game's rule in its own.
 */
export function applyReachedRule<S extends object>(
  rule: ReachedRule<S>,
  before: S,
  fresh: S,
  ctx: InitialContext,
): S {
  if (rule === "run") return fresh;
  if (typeof rule === "function") return rule(before, fresh, ctx);
  const out = { ...fresh };
  for (const k of rule.keep) out[k] = before[k];
  return out;
}
