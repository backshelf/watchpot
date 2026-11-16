import type { Draft } from "immer";
import type { Mutate, StoreApi } from "zustand/vanilla";
import type { Decimal } from "./decimal";
import type { RngState } from "./rng";
import type { PersistedState } from "./storage";
import type { AnyVocab } from "./vocab";

/** immer's draft of `T`, as a recipe or a step sees it: for a hand-written draft helper's parameter. */
export type { Draft } from "immer";

/**
 * The feature: the unit a game is made of. One declaration brings its own saved state, the keys that never
 * save, its actions, its tick steps by phase, its prestige reset rule, its migrations and its merge. The store
 * holds every feature's state under its `key`, and `StateOf` reads the whole store's type off the feature tuple.
 *
 * A feature's callbacks (steps, actions) see the game as a draft typed `G`: its own slice under its key plus the
 * features it names in `reach`, so a feature that credits a wallet writes `reach: [wallet]` and `s.wallet.gold`
 * is typed, with no annotation anywhere. A game whose features reach each other in a cycle annotates
 * one draft or api parameter with its own state type instead (`(s: GameDraft, ctx) => …`); `G` is then read off
 * the annotation. `Feature` itself erases `G`, so a game's state type may be derived from the tuple of its
 * features without a cycle.
 */

/** The tick phases, in the order they run. */
export const PHASES = ["guard", "sync", "rates", "produce", "automate", "settle", "commit", "after"] as const;
/** A tick phase: `guard, sync, rates, produce, automate, settle, commit` or `after`. */
export type Phase = (typeof PHASES)[number];

/** The two passes: a live tick of `dtMs`, or a catch-up over the gap since `lastSeen`. */
export type Pass = "tick" | "catchUp";

/** What a step is given: the pass, game time at its end, and `dtMs`. */
export interface StepContext {
  readonly pass: Pass;
  /** Game time the pass ends at. */
  readonly now: number;
  /** The tick's length; in a catch-up, the gap since `lastSeen` (0 when there is none). */
  readonly dtMs: number;
  /**
   * The prestige reset inside this pass's recipe, as `FeatureApi.resetRun`: every feature follows its `reset`
   * rule, at `now` (default: the pass's own). For a step that ends a run (a challenge whose goal is met).
   */
  resetRun(draft: object, ctx?: ResetRunContext): void;
}

/**
 * One step of a pass over the game draft. Returning `"stop"` ends the current phase and skips every later phase
 * before `commit`; `commit` and `after` always run (see `tick.ts`). A step with no return statement is `void`.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: a block-bodied step returns void
export type Step<G extends object = object> = (draft: Draft<G>, ctx: StepContext) => void | "stop";

/** A step limited to one pass: `{ pass: "tick", run }`. Written as a literal, never through a helper (see below). */
export interface StepDef<G extends object = object> {
  readonly run: Step<G>;
  /**
   * The one pass the step runs in. Omitted, and for a step written as a bare function, it runs in both: a catch-up
   * then pays the whole time away at the live rate, with no cap. A step that earns over time usually says
   * `pass: "tick"` and has a `pass: "catchUp"` twin that pays the away rate.
   */
  readonly pass?: Pass;
}

/**
 * A step entry is the function, or `{ pass, run }`. A generic helper such as `onTick(run)` would not do: its
 * own unresolved type parameter becomes a candidate for the feature's `G` and breaks the inference.
 */
export type StepEntry<G extends object = object> = Step<G> | StepDef<G>;

/** The feature's steps: by phase, then by name. The step's id is `<featureKey>.<phase>.<name>`. */
export type FeatureSteps<G extends object = object> = {
  readonly [P in Phase]?: Readonly<Record<string, StepEntry<G>>>;
};

