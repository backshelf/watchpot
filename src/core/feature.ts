/** immer's draft of `T`, as a recipe or a step sees it: for a hand-written draft helper's parameter. */
export type { Draft } from "immer";

/**
 * The feature: the unit a game is made of. One declaration brings its own saved state, the keys that never
 * save, its actions, its tick steps by phase, its prestige reset rule, its migrations and its merge. The store
 * holds every feature's state under its `key`, and `StateOf` reads the whole store's type off the feature tuple.
 *
 * A feature's callbacks (steps, actions) see the game as a draft typed `G`: its own slice under its key plus the
 * features it names in `reach`, so a feature that credits a wallet writes `reach: () => [wallet]` and
 * `s.wallet.gold` is typed, with no annotation anywhere. `reach` is lazy, so it may name a feature declared further
 * down. Two features that reach each other name one side by value and the other by its state type
 * (`reach: reach<{ lid: LidState }>()`), which `defineGame` checks against the feature really listed under that
 * key. A value reach brings the feature's state and actions; a type reach brings what the type says. `Feature`
 * itself erases `G`, so a game's state type may be derived from the tuple of its features without a cycle.
 */

import type { DerivedLayers } from "./derived";
import { flatDerived } from "./derived";
import type {
  Feature,
  FeatureDef,
  FeatureSpec,
  Migration,
  Move,
  NeedsOf,
  ReachOf,
  StateOf,
} from "./feature-types";
import { EARNING_PHASES } from "./steps";

export * from "./derived";
export * from "./feature-types";
export * from "./reset-rule";
export * from "./steps";

/** A feature reached by its state type instead of by value: `reach<{ lid: LidState }>()`. */
export interface ReachType<T extends object> {
  readonly reachType: true;
  /** Type only. */
  readonly state?: T;
}
const REACH_TYPE: ReachType<never> = { reachType: true };
/**
 * Reaches features by their state types: the whole `reach`, or one entry of its list. For the far side of a cycle,
 * where naming the feature itself would make each one's type depend on the other's. `defineGame` refuses a game
 * that lacks a key named here, or whose feature under that key has another state.
 */
export function reach<T extends object>(): ReachType<T> {
  return REACH_TYPE as ReachType<T>;
}

/** What `reach` may hold: a list of features and type reaches, or one type reach. */
export type ReachShape = readonly (FeatureSpec | ReachType<object>)[] | ReachType<object>;

const isReachType = (x: unknown): x is ReachType<object> =>
  typeof x === "object" && x !== null && (x as { reachType?: unknown }).reachType === true;

function resolveReach(given: ReachShape | (() => ReachShape) | undefined): () => readonly FeatureSpec[] {
  let resolved: readonly FeatureSpec[] | undefined;
  return () => {
    if (resolved) return resolved;
    const shape = typeof given === "function" ? given() : (given ?? []);
    const list = isReachType(shape) ? [] : (shape as readonly (FeatureSpec | ReachType<object>)[]);
    resolved = list.filter((x): x is FeatureSpec => !isReachType(x));
    return resolved;
  };
}

/**
 * Declares a feature. `K`, `S`, `A`, the reach `R` and the derived values are read off the definition; `G`, the
 * game the callbacks see, is the feature's own slice (derived values included) plus its reach.
 */
export function defineFeature<
  const K extends string,
  S extends object,
  A extends object,
  const R extends ReachShape,
  D1,
  D2,
  D3,
  D4,
  G extends object = Record<K, S & D1 & D2 & D3 & D4> & ReachOf<R>,
>(
  def: FeatureDef<K, S, A, R, G, D1 & D2 & D3 & D4, DerivedLayers<K, S, ReachOf<R>, D1, D2, D3, D4>>,
): Feature<K, S, A, NeedsOf<R>, D1 & D2 & D3 & D4>;
export function defineFeature<
  const K extends string,
  S extends object,
  A extends object = Record<never, never>,
  const R extends ReachShape = readonly [],
  Dv = Record<never, never>,
  G extends object = Record<K, S & Dv> & ReachOf<R>,
>(def: FeatureDef<K, S, A, R, G, Dv>): Feature<K, S, A, NeedsOf<R>, Dv>;
export function defineFeature(
  def: FeatureDef<string, object, object, ReachShape, object, unknown, unknown>,
): Feature<string, object, object, unknown, unknown> {
  if (def.key.includes(".")) throw new Error(`feature "${def.key}": a key cannot contain "."`);
  for (const phase of EARNING_PHASES)
    for (const [name, entry] of Object.entries(def.steps?.[phase] ?? {}))
      if (typeof entry === "function" || entry.pass === undefined)
        throw new Error(
          `feature "${def.key}": the ${phase} step "${name}" must name its pass, as { pass: "tick" | "catchUp" | "both", run }: a step that earns in a catch-up pays the whole time away`,
        );
  return {
    key: def.key,
    reach: resolveReach(def.reach),
    initial: def.initial,
    transient: def.transient ?? [],
    actions: def.actions ?? (() => ({})),
    steps: def.steps ?? {},
    reset: def.reset ?? "run",
    migrations: def.migrations ?? {},
    merge: def.merge,
    derived: flatDerived(def.derived),
    vocab: def.vocab,
    moves: def.moves,
  };
}

/**
 * The same feature with its auto-player moves: for a feature a factory made (`currencies`, `prestige`, `gacha`),
 * whose definition the game does not write itself. Keeps everything else the factory put on it.
 */
export function withMoves<F extends FeatureSpec, G extends object = StateOf<readonly [F]>>(
  f: F,
  moves: (state: G) => readonly Move<G>[],
): F {
  return { ...f, moves };
}

/**
 * The same feature with save migrations: for a feature a factory made (`generators`, `dimensions`, `layers`),
 * whose definition the game does not write itself. `migrations[n]` takes the feature's slice saved before version
 * `n` to its shape at `n`. Keeps everything else the factory put on it; steps the feature already had are kept
 * unless the same version is given again.
 */
export function withMigrations<F extends FeatureSpec>(
  f: F,
  migrations: Readonly<Record<number, Migration>>,
): F {
  return { ...f, migrations: { ...f.migrations, ...migrations } };
}
