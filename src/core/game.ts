import {
  BUILT_IN_CLOCK,
  type ClockFeature,
  type ClockLens,
  type ClockSpec,
  clockFeature,
} from "./clock-feature";
import type { DataOf, FeatureApi, FeatureSpec, Migration, NeedsOfAll, StateOf } from "./feature";
import { PHASES, resetRuleOf } from "./feature";
import { seedRng } from "./rng";
import { migrationProblems } from "./save";
import { declaredSteps, orderPhase } from "./tick";
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

/** The feature tuple the game ends up with: the built-in clock joins it when the game names no clock fields. */
export type FeaturesOf<F extends readonly FeatureSpec[], C> = C extends undefined ? [...F, ClockFeature] : F;

/**
 * Checks every reach given by type against the features listed: `unknown` when each key named exists with that
 * state, else a shape no feature list satisfies, whose text is the error.
 */
export type ReachCheck<F extends readonly FeatureSpec[]> =
  DataOf<F> extends NeedsOfAll<F>
    ? unknown
    : { readonly "a feature reaches, by type, state this game does not have": NeedsOfAll<F> };

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
  readonly features: F & ReachCheck<F>;
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
 * Declares a game: its features in order and where its clock lives.
 *
 * Steps run phase by phase (`PHASES`), whatever the list says; inside one phase they run in feature-list order
 * unless a step says `after` or `before`. A step that acts on what another step of the same phase wrote names it
 * (`after: "wallet"`); a value worked out from the state is a `derived` value instead, which needs no order.
 *
 * Checks at definition time, naming the feature in the error: keys are unique, transient and kept keys exist in
 * `initial`, no action or derived value is named like a key of its feature's `initial` (or a game action like a
 * feature's key), every `after` and `before` names a feature or a step of the same phase and they do not go
 * round, and the migrations, when there are any, step through every version from the oldest they declare to the
 * save's. It calls every `initial` and builds every `actions` once to check them, so both stay pure and cheap.
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
  // `actions` was typed over `G`; the store supplies the api (see `feature.ts`).
  const actions = def.actions ?? noActions<R>;
  validate(def.id, features, clock, def.vocab, actions);
  for (const problem of migrationProblems({ save: def.save, features }))
    throw new Error(`defineGame "${def.id}": ${problem}`);
  return { id: def.id, save: def.save, features, clock, actions, vocab: def.vocab as V };
}

const PROBE_CONTEXT = { now: 0, wallNow: 0, rng: seedRng(0), reason: "new" } as const;

/** The api `validate` builds actions on, to read their names: nothing it does reaches a store. */
const PROBE_API: FeatureApi<object> = {
  set: () => undefined as never,
  get: () => ({}),
  now: () => 0,
  rng: (label) => seedRng(label),
  resetRun: () => {},
  store: undefined as never,
};

function validate(
  id: string,
  features: readonly FeatureSpec[],
  clock: ClockLens,
  vocab: AnyVocab | undefined,
  actions: (api: never) => object,
): void {
  const fail = (message: string): never => {
    throw new Error(`defineGame "${id}": ${message}`);
  };
  const seen = new Set<string>();
  for (const f of features) {
    if (seen.has(f.key)) fail(`two features share the key "${f.key}"`);
    if (f.vocab && f.vocab !== vocab)
      fail(
        `feature "${f.key}" speaks a vocabulary the game does not declare: the game's \`vocab\` must be the very object the feature was built over (an equal copy is refused too)`,
      );
    seen.add(f.key);
    for (const r of f.reach())
      if (!features.includes(r)) fail(`feature "${f.key}" reaches "${r.key}", which the game does not list`);
    const keys = Object.keys(f.initial(PROBE_CONTEXT));
    // The slice is `{ ...initial, ...actions }`: an action named like a field would replace it without a word.
    for (const k of Object.keys(f.actions(PROBE_API as never)))
      if (keys.includes(k))
        fail(`feature "${f.key}": the action "${k}" is named like a key of its initial state; rename one`);
    const acts = Object.keys(f.actions(PROBE_API as never));
    for (const k of Object.keys(f.derived)) {
      if (keys.includes(k))
        fail(
          `feature "${f.key}": the derived value "${k}" is named like a key of its initial state; drop one`,
        );
      if (acts.includes(k))
        fail(`feature "${f.key}": the derived value "${k}" is named like an action; rename one`);
    }
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
  // The game's actions sit at the root beside the slices: one named like a feature's key would replace its slice.
  for (const k of Object.keys(actions(PROBE_API as never)))
    if (seen.has(k)) fail(`the game action "${k}" is named like the feature "${k}"; rename one`);
  const declared = declaredSteps(features, clock);
  for (const phase of PHASES) {
    const inPhase = declared.filter((s) => s.phase === phase);
    for (const step of inPhase)
      for (const [word, names] of [
        ["after", step.after],
        ["before", step.before],
      ] as const)
        for (const name of names) {
          if (seen.has(name) || name === "clock") continue;
          const [key = "", stepPhase] = name.split(".");
          if (!seen.has(key) && key !== "clock")
            fail(`step "${step.id}" runs ${word} "${name}", but the game has no feature "${key}"`);
          if (stepPhase !== phase)
            fail(`step "${step.id}" runs ${word} "${name}", which is not a step of the ${phase} phase`);
          if (!inPhase.some((s) => s.id === name))
            fail(`step "${step.id}" runs ${word} "${name}": feature "${key}" declares no such step`);
        }
    for (const pass of ["tick", "catchUp"] as const)
      try {
        orderPhase(inPhase.filter((s) => s.pass === undefined || s.pass === pass));
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e));
      }
  }
}
