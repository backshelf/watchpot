import type { FeatureSpec, StateOf } from "./feature";
import type { AnyGame, Game } from "./game";
import { storeMeta } from "./persist";
import { createPlainStore, type PlainData, type PlainStore, type PlainStoreOptions } from "./plain";
import { encodeProfile } from "./save";
import { partializeState, type RootActions } from "./store";

/**
 * Branches: a store's state copied into plain stores that are played on by themselves, and one of them taken back.
 *
 * A branch is a `PlainStore` over the same game, holding what the original held at the moment it was cut: every
 * feature's slice (the clock's `lastSeen` and each feature's rng position with them), on data of its own. Nothing a
 * branch does reaches the store it was cut from, so a game can cut several, give each a different future (a
 * `catchUp` over the same absence on a different seed, a purchase tried each way, an hour of an auto-player) and
 * read what each came to. `adoptBranch` then replaces the original's profile with the one the game, or the player,
 * picks.
 */

/** The data of a state, by feature: its saved and transient fields, with no actions and no derived values. */
function dataOf(game: AnyGame, state: object): PlainData {
  const out: PlainData = {};
  for (const f of game.features) {
    const slice: Record<string, unknown> = {};
    for (const [k, v] of Object.entries((state as PlainData)[f.key] ?? {}))
      if (typeof v !== "function" && !(k in f.derived)) slice[k] = v;
    out[f.key] = slice;
  }
  return out;
}

/**
 * Cuts a branch: a plain store over `game` holding a copy of `from`'s state as it stands. `options` are the plain
 * store's: `now` is the wall it reads (hand it the same clock as the original, or a fixed moment), and `seed` seeds
 * the branch's own draws (`api.rng`, a run reset's). A draw a feature makes from an rng position kept in its slice
 * is the same on every branch until something moves that position, so a game that wants its branches to part
 * reseeds that field on each (`branch.setState`) before it plays them.
 */
export function branchStore<F extends readonly FeatureSpec[], R extends object>(
  game: Game<F, R>,
  from: { getState(): object },
  options: PlainStoreOptions,
): PlainStore<StateOf<F> & R> {
  const branch = createPlainStore(game, options);
  branch.restore(dataOf(game, from.getState()));
  return branch;
}

/**
 * Replaces `store`'s profile with a branch's state, as an import of that branch's save would: every saved field of
 * every feature, the transient ones back at their `initial`, and the clock's `lastSeen` on the wall time `at`
 * (default: the store's own wall), so the catch-up that follows credits nothing twice. It counts as a profile swap
 * (`profileSwaps`), not as play. The store must be one `createIdleStore` made, over the game the branch was cut on.
 */
export function adoptBranch(
  store: { getState(): RootActions },
  branch: { getState(): object },
  at?: number,
): void {
  const meta = storeMeta(store);
  if (!meta) throw new Error("adoptBranch: the store was not made by createIdleStore");
  const state = store.getState();
  const saved = partializeState(meta.game.features, branch.getState());
  state.importProfile(encodeProfile(saved, state.gameNow(), meta.game.save.version), at);
}
