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
 * features it names in `reach`, so a feature that credits a wallet writes `reach: () => [wallet]` and
 * `s.wallet.gold` is typed, with no annotation anywhere. `reach` is lazy, so it may name a feature declared further
 * down. Two features that reach each other name one side by value and the other by its state type
 * (`reach: reach<{ lid: LidState }>()`), which `defineGame` checks against the feature really listed under that
 * key. A value reach brings the feature's state and actions; a type reach brings what the type says. `Feature`
 * itself erases `G`, so a game's state type may be derived from the tuple of its features without a cycle.
 */
/** The tick phases, in the order they run. */
export declare const PHASES: readonly ["guard", "sync", "rates", "produce", "automate", "settle", "commit", "after"];
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
export type Step<G extends object = object> = (draft: Draft<G>, ctx: StepContext) => void | "stop";
/** When a step runs: in a live tick, in a catch-up, or in both. */
export type PassChoice = Pass | "both";
/** Steps a step runs after or before: step ids (`<featureKey>.<phase>.<name>`) or feature keys, in the same phase. */
export type StepRefs = string | readonly string[];
/** A step with its options: `{ pass: "tick", run }`. Written as a literal, never through a helper (see below). */
export interface StepDef<G extends object = object> {
    readonly run: Step<G>;
    /**
     * The passes the step runs in. Omitted, it runs in both, which suits a step that tidies or checks. A step in an
     * earning phase (`EARNING_PHASES`) has no default and must say: one that pays the live rate in a catch-up pays
     * the whole time away with no cap, so that is written out (`"both"`) or split into a `"tick"` step and a
     * `"catchUp"` twin that pays the away rate.
     */
    readonly pass?: PassChoice;
    /**
     * Runs after the named steps of the same phase: a step id, or a feature's key for all of its steps there. Only
     * for a step that acts; a derived value needs no order (see `FeatureDef.derived`).
     */
    readonly after?: StepRefs;
    /** Runs before the named steps of the same phase. */
    readonly before?: StepRefs;
}
/** A step in an earning phase: it must name its pass. */
export interface EarningStepDef<G extends object = object> extends StepDef<G> {
    readonly pass: PassChoice;
}
/** The phases whose steps pay the player over time, and so must each name the pass they run in. */
export declare const EARNING_PHASES: readonly ["produce"];
/** A phase whose steps must name their pass. */
export type EarningPhase = (typeof EARNING_PHASES)[number];
/**
 * A step entry is the function, or `{ run, pass, after, before }`. A generic helper such as `onTick(run)` would
 * not do: its own unresolved type parameter becomes a candidate for the feature's `G` and breaks the inference.
 */
export type StepEntry<G extends object = object> = Step<G> | StepDef<G>;
/**
 * The feature's steps: by phase, then by name. The step's id is `<featureKey>.<phase>.<name>`. In an earning
 * phase a step is always `{ pass, run }`.
 */
export type FeatureSteps<G extends object = object> = {
    readonly [P in Phase]?: Readonly<Record<string, P extends EarningPhase ? EarningStepDef<G> : StepEntry<G>>>;
};
/** A step with its game type erased (it accepts `never`): the store calls it with the game's draft. */
export type AnyStep = (draft: never, ctx: StepContext) => void | "stop";
/** A step as a feature declares it: a function or `{ pass, run }`. */
export type AnyStepEntry = AnyStep | {
    readonly run: AnyStep;
    readonly pass?: PassChoice;
    readonly after?: StepRefs;
    readonly before?: StepRefs;
};
/** A feature's steps by phase, then by name. */
export type AnySteps = {
    readonly [P in Phase]?: Readonly<Record<string, AnyStepEntry>>;
};
/**
 * Why a feature's `initial` is being made. `new`: a fresh profile at construction (the clock's `createdAt` stays
 * 0 until the first catch-up). `reset`: the profile reset. `run`: a prestige reset. `import`: an import, whose
 * saved fields then land over the result.
 */
