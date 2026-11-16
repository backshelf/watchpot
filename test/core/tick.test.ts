import { describe, expect, test } from "bun:test";
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineFeature,
  defineGame,
  HOUR_MS,
  type Pass,
  type Phase,
  resolvedSteps,
} from "watchpot/core";
import { OFFLINE_CAP_MS, OFFLINE_RATE, T0, toy, toyStore } from "./toy";

/** The phase runner: the resolved order, `order` overrides, the pass filters, and what `"stop"` skips. */

describe("the resolved order", () => {
  test("phases in order, features in list order, the clock last; each pass keeps only its steps", () => {
    expect(resolvedSteps(toy, "tick")).toEqual([
      "clock.guard.dt",
      "generator.rates.perSecond",
      "generator.produce.income",
      "generator.automate.autobuy",
      "clock.commit.lastSeen",
    ]);
    expect(resolvedSteps(toy, "catchUp")).toEqual([
      "clock.guard.createdAt",
      "generator.rates.perSecond",
      "generator.produce.offline",
      "clock.produce.gap",
      "clock.commit.lastSeen",
    ]);
  });

  test("`after` and `before` pull a step to the other side of another; the rest follow in feature order", () => {
    const a = defineFeature({
      key: "a",
      initial: () => ({}),
      steps: { sync: { one: () => {}, two: { before: "a.sync.one", run: () => {} } } },
    });
    const b = defineFeature({
      key: "b",
      initial: () => ({}),
      steps: { sync: { three: { before: "a.sync.two", run: () => {} } } },
    });
    const game = defineGame({ id: "ordered", save: { key: "o", version: 1 }, features: [a, b] });
    expect(resolvedSteps(game, "tick")).toEqual([
      "clock.guard.dt",
      "b.sync.three",
      "a.sync.two",
      "a.sync.one",
      "clock.commit.lastSeen",
    ]);
  });

  test("a feature key as a target means all of that feature's steps in the phase", () => {
    const a = defineFeature({
      key: "a",
      initial: () => ({}),
      steps: { sync: { one: { after: "b", run: () => {} }, two: () => {} } },
    });
    const b = defineFeature({ key: "b", initial: () => ({}), steps: { sync: { x: () => {}, y: () => {} } } });
    const game = defineGame({ id: "keyed", save: { key: "k", version: 1 }, features: [a, b] });
    expect(resolvedSteps(game, "tick")).toEqual([
      "clock.guard.dt",
      "a.sync.two",
      "b.sync.x",
      "b.sync.y",
      "a.sync.one",
      "clock.commit.lastSeen",
    ]);
  });

  test("steps that wait on each other in a loop are refused at definition", () => {
    const a = defineFeature({
      key: "a",
      initial: () => ({}),
      steps: { sync: { one: { after: "b.sync.two", run: () => {} } } },
    });
    const b = defineFeature({
      key: "b",
      initial: () => ({}),
      steps: { sync: { two: { after: "a.sync.one", run: () => {} } } },
    });
    expect(() => defineGame({ id: "loop", save: { key: "l", version: 1 }, features: [a, b] })).toThrow(
      "in a loop",
    );
  });
});

/** A game whose steps write their ids into a log, with a guard that stops when asked. */
function logged(stopAt: Partial<Record<Phase, boolean>>) {
  const log: string[] = [];
  const phases: Phase[] = ["guard", "sync", "rates", "produce", "automate", "settle", "commit", "after"];
  const wrap = (phase: Phase, run: () => "stop" | undefined) =>
    phase === "produce" ? { pass: "both" as const, run } : run;
  const steps = Object.fromEntries(
    phases.map((phase) => [
      phase,
      {
        a: wrap(phase, () => {
          log.push(`${phase}.a`);
          return stopAt[phase] ? "stop" : undefined;
        }),
        b: wrap(phase, () => {
          log.push(`${phase}.b`);
          return undefined;
        }),
      },
    ]),
  );
  const probe = defineFeature({ key: "probe", initial: () => ({}), steps });
  const game = defineGame({ id: "log", save: { key: "log", version: 1 }, features: [probe] });
  const store = createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
    now: () => T0,
  });
  return { log, store };
}