/** A step with its game type erased (it accepts `never`): the store calls it with the game's draft. */
// biome-ignore lint/suspicious/noConfusingVoidType: a block-bodied step returns void
export type AnyStep = (draft: never, ctx: StepContext) => void | "stop";
/** A step as a feature declares it: a function or `{ pass, run }`. */
export type AnyStepEntry = AnyStep | { readonly run: AnyStep; readonly pass?: Pass };
/** A feature's steps by phase, then by name. */
export type AnySteps = { readonly [P in Phase]?: Readonly<Record<string, AnyStepEntry>> };

/**
 * Why a feature's `initial` is being made. `new`: a fresh profile at construction (`now` is the wall, and the
 * clock's `createdAt` stays 0 until the first catch-up). `reset`: the profile reset. `run`: a prestige reset.
 * `import`: an import, whose saved fields then land over the result.
 */
export type InitialReason = "new" | "reset" | "run" | "import";

/** What `initial` is given: now, the profile's rng and why the state is being made. */
export interface InitialContext {
  /**
   * Which clock depends on the reason. `run`: game time. `new` and `reset`: the wall, which is game time too, since
   * a fresh profile's offset is 0. `import`: the wall, and the imported offset lands after, so a time recorded here
   * is off by that offset (a saved field the import carries lands over it; one the save lacks keeps the wall).
   */
  readonly now: number;
  /**
   * The profile's first draws: seeded when the store has a seed, else entropy. A new profile and an import get the
   * same stream (the seed's own), so a slice a save lacks starts the same whether the run was imported or carried on.
   */
  readonly rng: RngState;
  readonly reason: InitialReason;
  /** For a run reset, how deep it reaches (1 for an ordinary one); absent for every other reason. */
  readonly depth?: number;
}

/**
 * What a run reset may be told: the game time it lands on, its rng, and how deep it reaches. `depth` (default 1)
 * is for a game with reset layers stacked on each other: a reset of depth 2 also resets the features an ordinary
 * reset leaves alone until then (`{ depth: 2 }` in their `reset` rule).
 */
export interface ResetRunContext {
  readonly now?: number;
  readonly rng?: RngState;
  readonly depth?: number;
}

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

/**
 * A saved-shape step: the feature's data at the version before its key, to that version (see `migrate`). The data
 * is already parsed, its Decimals revived; read it with `savedRecord` rather than a cast. A feature's step is not
 * called when the save has no slice for that feature (the merge then gives it its defaults).
 */
export type Migration = (saved: unknown) => unknown;

/** What a move spends: an amount of one currency, as the game names it. */
export interface MoveCost {
  readonly currency: string;
  readonly amount: Decimal;
}

/**
 * One thing a player can do now, as the sim's auto-player sees it (`watchpot/sim` › `autoPlayer`): a purchase
 * (with a `cost`) or a claim or an open that costs nothing (no `cost`). `value` is what it is worth, in whatever
 * unit the game picks (at or below 0 the auto-player never takes it); the auto-player buys the best value per share
 * of the currency held. `apply` plays it through the store's own actions and says whether it went through.
 */
export interface Move<G extends object = object> {
  /** Stable for the state it was read from: a refused move is not tried again in the same look. */
  readonly id: string;
  readonly cost?: MoveCost;
  value(state: G): number;
  apply(store: IdleStoreApi<G>): boolean;
}

/** A move with its game type erased, as `FeatureSpec` holds it. */
export interface AnyMove {
  readonly id: string;
  readonly cost?: MoveCost;
  value(state: never): number;
  apply(store: never): boolean;
}

/** The store's middleware stack: persist outside, immer inside. */
export type IdleMutators = [["zustand/persist", PersistedState], ["zustand/immer", never]];

/** The vanilla store over a whole game state (features, the game's actions and the root actions). */
export type IdleStoreApi<G extends object> = Mutate<StoreApi<G>, IdleMutators>;

