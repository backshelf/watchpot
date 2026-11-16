import { describe, expect, test } from "bun:test";
import type { Draft } from "immer";
import { createMemoryBackend, type DeriveReason, defineGame, feature } from "watchpot/core";
import { freshStore, T0 } from "watchpot/test";

/**
 * A pool whose size is saved, a cap derived from it and never saved, and a guard that trims what is held to the cap
 * in `sync`, before `rates` refolds the cap: the bug class of reading derived state on the first pass after a load.
 */
type State = { pool: { size: number; held: number }; caps: { cap: number; seen: DeriveReason | null } };
const pool = feature({
  key: "pool",
  initial: () => ({ size: 5, held: 0 }),
  steps: {
    sync: {
      trim: (d: Draft<State>) => {
        d.pool.held = Math.min(d.pool.held, d.caps.cap);
      },
    },
  },
});
const fold = (d: Draft<State>, reason: DeriveReason | null) => {
  d.caps.cap = d.pool.size * 2;
  d.caps.seen = reason;
};
const caps = feature({
  key: "caps",
  initial: () => ({ cap: 0, seen: null as DeriveReason | null }),
  transient: ["cap", "seen"],
  reset: "never",
  derive: (d: Draft<State>, ctx) => fold(d, ctx.reason),
  steps: { rates: { fold: (d: Draft<State>) => fold(d, null) } },
});
const game = defineGame({ id: "pool", save: { key: "pool.save", version: 1 }, features: [pool, caps] });

/** A bigger pool, folded by a pass, then filled past the old cap. */
const grow = (store: ReturnType<typeof freshStore<typeof game.features, object>>["store"]) => {
  store.setState((d) => {
    d.pool.size = 50;
  });
  store.getState().tick(1000, T0 + 1000);
  store.setState((d) => {
    d.pool.held = 80;
  });
};

describe("derive", () => {
  test("a new store holds its derived state before any pass", () => {
    const { store } = freshStore(game, { catchUp: false });
    expect(store.getState().caps).toEqual({ cap: 10, seen: "new" });
  });

  test("the first pass after a load, an import or a reset reads derived state, never an empty one", () => {
    const backend = createMemoryBackend();
    const { store } = freshStore(game, { backend });
    grow(store);
    store.getState().tick(1000, T0 + 2000);
    expect(store.getState().pool.held).toBe(80);

    const loaded = freshStore(game, { backend, catchUp: false }).store;
    expect(loaded.getState().caps).toEqual({ cap: 100, seen: "load" });
    loaded.getState().tick(1000, T0 + 2000);
    expect(loaded.getState().pool.held).toBe(80);

    const imported = freshStore(game).store;
    imported.getState().importProfile(store.getState().exportProfile());
    expect(imported.getState().caps.seen).toBe("import");
    imported.getState().tick(1000, T0 + 2000);
    expect(imported.getState().pool.held).toBe(80);

    store.getState().resetRun();
    expect(store.getState().caps).toEqual({ cap: 10, seen: "run" });
    grow(store);
    store.getState().resetProfile(T0);
    expect(store.getState().caps).toEqual({ cap: 10, seen: "reset" });
  });
});
