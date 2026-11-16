import { describe, expect, test } from "bun:test";
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineGame,
  type FeatureSpec,
  feature,
  type Game,
} from "watchpot/core";
import { T0, wallet } from "./toy";

/** Actions: what `api.set` hands back, the recipe it refuses, and the names `defineGame` refuses. */

const save = { key: "acts.save", version: 1 };

const storeOf = <F extends readonly FeatureSpec[], R extends object>(game: Game<F, R>) =>
  createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend(), { debounceMs: 0, onError: () => {} }),
    now: () => T0,
  });

const counter = feature({
  key: "counter",
  initial: () => ({ n: 0 }),
  actions: (api) => ({
    bump: () =>
      api.set((s) => {
        s.counter.n += 1;
      }),
    /** Bumps and says the count it reached: the recipe's return is the action's. */
    take: (): number =>
      api.set((s) => {
        s.counter.n += 1;
        return s.counter.n;
      }),
    /** A recipe that returns a value without touching the draft: the state must not become that value. */
    peek: (): boolean => api.set((s) => s.counter.n > 0),
  }),
});

describe("api.set", () => {
  test("returns what the recipe returns, and keeps the change", () => {
    const store = storeOf(defineGame({ id: "acts", save, features: [counter] }));
    expect(store.getState().counter.peek()).toBe(false);
    expect(store.getState().counter.take()).toBe(1);
    expect(store.getState().counter.take()).toBe(2);
    expect(store.getState().counter.peek()).toBe(true);
    expect(store.getState().counter.n).toBe(2);
  });

  test("an action called inside a recipe throws, and the outer change is not half made", () => {
    const nesting = feature({
      key: "nesting",
      reach: [counter],
      initial: () => ({ m: 0 }),
      actions: (api) => ({
        both: () =>
          api.set((s) => {
            s.nesting.m += 1;
            api.get().counter.bump();
          }),
      }),
    });
    const store = storeOf(defineGame({ id: "acts", save, features: [counter, nesting] }));
    expect(() => store.getState().nesting.both()).toThrow(/draft helper/);
    expect(store.getState().nesting.m).toBe(0);
    expect(store.getState().counter.n).toBe(0);
    // The store is not left refusing: the next action runs.
    store.getState().counter.bump();
    expect(store.getState().counter.n).toBe(1);
  });

  test("an action called from a step throws inside the tick", () => {
    const eager = feature({
      key: "eager",
      reach: [counter],
      initial: () => ({}),
      steps: { settle: { poke: (s) => s.counter.bump() } },
    });
    const store = storeOf(defineGame({ id: "acts", save, features: [counter, eager] }));
    expect(() => store.getState().tick(100, T0 + 100)).toThrow(/inside a recipe/);
    expect(store.getState().counter.n).toBe(0);
  });
});

describe("defineGame refuses a name that would replace another", () => {
  test("an action named like a key of its feature's initial state", () => {
    const shadow = feature({
      key: "shadow",
      initial: () => ({ open: false }),
      actions: (api) => ({
        open: () =>
          api.set((s) => {
            s.shadow.open = true;
          }),
      }),
    });
    expect(() => defineGame({ id: "shadow", save, features: [shadow] })).toThrow(
      /feature "shadow": the action "open"/,
    );
  });

  test("a game action named like a feature", () => {
    expect(() =>
      defineGame({ id: "shadow", save, features: [wallet], actions: () => ({ wallet: () => {} }) }),
    ).toThrow(/game action "wallet"/);
  });

  test("an order id, naming the feature it points at", () => {
    expect(() =>
      defineGame({ id: "o", save, features: [counter], order: { sync: ["nobody.sync.x"] } }),
    ).toThrow(/no feature "nobody"/);
    expect(() =>
      defineGame({ id: "o", save, features: [counter], order: { sync: ["counter.sync.x"] } }),
    ).toThrow(/feature "counter" declares no sync step "x"/);
  });
});
