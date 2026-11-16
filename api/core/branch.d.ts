import type { FeatureSpec, StateOf } from "./feature";
import type { Game } from "./game";
import { type PlainStore, type PlainStoreOptions } from "./plain";
import { type RootActions } from "./store";
/**
 * Cuts a branch: a plain store over `game` holding a copy of `from`'s state as it stands. `options` are the plain
 * store's: `now` is the wall it reads (hand it the same clock as the original, or a fixed moment), and `seed` seeds
 * the branch's own draws (`api.rng`, a run reset's). A draw a feature makes from an rng position kept in its slice
 * is the same on every branch until something moves that position, so a game that wants its branches to part
 * reseeds that field on each (`branch.setState`) before it plays them.
 */
export declare function branchStore<F extends readonly FeatureSpec[], R extends object>(game: Game<F, R>, from: {
    getState(): object;
}, options: PlainStoreOptions): PlainStore<StateOf<F> & R>;
/**
 * Replaces `store`'s profile with a branch's state, as an import of that branch's save would: every saved field of
 * every feature, the transient ones back at their `initial`, and the clock's `lastSeen` on the wall time `at`
 * (default: the store's own wall), so the catch-up that follows credits nothing twice. It counts as a profile swap
 * (`profileSwaps`), not as play. The store must be one `createIdleStore` made, over the game the branch was cut on.
 */
export declare function adoptBranch(store: {
    getState(): RootActions;
}, branch: {
    getState(): object;
}, at?: number): void;
