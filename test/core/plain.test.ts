import { describe, expect, test } from "bun:test";
import {
  createPlainStore,
  D,
  defineCurrencies,
  defineFeature,
  defineGame,
  defineGenerators,
  vocab,
} from "watchpot/core";
import { autoPlayer } from "watchpot/sim";
import { plainParity } from "watchpot/test";

const WORDS = vocab({ currencies: ["bubbles"] });
const save = { key: "plain.save", version: 1 } as const;

const SHARED: readonly string[] = [];

const wallet = defineCurrencies({ key: "wallet", vocab: WORDS, start: { bubbles: 15 } });
const kettles = defineGenerators({
  key: "kettles",
  wallet,
  list: [
    { id: "kettle", pays: "bubbles", makes: "bubbles", rate: 1, cost: { base: 10, growth: 1.15 } },
    { id: "urn", pays: "bubbles", makes: "bubbles", rate: 8, cost: { base: 100, growth: 1.2 } },
  ],
});
const log = defineFeature({
  key: "log",
  reach: () => [kettles],
  // A shared constant in `initial`: the real store never writes to it, and the plain one must not either.
  initial: () => ({ lines: SHARED as string[], runs: 0, seenAt: 0 }),
  derived: { owned: (s) => Object.values(s.kettles.owned).reduce((a, b) => a + b, 0) },
  reset: { keep: ["runs"] },
  actions: (api) => ({
    note: (line: string) =>
      api.set((s) => {
        s.log.lines.push(line);
      }),
    again: () =>
      api.set((s) => {
        s.log.runs += 1;
        api.resetRun(s);
      }),
    broken: () =>
      api.set((s) => {
        s.log.runs += 100;
        throw new Error("no");
      }),
  }),
  steps: {
    settle: {
      mark: (s, ctx) => {
        if (s.log.owned >= 3 && s.log.seenAt === 0) s.log.seenAt = ctx.now;
      },
    },
  },
});
const game = defineGame({ id: "plain", save, vocab: WORDS, features: [wallet, kettles, log] });

describe("the plain store", () => {
  test("plays the game: actions, passes and derived values", () => {
    let clock = 1000;
    const store = createPlainStore(game, { now: () => clock, seed: "s" });
    const play = store.getState;
    expect(play().kettles.buy("kettle")).toBe(true);
    expect(play().log.owned).toBe(1);
    clock += 10_000;
    play().tick(10_000);
    expect(play().wallet.bubbles.toNumber()).toBeCloseTo(15, 6);
    play().log.note("hello");
    expect(play().log.lines).toEqual(["hello"]);
  });

  test("never writes into a constant an initial handed it", () => {
    const store = createPlainStore(game, { now: () => 0, seed: "s" });
    store.getState().log.note("a");
    store.getState().log.again();
    store.getState().log.note("b");
    expect(SHARED).toEqual([]);
    expect(store.getState().log.lines).toEqual(["b"]);
    expect(store.getState().log.runs).toBe(1);
  });

  test("refuses an action inside a recipe, as the real store does", () => {
    const store = createPlainStore(game, { now: () => 0, seed: "s" });
    expect(() =>
      store.setState(() => {
        store.getState().log.note("x");
      }),
    ).toThrow("inside a recipe");
  });

  test("a trial is put back", () => {
    const store = createPlainStore(game, { now: () => 0, seed: "s" });
    const owned = store.trial(() => {
      store.getState().kettles.buy("kettle");
      return store.getState().log.owned;
    });
    expect(owned).toBe(1);
    expect(store.getState().log.owned).toBe(0);
    expect(store.getState().wallet.bubbles.eq(D(15))).toBe(true);
  });

  test("has no save", () => {
    const store = createPlainStore(game, { now: () => 0 });
    expect(() => store.getState().exportProfile()).toThrow("plain store");
  });

  test("agrees with the real store, tick for tick, under the auto-player", () => {
    const players = {
      real: autoPlayer(game, {
        objective: (s: { kettles: { owned: Record<string, number> } }) => s.kettles.owned.kettle ?? 0,
      }),
      plain: autoPlayer(game, {
        objective: (s: { kettles: { owned: Record<string, number> } }) => s.kettles.owned.kettle ?? 0,
      }),
    };
    const drift = plainParity(game, {
      steps: 400,
      act: (store, step, which) => {
        if (step % 5 === 0) players[which].look(store as never);
        if (step === 300) (store.getState().log as { again(): void }).again();
      },
    });
    expect(drift).toBeNull();
  });

  test("parity names the first field that differs", () => {
    let calls = 0;
    const flaky = defineFeature({
      key: "flaky",
      initial: () => ({ n: 0 }),
      steps: {
        settle: {
          // Differs between the two stores on purpose: it counts every call across both.
          drift: (s) => {
            calls += 1;
            s.flaky.n = calls;
          },
        },
      },
    });
    const drift = plainParity(defineGame({ id: "flaky", save, features: [flaky] }), { steps: 10 });
    expect(drift).toMatch(/flaky\.n/);
  });
});

describe("the plain store works a derived value out only when a field it read is written", () => {
  let runs = 0;
  const shelf = defineFeature({
    key: "shelf",
    initial: () => ({ jars: 1, dust: 0, tags: [] as string[] }),
    derived: {
      weight: (s) => {
        runs += 1;
        return s.shelf.jars * 3;
      },
    },
    actions: (api) => ({
      sweep: () =>
        api.set((s) => {
          s.shelf.dust = 0;
        }),
      add: () =>
        api.set((s) => {
          s.shelf.jars += 1;
        }),
      tag: (t: string) =>
        api.set((s) => {
          s.shelf.tags.push(t);
        }),
    }),
    steps: {
      settle: {
        gather: (s) => {
          // Reads the derived value and writes a field it never read.
          s.shelf.dust += s.shelf.weight;
        },
      },
    },
  });
  const game = defineGame({ id: "shelf", save: { key: "shelf", version: 1 }, features: [shelf] });

  test("a write to another field, or a read alone, leaves it be", () => {
    const store = createPlainStore(game, { now: () => 0 });
    expect(store.getState().shelf.weight).toBe(3);
    runs = 0;
    for (let i = 0; i < 5; i++) store.getState().tick(1000, 1000 * i);
    store.getState().shelf.sweep();
    store.getState().shelf.tag("a");
    expect(store.getState().shelf.weight).toBe(3);
    expect(runs).toBe(0);
    store.getState().shelf.add();
    expect(store.getState().shelf.weight).toBe(6);
    expect(runs).toBe(1);
  });
});