export type InitialReason = "new" | "reset" | "run" | "import";
/** What `initial` is given: now, the profile's rng and why the state is being made. */
export interface InitialContext {
    /** Game time, whatever the reason: the clock every step and action reads. A run start recorded here is right. */
    readonly now: number;
    /** The wall at the same moment: game time less the clock's offset. For the rare feature that keeps a real date. */
    readonly wallNow: number;
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
export type ReachedRule<S extends object> = "run" | {
    readonly keep: readonly (keyof S & string)[];
} | ((before: S, fresh: S, ctx: InitialContext) => S);
/**
 * What a prestige reset (`resetRun`) does to the feature: a `ReachedRule` (`"run"` is the default), untouched
 * (`"never"`), or `{ depth, rule }`: untouched by a reset shallower than `depth`, and following `rule` (default
 * `"run"`) from that depth on. A second reset layer resets at depth 2, so what the first layer keeps for good but
 * the second wipes says `{ depth: 2 }`.
 */
export type ResetRule<S extends object> = ReachedRule<S> | "never" | {
    readonly depth: number;
    readonly rule?: ReachedRule<S>;
};
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
     * it throws. Inside a recipe, call the draft helpers instead (`wallet.draft.credit(draft, …)`), or call the action after.
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
export interface FeatureDef<K extends string, S extends object, A extends object, R extends ReachShape, G extends object, Dv = Record<never, never>> {
    /** The saved key: explicit and stable, never a position. */
    readonly key: K;
    /**
     * The other features this one reads or writes; their state joins the draft the callbacks see. A list, a function
     * returning one (so a feature declared further down may be named), or `reach<{ key: State }>()` for a feature
     * reached by its state type (the other side of a cycle); the two mix inside a list.
     */
    readonly reach?: R | (() => R);
    /**
     * The state a new profile, a reset or an import starts from. Keep it pure and cheap: `defineGame` calls it once at
     * import to check the declaration, and the store on every reset.
     */
    readonly initial: (ctx: InitialContext) => S;
    /** Keys of `S` that never save (a sheet that is open, a pointer). */
    readonly transient?: readonly (keyof S & string)[];
    /**
     * Values worked out from the state: `derived: { perSecond: (s) => … }`. Each joins the feature's slice under its
     * name, typed by what the function returns, and is read like any field (`s.stove.perSecond`). It is never saved
     * and never written: the engine works it out on load, on reset, and again whenever a slice it read may have
     * changed, so what a step, an action or the page reads is current as of the start of that step or action. One
     * derived value may read another, of this feature or one it reaches; the engine orders them by who reads whom
     * and throws, naming the loop, when they go round. The function sees the feature's saved state and its reach; it
     * must be pure (no rng, no clock, nothing written). Write it after `initial` and `reach` and before `actions`
     * and `steps`, which is the order the types are read in.
     */
    readonly derived?: DerivedDef<Record<K, S> & ReachOf<R>, Dv>;
    readonly actions?: (api: FeatureApi<G>) => A;
    readonly steps?: FeatureSteps<G>;
    readonly reset?: ResetRule<S>;
    readonly migrations?: Readonly<Record<number, Migration>>;
    /** Runs over the default merge's result on load and import: drop or rename what this build does not know. */
    readonly merge?: (merged: S, fresh: S) => S;
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
    readonly reach: () => readonly FeatureSpec[];
    readonly initial: (ctx: InitialContext) => object;
    readonly transient: readonly string[];
    readonly actions: (api: never) => object;
    readonly steps: AnySteps;
    readonly reset: AnyReachedRule | "never" | {
        readonly depth: number;
        readonly rule?: AnyReachedRule;
    };
    readonly migrations: Readonly<Record<number, Migration>>;
    readonly merge?: (merged: never, fresh: never) => object;
    readonly derived: Readonly<Record<string, (state: never) => unknown>>;
    readonly vocab?: AnyVocab;
    readonly moves?: (state: never) => readonly AnyMove[];
}
/** A `ReachedRule` with its state type erased, as `FeatureSpec` holds it. */
export type AnyReachedRule = "run" | {
    readonly keep: readonly string[];
} | ((before: never, fresh: never, ctx: InitialContext) => object);
/** A feature's reset rule split in two: the shallowest reset that touches it (`Infinity` for `"never"`), and what that reset does. */
export declare function resetRuleOf(reset: FeatureSpec["reset"]): {
    depth: number;
    rule: AnyReachedRule;
};
/**
 * What a `ReachedRule` makes of a state once a reset reaches it: `fresh` for `"run"`, `fresh` with the kept keys
 * from `before`, or the function's result. For a factory that wraps the game's rule in its own.
 */
export declare function applyReachedRule<S extends object>(rule: ReachedRule<S>, before: S, fresh: S, ctx: InitialContext): S;
/** A declared feature: its key, its state and actions types, and the spec the game reads. */
export interface Feature<K extends string, S extends object, A extends object, N = unknown, Dv = unknown> extends FeatureSpec {
    /** Type only: the feature's derived values, by name. */
    readonly cells?: Dv;
    /** Type only: the state this feature reaches by type, which `defineGame` checks the game has. */
    readonly needs?: N;
    readonly key: K;
    readonly initial: (ctx: InitialContext) => S;
    readonly transient: readonly (keyof S & string)[];
    readonly actions: (api: never) => A;
    readonly reset: ResetRule<S>;
    readonly merge?: (merged: S, fresh: S) => S;
}
/** A feature reached by its state type instead of by value: `reach<{ lid: LidState }>()`. */
export interface ReachType<T extends object> {
    readonly reachType: true;
    /** Type only. */
    readonly state?: T;
}
/**
 * Reaches features by their state types: the whole `reach`, or one entry of its list. For the far side of a cycle,
 * where naming the feature itself would make each one's type depend on the other's. `defineGame` refuses a game
 * that lacks a key named here, or whose feature under that key has another state.
 */
export declare function reach<T extends object>(): ReachType<T>;
/** What `reach` may hold: a list of features and type reaches, or one type reach. */
export type ReachShape = readonly (FeatureSpec | ReachType<object>)[] | ReachType<object>;
/** A feature's `derived` block: each value as a function of the state `In` (its saved slice and its reach). */
export type DerivedDef<In, Dv> = {
    readonly [P in keyof Dv]: (state: In) => Dv[P];
};
/**
 * Declares a feature. `K`, `S`, `A`, the reach `R` and the derived values are read off the definition; `G`, the
 * game the callbacks see, is the feature's own slice (derived values included) plus its reach.
 */
export declare function feature<const K extends string, S extends object, A extends object = Record<never, never>, const R extends ReachShape = readonly [], Dv = Record<never, never>, G extends object = Record<K, S & Dv> & ReachOf<R>>(def: FeatureDef<K, S, A, R, G, Dv>): Feature<K, S, A, NeedsOf<R>, Dv>;
/**
 * The same feature with its auto-player moves: for a feature a factory made (`currencies`, `prestige`, `gacha`),
 * whose definition the game does not write itself. Keeps everything else the factory put on it.
 */
export declare function withMoves<F extends FeatureSpec, G extends object>(f: F, moves: (state: G) => readonly Move<G>[]): F;
/**
 * The same feature with save migrations: for a feature a factory made (`generators`, `dimensions`, `layers`),
 * whose definition the game does not write itself. `migrations[n]` takes the feature's slice saved before version
 * `n` to its shape at `n`. Keeps everything else the factory put on it; steps the feature already had are kept
 * unless the same version is given again.
 */
export declare function withMigrations<F extends FeatureSpec>(f: F, migrations: Readonly<Record<number, Migration>>): F;
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
type Flat<T> = {
    [K in keyof T]: T[K];
};
type SliceOf<F> = F extends Feature<infer K, infer S, infer A extends object, infer _N, infer Dv> ? {
    [P in K]: S & Dv & A;
} : never;
type DataSliceOf<F> = F extends Feature<infer K, infer S, infer _A extends object, infer _N, infer Dv> ? {
    [P in K]: S & Dv;
} : never;
type SavedSliceOf<F> = F extends Feature<infer K, infer S, infer _A extends object> ? {
    [P in K]: S;
} : never;
type ActionsSliceOf<F> = F extends Feature<infer K, infer _S, infer A extends object> ? {
    [P in K]: A;
} : never;
type ReachedSlice<X> = X extends ReachType<infer T> ? T : SliceOf<X>;
type TypeReached<X> = X extends ReachType<infer T> ? T : never;
/** The state a `reach` adds to the draft: every reached feature's slice, and every type reached. */
export type ReachOf<R> = R extends ReachType<infer T> ? T : R extends readonly unknown[] ? Flat<UnionToIntersection<ReachedSlice<R[number]>>> : unknown;
/** The part of a `reach` given by type, which only the finished game can check. */
export type NeedsOf<R> = R extends ReachType<infer T> ? T : R extends readonly unknown[] ? UnionToIntersection<TypeReached<R[number]>> : unknown;
/** Every type-reached state the features of a tuple ask for. */
export type NeedsOfAll<F extends readonly FeatureSpec[]> = UnionToIntersection<NeedOf<F[number]>>;
type NeedOf<X> = X extends {
    readonly needs?: infer N;
} ? (unknown extends N ? never : N) : never;
/** The store's state from a feature tuple: every feature's state and actions under its key. */
export type StateOf<F extends readonly FeatureSpec[]> = Flat<UnionToIntersection<SliceOf<F[number]>>>;
/** Every feature's data under its key: its saved state and its derived values, no actions. */
export type DataOf<F extends readonly FeatureSpec[]> = Flat<UnionToIntersection<DataSliceOf<F[number]>>>;
/** The saved shape: every feature's state under its key, no actions. */
export type SavedOf<F extends readonly FeatureSpec[]> = Flat<UnionToIntersection<SavedSliceOf<F[number]>>>;
/** Every feature's actions under its key. */
export type ActionsOf<F extends readonly FeatureSpec[]> = Flat<UnionToIntersection<ActionsSliceOf<F[number]>>>;
/** The feature keys of a tuple. */
export type KeyOf<F extends readonly FeatureSpec[]> = F[number]["key"];
/** The draft a step or recipe over these features sees. */
export type DraftOf<F extends readonly FeatureSpec[]> = Draft<StateOf<F>>;