describe('"stop"', () => {
  test("from a guard: the work is skipped, commit and after still run, the clock still moves", () => {
    const { log, store } = logged({ guard: true });
    store.getState().tick(100, T0 + 100);
    expect(log).toEqual(["guard.a", "commit.a", "commit.b", "after.a", "after.b"]);
    expect(store.getState().clock.lastSeen).toBe(T0 + 100);
  });

  test("from the middle: the rest of that phase and every later work phase are skipped", () => {
    const { log, store } = logged({ produce: true });
    store.getState().tick(100, T0 + 100);
    expect(log.filter((l) => l.startsWith("produce"))).toEqual(["produce.a"]);
    expect(log.some((l) => l.startsWith("automate") || l.startsWith("settle"))).toBe(false);
    expect(log.slice(-4)).toEqual(["commit.a", "commit.b", "after.a", "after.b"]);
    expect(log.slice(0, 7)).toEqual([
      "guard.a",
      "guard.b",
      "sync.a",
      "sync.b",
      "rates.a",
      "rates.b",
      "produce.a",
    ]);
  });

  test("from commit or after: ignored, the rest of the phase runs", () => {
    const { log, store } = logged({ commit: true, after: true });
    store.getState().tick(100, T0 + 100);
    expect(log.slice(-4)).toEqual(["commit.a", "commit.b", "after.a", "after.b"]);
  });

  test("a tick with no time runs the game's guards, then nothing but commit and after", () => {
    const { log, store } = logged({});
    store.getState().tick(0, T0 + 5);
    expect(log).toEqual(["guard.a", "guard.b", "commit.a", "commit.b", "after.a", "after.b"]);
    expect(store.getState().clock.lastSeen).toBe(T0 + 5);
  });
});

describe("the two passes", () => {
  test("a step sees which pass it is in", () => {
    const seen: Pass[] = [];
    const spy = defineFeature({
      key: "spy",
      initial: () => ({}),
      steps: { sync: { look: (_s, ctx) => void seen.push(ctx.pass) } },
    });
    const game = defineGame({ id: "spy", save: { key: "spy", version: 1 }, features: [spy] });
    const store = createIdleStore(game, {
      storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
      now: () => T0,
    });
    store.getState().tick(100, T0 + 100);
    store.getState().catchUp(T0 + 200);
    expect(seen).toEqual(["tick", "catchUp"]);
  });

  test("the first catch-up syncs and stamps createdAt but credits nothing", () => {
    const { store } = toyStore();
    expect(store.getState().clock.createdAt).toBe(0);
    store.getState().catchUp(T0);
    const s = store.getState();
    expect(s.clock.createdAt).toBe(T0);
    expect(s.clock.lastSeen).toBe(T0);
    expect(s.generator.perSecond.eq(1)).toBe(true);
    expect(s.wallet.gold.eq(10)).toBe(true);
  });

  test("a live tick credits its length at the full rate", () => {
    const { store } = toyStore();
    store.getState().catchUp(T0);
    store.getState().tick(250, T0 + 250);
    expect(store.getState().wallet.gold.eq(10.25)).toBe(true);
    expect(store.getState().clock.lastSeen).toBe(T0 + 250);
  });

  test("a catch-up credits the gap through the engine's span: the offline rate, up to the cap", () => {
    const { store } = toyStore();
    store.getState().catchUp(T0);
    const gap = 10 * 60_000;
    store.getState().catchUp(T0 + gap);
    expect(store.getState().wallet.gold.eq(10 + (gap * OFFLINE_RATE) / 1000)).toBe(true);
    store.getState().catchUp(T0 + gap + 3 * HOUR_MS);
    const capped = 10 + (gap * OFFLINE_RATE) / 1000 + (OFFLINE_CAP_MS * OFFLINE_RATE) / 1000;
    expect(store.getState().wallet.gold.eq(capped)).toBe(true);
    expect(store.getState().clock.lastSeen).toBe(T0 + gap + 3 * HOUR_MS);
  });

  test("a catch-up with no gap still syncs, then stops before producing", () => {
    const { store } = toyStore();
    store.getState().catchUp(T0);
    store.getState().generator.buy();
    store.getState().catchUp(T0);
    expect(store.getState().generator.perSecond.eq(2)).toBe(true);
    expect(store.getState().wallet.gold.eq(0)).toBe(true);
  });

  test("automation runs in live ticks only", () => {
    const { store } = toyStore();
    store.getState().catchUp(T0);
    store.getState().generator.setAuto(true);
    store.getState().catchUp(T0 + HOUR_MS);
    expect(store.getState().generator.owned).toBe(1);
    store.getState().tick(100, T0 + HOUR_MS + 100);
    expect(store.getState().generator.owned).toBeGreaterThan(1);
  });
});
