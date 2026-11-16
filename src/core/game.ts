import {
  BUILT_IN_CLOCK,
  type ClockFeature,
  type ClockLens,
  type ClockSpec,
  clockFeature,
} from "./clock-feature";
import type { FeatureApi, FeatureSpec, Migration, Phase, StateOf } from "./feature";
import { PHASES, resetRuleOf } from "./feature";
import { seedRng } from "./rng";
import { migrationProblems } from "./save";
import { declaredSteps } from "./tick";
import type { AnyVocab } from "./vocab";

/**
 * The save's key in the storage, its version, and the game's own migrations over the whole saved state, keyed by
 * the version each produces (`3` takes a save at 2 to 3). With the features' own, they run on load and import.
 */
export interface SaveSpec {
  readonly key: string;
  readonly version: number;
  readonly migrations?: Readonly<Record<number, Migration>>;
}

/**
 * Per phase, the step ids (`<featureKey>.<phase>.<name>`) that run first, in this order; the phase's other
 * steps follow in feature-list order (the clock's last).
 */
export type StepOrder = { readonly [P in Phase]?: readonly string[] };

/** The feature tuple the game ends up with: the built-in clock joins it when the game names no clock fields. */
export type FeaturesOf<F extends readonly FeatureSpec[], C> = C extends undefined ? [...F, ClockFeature] : F;

/** The definition `defineGame` takes: id, save key and version, features, clock, vocabulary and the game's extras. */
export interface GameDef<
  F extends readonly FeatureSpec[],
  R extends object,
  C extends ClockSpec<F> | undefined,
  G extends object,
  V extends AnyVocab | undefined,
> {
  readonly id: string;
  readonly save: SaveSpec;
  readonly features: F;
  readonly order?: StepOrder;
  /** Where the clock's fields already live; omitted, the engine keeps them under `clock`. */
  readonly clock?: C;
  /** Actions at the store's root, beside the engine's (`tick`, `catchUp`, …). */
  readonly actions?: (api: FeatureApi<G>) => R;
  /** The game's words (`vocab({ currencies, stats, rarities })`); a feature built over a vocabulary must name this one. */
  readonly vocab?: V;
}

/** A game. `V` is its vocabulary, or undefined when it declares none; written without it, any game. */
export interface Game<
  F extends readonly FeatureSpec[],
  R extends object = Record<never, never>,
  V extends AnyVocab | undefined = AnyVocab | undefined,
> {
  readonly id: string;
  readonly save: SaveSpec;
  readonly features: F;
  readonly order: StepOrder;
  readonly clock: ClockLens;
  readonly actions: (api: never) => R;
  readonly vocab: V;
}

/** A game's vocabulary type, for `CurrencyOf<GameVocab<typeof game>>` and the like. */
export type GameVocab<G> = G extends { readonly vocab: infer V extends AnyVocab } ? V : never;

/** Any game, as the runner and the store take it. */
export type AnyGame = Game<readonly FeatureSpec[], object>;

const noActions = <R extends object>(): R => ({}) as R;

/**
 * Declares a game: its features in order, where its clock lives, and which steps run first in a phase. Checks
 * at definition time, naming the feature in the error: keys are unique, transient and kept keys exist in
 * `initial`, every id in `order` is a step some feature (or the clock) declares in that phase, and the migrations,
 * when there are any, step through every version from the oldest they declare to the save's.
 */
export function defineGame<
  const F extends readonly FeatureSpec[],
  R extends object = Record<never, never>,
  C extends ClockSpec<F> | undefined = undefined,
  G extends object = StateOf<FeaturesOf<F, C>>,
  V extends AnyVocab | undefined = undefined,
>(def: GameDef<F, R, C, G, V>): Game<FeaturesOf<F, C>, R, V> {
  const features = (def.clock ? def.features : [...def.features, clockFeature]) as FeaturesOf<F, C>;
  const clock: ClockLens = def.clock ?? BUILT_IN_CLOCK;
  const order = def.order ?? {};
  validate(def.id, features, clock, order, def.vocab);
  for (const problem of migrationProblems({ save: def.save, features }))
    throw new Error(`defineGame "${def.id}": ${problem}`);
  // `actions` was typed over `G`; the store supplies the api (see `feature.ts`).
  const actions = def.actions ?? noActions<R>;
  return { id: def.id, save: def.save, features, order, clock, actions, vocab: def.vocab as V };
}

const PROBE_CONTEXT = { now: 0, rng: seedRng(0), reason: "new" } as const;

function validate(
  id: string,
  features: readonly FeatureSpec[],
  clock: ClockLens,
  order: StepOrder,
  vocab: AnyVocab | undefined,
): void {
  const fail = (message: string): never => {
    throw new Error(`defineGame "${id}": ${message}`);
  };
  const seen = new Set<string>();
  for (const f of features) {
    if (seen.has(f.key)) fail(`two features share the key "${f.key}"`);
    if (f.vocab && f.vocab !== vocab)
      fail(`feature "${f.key}" speaks a vocabulary the game does not declare`);
    seen.add(f.key);
    for (const r of f.reach)
      if (!features.includes(r)) fail(`feature "${f.key}" reaches "${r.key}", which the game does not list`);
    const keys = Object.keys(f.initial(PROBE_CONTEXT));
    for (const k of f.transient)
      if (!keys.includes(k)) fail(`feature "${f.key}": transient key "${k}" is not in its initial state`);
    const { depth, rule } = resetRuleOf(f.reset);
    if (!(depth >= 1)) fail(`feature "${f.key}": a reset depth is 1 or more`);
    if (typeof rule === "object")
      for (const k of rule.keep)
        if (!keys.includes(k)) fail(`feature "${f.key}": kept key "${k}" is not in its initial state`);
    for (const phase of PHASES)
      for (const name of Object.keys(f.steps[phase] ?? {}))
        if (name.includes(".")) fail(`feature "${f.key}": step name "${name}" cannot contain "."`);
  }
  if (!seen.has(clock.feature)) fail(`the clock names the feature "${clock.feature}", which the game lacks`);
  const ids = new Set(declaredSteps(features, clock).map((s) => s.id));
  for (const phase of PHASES)
    for (const stepId of order[phase] ?? []) {
      if (!ids.has(stepId)) fail(`order.${phase} names "${stepId}", a step no feature declares`);
      if (stepId.split(".")[1] !== phase) fail(`order.${phase} names "${stepId}", a step of another phase`);
    }
}
