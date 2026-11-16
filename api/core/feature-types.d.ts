import type { Draft } from "immer";
import type { Mutate, StoreApi } from "zustand/vanilla";
import type { Decimal } from "./decimal";
import type { DerivedDef } from "./derived";
import type { ReachShape, ReachType } from "./feature";
import type { AnyReachedRule, ResetRule } from "./reset-rule";
import type { RngState } from "./rng";
import type { AnySteps, FeatureSteps } from "./steps";
import type { PersistedState } from "./storage";
import type { AnyVocab } from "./vocab";
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
 * (with a `cost`) or a claim or an open that costs nothing (no `cost`). `apply` plays it through the store's own
 * actions and says whether it went through.
 *
 * `worth` is what it is worth, in the unit of the auto-player's objective (at or below 0 the auto-player never
 * takes it). Leave it out and the auto-player works it out: the objective after the move less the objective
 * before. State it for a move that does not move the objective at once (an unlock, an offline cap, a reset),
 * which would otherwise come to nothing and never be taken. Nothing asks for it outside the sim.
 */
export interface Move<G extends object = object> {
    /** Stable for the state it was read from: a refused move is not tried again in the same look. */
    readonly id: string;
    readonly cost?: MoveCost;
    worth?(state: G): number;
    /** A free move is taken once a look; `repeat` lets it be taken again while it keeps going through. */
    readonly repeat?: boolean;
    apply(store: IdleStoreApi<G>): boolean;
}
/** A move with its game type erased, as `FeatureSpec` holds it. */
export interface AnyMove {
    readonly id: string;
    readonly cost?: MoveCost;
    worth?(state: never): number;
    readonly repeat?: boolean;
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
export interface FeatureDef<K extends string, S extends object, A extends object, R extends ReachShape, G extends object, Dv = Record<never, never>, Dd = DerivedDef<Record<K, S> & ReachOf<R>, Dv>> {
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
     *
     * A value that reads another of this same feature goes in a later layer: `derived: [{ price: … }, { canBuy: (s)
     * => s.pot.bubbles.gte(s.stove.price) }]`. Each layer sees the ones before it (up to four). The layers are only
     * how the types are read; the engine still orders every value by what it reads.
     */
    readonly derived?: Dd;
    readonly actions?: (api: FeatureApi<G>) => A;
    readonly steps?: FeatureSteps<G>;
    readonly reset?: ResetRule<S>;
    readonly migrations?: Readonly<Record<number, Migration>>;
    /** Runs over the default merge's result on load and import: drop or rename what this build does not know. */
    readonly merge?: (merged: S, fresh: S) => S;
    /**
     * The vocabulary this feature speaks, when it is built over one (a primitive made with `defineCurrencies({ vocab })`):
     * `defineGame` refuses it unless the game declares the same vocabulary. Its words type the feature through the
     * factory that made it; `defineFeature()` itself takes no vocabulary type parameter.
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
 * tuple of features has one type and a game's state type may be derived from it. `defineFeature()` is the only maker.
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
export {};
