import { describe, expect, test } from "bun:test";
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  D,
  defineFeature,
  defineGame,
  type StateOf,
  ZERO,
} from "watchpot/core";
import { generator, prestige, T0, type ToyState, toy, toyStore, wallet } from "./toy";

/** The declarations: what a feature tuple types, and what `defineGame` refuses. */

describe("types read off the feature tuple", () => {
  test("every feature's state and actions sit under its key, the built-in clock included", () => {
    const { store } = toyStore();
    const s: ToyState = store.getState();
    expect(s.wallet.gold.eq(10)).toBe(true);
    expect(typeof s.generator.buy).toBe("function");
    expect(s.prestige.shards.eq(ZERO)).toBe(true);
    expect(s.clock.offsetMs).toBe(0);
    // @ts-expect-error no such feature
    expect(s.nope).toBeUndefined();
  });

  test("a feature reaches the features it names, with no annotation", () => {
    const { store } = toyStore();
    store.getState().catchUp(T0);
    // `generator.buy` spends the wallet: the reach typed `s.wallet` inside the generator's action.
    expect(store.getState().generator.buy()).toBe(true);
    expect(store.getState().generator.owned).toBe(2);
    expect(store.getState().wallet.gold.eq(0)).toBe(true);
    expect(store.getState().generator.buy()).toBe(false);
  });

  test("a self-contained feature sees its own slice", () => {
    const counter = defineFeature({
      key: "counter",
      initial: () => ({ n: 0 }),
      actions: (api) => ({
        bump: () =>
          api.set((s) => {
            s.counter.n += 1;
          }),
      }),
      steps: {
        settle: {
          double: (s) => {
            s.counter.n *= 2;
          },
        },
      },
    });
    type S = StateOf<[typeof counter]>;
    const probe: S = { counter: { n: 1, bump: () => {} } };
    expect(probe.counter.n).toBe(1);
  });

  test("a feature with no actions and no steps is still a feature", () => {
    const flags = defineFeature({ key: "flags", initial: () => ({ seen: false }) });
    expect(flags.reset).toBe("run");
    expect(flags.transient).toEqual([]);
    expect(Object.keys(flags.actions(undefined as never))).toEqual([]);
  });
});

describe("saved and transient keys", () => {
  test("every feature saves under its key; a transient key never saves", () => {
    const { store, backend } = toyStore();
    store.getState().wallet.earn(5);
    expect(store.getState().wallet.flash).toBe("+5");
    const raw = backend.getItem("toy.save");
    const saved = JSON.parse(raw ?? "{}") as {
      state: Record<string, Record<string, unknown>>;
      version: number;
    };
    expect(Object.keys(saved.state).sort()).toEqual(["clock", "generator", "prestige", "wallet"]);
    expect(saved.version).toBe(1);
    expect("flash" in (saved.state.wallet ?? {})).toBe(false);
    expect("gold" in (saved.state.wallet ?? {})).toBe(true);
  });

  test("a Decimal nested one level down survives the save", () => {
    const vault = defineFeature({
      key: "vault",
      initial: () => ({ by: { common: D(3), rare: ZERO } }),
    });
    const game = defineGame({ id: "vault", save: { key: "vault.save", version: 1 }, features: [vault] });
    const backend = createMemoryBackend();
    const a = createIdleStore(game, {
      storage: createGameStorage(backend, { debounceMs: 0 }),
      now: () => T0,
    });
    a.setState((s) => {
      s.vault.by.common = s.vault.by.common.mul(7);
    });
    const b = createIdleStore(game, {
      storage: createGameStorage(backend, { debounceMs: 0 }),
      now: () => T0,
    });
    expect(b.getState().vault.by.common.eq(21)).toBe(true);
    expect(b.getState().vault.by.rare.eq(0)).toBe(true);
  });
});

describe("defineGame refuses", () => {
  const save = { key: "bad.save", version: 1 };

  test("two features with the same key, naming it", () => {
    const twin = defineFeature({ key: "wallet", initial: () => ({ x: 1 }) });
    expect(() => defineGame({ id: "dup", save, features: [wallet, twin] })).toThrow("share the key `wallet`");
  });

  test("a feature named like the built-in clock when no clock fields are given", () => {
    const clockish = defineFeature({ key: "clock", initial: () => ({ lastSeen: 0 }) });
    expect(() => defineGame({ id: "clockish", save, features: [clockish] })).toThrow("share the key `clock`");
  });

  test("an after target no feature declares, one in another phase, and one that is no step", () => {
    const step = (target: string) =>
      defineFeature({
        key: "w",
        initial: () => ({}),
        steps: { sync: { x: { after: target, run: () => {} } } },
      });
    expect(() => defineGame({ id: "order", save, features: [step("nobody.sync.y")] })).toThrow(
      "no feature `nobody`",
    );
    expect(() => defineGame({ id: "order", save, features: [step("w.produce.y")] })).toThrow(
      "not a step of the sync phase",
    );
    expect(() => defineGame({ id: "order", save, features: [step("w.sync.y")] })).toThrow(
      "does not declare in sync",
    );
  });

  test("a transient or kept key that is not in the initial state", () => {
    const leaky = defineFeature({
      key: "leaky",
      initial: () => ({ a: 1 }) as { a: number; b?: number },
      transient: ["b"],
    });
    expect(() => defineGame({ id: "leaky", save, features: [leaky] })).toThrow("transient key `b`");
    const keepy = defineFeature({
      key: "keepy",
      initial: () => ({ a: 1 }) as { a: number; b?: number },
      reset: { keep: ["b"] },
    });
    expect(() => defineGame({ id: "keepy", save, features: [keepy] })).toThrow("kept key `b`");
  });

  test("a reach the game does not list", () => {
    expect(() => defineGame({ id: "reach", save, features: [generator] })).toThrow("reaches `wallet`");
    expect(() => defineGame({ id: "reach", save, features: [wallet, generator, prestige] })).not.toThrow();
  });

  test("a feature key or step name with a dot in it", () => {
    expect(() => defineFeature({ key: "a.b", initial: () => ({}) })).toThrow('"a.b"');
    const dotted = defineFeature({
      key: "dotted",
      initial: () => ({}),
      steps: { sync: { "x.y": () => {} } },
    });
    expect(() => defineGame({ id: "dotted", save, features: [dotted] })).toThrow("step name `x.y`");
  });

  test("the toy itself is well formed", () => {
    expect(toy.features.map((f) => f.key)).toEqual(["wallet", "generator", "prestige", "clock"]);
    expect(toy.clock.feature).toBe("clock");
  });
});