/** What a feature's `actions` build on: typed over the game state `G` the feature sees. */
export interface FeatureApi<G extends object> {
  /**
   * Mutates the game through an immer draft and returns what the recipe returns (`return api.set((s) => debit(s, …))`).
   * A recipe cannot call an action (one `set` inside another): the outer recipe would land over the inner change, so
   * it throws. Inside a recipe, call the draft helpers instead (`wallet.credit(draft, …)`), or call the action after.
   */
  set<T = void>(recipe: (draft: Draft<G>) => T): T;
  get(): G;
  /** Game time now. */
  now(): number;
  /** A fresh rng: derived from the store's seed and `label` when seeded, else entropy. */
  rng(label: string): RngState;
  /**
   * Draft helper: the prestige reset inside a recipe. Every feature follows its `reset` rule, then the clock's
   * `createdAt` and `lastSeen` land on `now` (default: game time) with its offset kept. `rng` defaults to
   * `api.rng("run:<createdAt>")`, labelled by the saved start of the run that ends.
   */
  resetRun(draft: Draft<G>, ctx?: ResetRunContext): void;
  readonly store: IdleStoreApi<G>;
}

/** The definition `feature` takes: key, initial state, actions, steps, reset rule, transient keys, migrations and merge. */
export interface FeatureDef<
  K extends string,
  S extends object,
  A extends object,
  R extends readonly FeatureSpec[],
  G extends object,
> {
  /** The saved key: explicit and stable, never a position. */
  readonly key: K;
  /** The other features this one reads or writes; their state joins the draft the callbacks see. */
  readonly reach?: R;
  /**
   * The state a new profile, a reset or an import starts from. Keep it pure and cheap: `defineGame` calls it once at
   * import to check the declaration, and the store on every reset.
   */
  readonly initial: (ctx: InitialContext) => S;
  /** Keys of `S` that never save (a sheet that is open, a pointer). */
  readonly transient?: readonly (keyof S & string)[];
  readonly actions?: (api: FeatureApi<G>) => A;
  readonly steps?: FeatureSteps<G>;
  readonly reset?: ResetRule<S>;
  readonly migrations?: Readonly<Record<number, Migration>>;
  /** Runs over the default merge's result on load and import: drop or rename what this build does not know. */
  readonly merge?: (merged: S, fresh: S) => S;
  /**
   * Works out this feature's derived transient state (stats folded from the rest, a rate) from the state as it
   * stands. The store runs it, in feature order, wherever the transient state is made fresh (a new store, a load,
   * an import, a profile reset and a run reset), so the next pass's first steps never read an empty value. It must
   * be pure: no rng, no time passing, nothing saved changed. A feature that also refreshes it each pass lists the same
   * function as a step (`rates`). See `docs/stat-graph.md` › The first pass after a load.
   */
  readonly derive?: (draft: Draft<G>, ctx: DeriveContext) => void;
  /**
   * The vocabulary this feature speaks, when it is built over one (a primitive made with `currencies({ vocab })`):
   * `defineGame` refuses it unless the game declares the same vocabulary. Its words type the feature through the
   * factory that made it; `feature()` itself takes no vocabulary type parameter.
   */
  readonly vocab?: AnyVocab;
  /**
   * What a player can do with this feature now, read off the game state (with this feature's own actions, which a
   * move's `apply` calls): the auto-player's menu. Optional; the store never calls it.
   */
  readonly moves?: (state: NoInfer<G & Record<K, A>>) => readonly Move<NoInfer<G & Record<K, A>>>[];
}

/**
 * A feature as the store sees it: every callback's game type erased (a callback over `G` accepts `never`), so a
 * tuple of features has one type and a game's state type may be derived from it. `feature()` is the only maker.
 */
