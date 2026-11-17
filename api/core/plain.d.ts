import type { FeatureSpec, StateOf } from "./feature";
import type { Game } from "./game";
import { type RootActions } from "./store";
/**
 * The plain store: a game run on plain data. The same features, steps, actions and derived values as
 * `createIdleStore`, over one mutable state object, with no immer, no zustand and no save. It is for running a
 * game fast and headless (the sim, a fit): a pass costs what the game's own code costs and little else.
 *
 * What differs from the real store, and nothing else does:
 * - The state is changed in place. `getState()` hands back the same object every time, so a value read from it is
 *   live, not a snapshot: copy what must be kept (a Decimal is safe to keep; it is never changed in place).
 * - A recipe that throws leaves what it had already written (the real store drops the whole recipe).
 * - Nothing is saved or loaded, and `subscribe` never calls back.
 * - A profile cannot be exported or imported.
 *
 * `plainParity` (`watchpot/test`) plays one seed through both stores and compares them; a game runs it once in its
 * tests to know its sim is the game.
 */
export interface PlainStore<S extends object> {
    /** The game's state and actions: one object, changed in place. Derived values read through it are current. */
    getState(): S & RootActions;
    /** Runs a recipe over the state, as an action's `api.set` does. */
    setState(recipe: (state: S) => void): void;
    /** Runs something and puts the state back as it was: how the auto-player tries a purchase to see what it is worth. */
    trial<T>(run: () => T): T;
    /**
     * The state's data as it stands, every feature's slice copied (its own objects, the same Decimals), with no
     * actions and no derived values: with `restore`, how a sim snapshot carries a run.
     */
    snapshot(): PlainData;
    /** Puts the state to what `snapshot` gave (this store's or another's over the same game); derived values follow. */
    restore(data: PlainData): void;
    /**
     * A value worked out from the state and kept: `fn` is read through the same tracking a derived value gets, and the
     * reader returns the kept value until a field or cell it read may have changed (a write, a `trial`, a reset, a
     * restore). `fn` must be a pure read of the state; what it returns is shared between reads, so do not change it.
     */
    memo<T>(fn: (state: S) => T): () => T;
    /** Present so the plain store stands in where a store is expected; it never calls back. */
    subscribe(listener: () => void): () => void;
    /** Settled already: there is no save to load. */
    readonly hydrated: Promise<void>;
    /** Profile resets so far. */
    profileSwaps(): number;
}
/** Options for `createPlainStore`: the required `now`, the seed and entropy, as `createIdleStore` takes them. */
export interface PlainStoreOptions {
    /** The wall clock, the store's one wall read. */
    now: () => number;
    /** Seeds a new profile's draws, and each run reset's; without it they draw from entropy. */
    seed?: string | number;
    /** The entropy behind unseeded draws. Default `Math.random`. */
    entropy?: () => number;
}
/** A plain store's data: each feature's slice by key, actions and derived values left out. */
export type PlainData = Record<string, Record<string, unknown>>;
/** Builds a plain store over a game: its features' state, actions, passes and derived values, on plain data. */
export declare function createPlainStore<F extends readonly FeatureSpec[], R extends object>(game: Game<F, R>, options: PlainStoreOptions): PlainStore<StateOf<F> & R>;
