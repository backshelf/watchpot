import { describe, expect, test } from "bun:test";
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineGame,
  defineSeenOnce,
  feature,
} from "watchpot/core";

const guide = defineSeenOnce({ key: "guide" });
const run = feature({
  key: "run",
  initial: () => ({ n: 0 }),
  actions: (api) => ({
    bump: () =>
      api.set((s) => {
        s.run.n += 1;
      }),
  }),
});
const game = defineGame({
  id: "seen-toy",
  save: { key: "seen-toy.save", version: 1 },
  features: [guide, run],
});

const make = () =>
  createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend(), { debounceMs: 0, onError: () => {} }),
    now: () => 1000,
  });

describe("seenOnce", () => {
  test("see marks an id and says whether it was new; forget makes it new again", () => {
    const store = make();
    expect(store.getState().guide.seen).toEqual({});
    expect(store.getState().guide.see("shop")).toBe(true);
    expect(store.getState().guide.see("shop")).toBe(false);
    expect(store.getState().guide.seen.shop).toBe(true);
    store.getState().guide.forget("shop");
    expect(store.getState().guide.seen).toEqual({});
    expect(store.getState().guide.see("shop")).toBe(true);
  });

  test("an action that changes nothing writes nothing: no subscriber hears it", () => {
    const store = make();
    store.getState().guide.seeAll(["shop", "tree"]);
    expect(Object.keys(store.getState().guide.seen).sort()).toEqual(["shop", "tree"]);
    let heard = 0;
    const off = store.subscribe(() => {
      heard++;
    });
    store.getState().guide.see("shop");
    store.getState().guide.seeAll(["tree", "shop"]);
    store.getState().guide.seeAll([]);
    store.getState().guide.forget("never");
    expect(heard).toBe(0);
    store.getState().guide.seeAll(["shop", "wall"]);
    expect(heard).toBe(1);
    off();
  });

  test("what was seen survives a run reset and an export into a fresh store, and a profile reset forgets it", () => {
    const store = make();
    store.getState().run.bump();
    store.getState().guide.see("shop");
    store.getState().resetRun();
    expect(store.getState().run.n).toBe(0);
    expect(store.getState().guide.seen).toEqual({ shop: true });
    const other = make();
    other.getState().importProfile(store.getState().exportProfile());
    expect(other.getState().guide.seen).toEqual({ shop: true });
    store.getState().resetProfile();
    expect(store.getState().guide.seen).toEqual({});
  });

  test("it has the three namespaces, each empty", () => {
    expect([guide.select, guide.def, guide.draft]).toEqual([{}, {}, {}]);
  });
});