export interface FeatureSpec {
  readonly key: string;
  readonly reach: readonly FeatureSpec[];
  readonly initial: (ctx: InitialContext) => object;
  readonly transient: readonly string[];
  readonly actions: (api: never) => object;
  readonly steps: AnySteps;
  readonly reset: AnyReachedRule | "never" | { readonly depth: number; readonly rule?: AnyReachedRule };
  readonly migrations: Readonly<Record<number, Migration>>;
  readonly merge?: (merged: never, fresh: never) => object;
  readonly derive?: (draft: never, ctx: DeriveContext) => void;
  readonly vocab?: AnyVocab;
  readonly moves?: (state: never) => readonly AnyMove[];
}

/** Why a feature's `derive` runs: the store was built, loaded, imported, reset, or a run reset landed. */
export type DeriveReason = "new" | "load" | "import" | "reset" | "run";

/** What `derive` is given: game time, and why the transient state is fresh. */
export interface DeriveContext {
  readonly now: number;
  readonly reason: DeriveReason;
}

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

/** A declared feature: its key, its state and actions types, and the spec the game reads. */
export interface Feature<K extends string, S extends object, A extends object> extends FeatureSpec {
  readonly key: K;
  readonly initial: (ctx: InitialContext) => S;
  readonly transient: readonly (keyof S & string)[];
  readonly actions: (api: never) => A;
  readonly reset: ResetRule<S>;
  readonly merge?: (merged: S, fresh: S) => S;
}

const noActions = <A extends object>(): A => ({}) as A;

/**
 * Declares a feature. `K`, `S`, `A` and the reach `R` are read off the definition; `G`, the game the callbacks
 * see, is the feature's own slice plus its reach, or whatever one annotated draft or api parameter says.
 */
export function feature<
  const K extends string,
  S extends object,
  A extends object = Record<never, never>,
  const R extends readonly FeatureSpec[] = readonly [],
  G extends object = Record<K, S> & StateOf<R>,
>(def: FeatureDef<K, S, A, R, G>): Feature<K, S, A> {
  if (def.key.includes(".")) throw new Error(`feature "${def.key}": a key cannot contain "."`);
  return {
    key: def.key,
    reach: def.reach ?? [],
    initial: def.initial,
    transient: def.transient ?? [],
    actions: def.actions ?? noActions<A>,
    steps: def.steps ?? {},
    reset: def.reset ?? "run",
    migrations: def.migrations ?? {},
    merge: def.merge,
    derive: def.derive,
    vocab: def.vocab,
    moves: def.moves,
  };
}

/**
 * The same feature with its auto-player moves: for a feature a factory made (`currencies`, `prestige`, `gacha`),
 * whose definition the game does not write itself. Keeps everything else the factory put on it.
 */
export function withMoves<F extends FeatureSpec, G extends object>(
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

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void
  ? I
  : never;
type Flat<T> = { [K in keyof T]: T[K] };

type SliceOf<F> = F extends Feature<infer K, infer S, infer A extends object> ? { [P in K]: S & A } : never;
type SavedSliceOf<F> = F extends Feature<infer K, infer S, infer _A extends object> ? { [P in K]: S } : never;
type ActionsSliceOf<F> =
  F extends Feature<infer K, infer _S, infer A extends object> ? { [P in K]: A } : never;

/** The store's state from a feature tuple: every feature's state and actions under its key. */
export type StateOf<F extends readonly FeatureSpec[]> = Flat<UnionToIntersection<SliceOf<F[number]>>>;
/** The saved shape: every feature's state under its key, no actions. */
export type SavedOf<F extends readonly FeatureSpec[]> = Flat<UnionToIntersection<SavedSliceOf<F[number]>>>;
/** Every feature's actions under its key. */
export type ActionsOf<F extends readonly FeatureSpec[]> = Flat<
  UnionToIntersection<ActionsSliceOf<F[number]>>
>;
/** The feature keys of a tuple. */
export type KeyOf<F extends readonly FeatureSpec[]> = F[number]["key"];
/** The draft a step or recipe over these features sees. */
export type DraftOf<F extends readonly FeatureSpec[]> = Draft<StateOf<F>>;
