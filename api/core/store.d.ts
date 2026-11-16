import { type FeatureSpec, type IdleStoreApi, type ResetRunContext, type StateOf } from "./feature";
import type { Game } from "./game";
import { type GameStorage, type PersistedState } from "./storage";
/**
 * The store over a game: every feature's state and actions under its key, the game's own actions, and the root
 * actions below, persisted to the storage with the saved shape the features declare. One wall read, the `now`
 * option, which the caller supplies (the engine never reads the wall itself); `gameNow()` adds the clock's offset.
 */
export interface RootActions {
    /** The game clock: the wall plus the clock's offset. The one clock the game reads. */
    gameNow(): number;
    /** One live tick of `dtMs` ending at `now` (game time). */
    tick(dtMs: number, now?: number): void;
    /** The catch-up pass over the gap since `lastSeen`, ending at `now` (game time). Called on load and on return. */
    catchUp(now?: number): void;
    /** Back to a fresh profile, offset zero, at wall time `now`. */
    resetProfile(now?: number): void;
    /**
     * The prestige reset: every feature follows its `reset` rule; the clock's anchors land on `now` (game time).
     * `rng` defaults to `rng("run:<createdAt>")`, the label read off the save (the start of the run that ends), so a
     * seeded profile draws the same whether or not it was reloaded since its last reset. `depth` (default 1) is how
     * deep the reset reaches: a feature whose rule says `{ depth: 2 }` is untouched by anything shallower.
     */
    resetRun(ctx?: ResetRunContext): void;
    /** The profile as a tagged-JSON string. */
    exportProfile(now?: number): string;
    /**
     * Replaces the profile from an export at wall time `now`; `lastSeen` lands at `now` plus the imported offset,
     * so the next catch-up credits no offset. Throws `SaveError` on a bad file.
     */
    importProfile(json: string, now?: number): void;
}
/**
 * The store `createIdleStore` returns: the game's state plus the root actions, under persist and immer, and
 * `hydrated`, which settles once the save is loaded, whatever the load found. On a `StorageBackend` it already has
 * when `createIdleStore` returns; on an async one, play waits for it: until then the store holds a new profile and
 * writes nothing.
 */
export type IdleStore<S extends object> = IdleStoreApi<S & RootActions> & {
    readonly hydrated: Promise<void>;
    /**
     * How many times the profile has been replaced under this store: an import or a profile reset. It moves before
     * the change is published, so a subscriber that compares it with the count it last saw knows the change in front
     * of it is not play (`watchChanges` does).
     */
    profileSwaps(): number;
};
/** Options for `createIdleStore`: the storage, the save key, the required `now`, the seed and entropy. */
export interface IdleStoreOptions {
    /** The persist storage; defaults to localStorage, or memory (not durable) where there is none. */
    storage?: GameStorage;
    /** The save key; defaults to the game's `save.key`. */
    name?: string;
    /** The wall clock, the store's one wall read. Required: the engine never reads the wall itself. */
    now: () => number;
    /**
     * Seeds a new profile's draws, and each run reset's from this seed and a label; without it they draw from
     * entropy. A profile reset or an import always draws fresh entropy; a hydrated save keeps its own state.
     */
    seed?: string | number;
    /** The entropy behind unseeded draws. Default `Math.random`. */
    entropy?: () => number;
}
/** The saved fields of every feature. The data objects are frozen and shared: read them, never write them. */
export declare function partializeState(features: readonly FeatureSpec[], state: object): PersistedState;
/**
 * Saved fields over a feature's current data, keeping the actions. A saved `undefined` is a missing field (the
 * default stays). Under a Decimal default a saved Decimal, number or string is read as one, and anything else, or
 * what reads as NaN, leaves the default; a plain-object default under a plain-object save is filled one level down,
 * so a key added since the save loads as its default. The feature's `merge` then runs over the result.
 */
export declare function mergeFeature<T extends object>(f: FeatureSpec, fresh: T, saved: unknown): T;
/**
 * Builds the zustand store a game runs from its definition: every feature's state and actions, the tick and the save.
 * Where there is a page it flushes the save itself when the page hides, clock or no clock (`registerStore`).
 */
export declare function createIdleStore<F extends readonly FeatureSpec[], R extends object>(game: Game<F, R>, options: IdleStoreOptions): IdleStore<StateOf<F> & R>;
