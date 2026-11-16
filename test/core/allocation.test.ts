import { describe, expect, test } from "bun:test";
import {
  allocatedUnits,
  allocation,
  assignUnits,
  busOf,
  D,
  defineGame,
  type Effect,
  feature,
  freeUnits,
  HOUR_MS,
  rebalanceUnits,
  statTotals,
} from "watchpot/core";
import { freshStore, T0 } from "watchpot/test";

describe("assign, free and rebalance", () => {
  test("assign takes no more than is free or than the cap leaves room for", () => {
    expect(assignUnits({}, "a", 3, 5)).toEqual({ a: 3 });
    expect(assignUnits({ a: 3 }, "b", 9, 5)).toEqual({ a: 3, b: 2 });
    expect(assignUnits({ a: 1 }, "a", 9, 10, 4)).toEqual({ a: 4 });
    expect(assignUnits({ a: 3 }, "a", -9, 5)).toEqual({ a: 0 });
    expect(freeUnits({ a: 3, b: 1 }, 10)).toBe(6);
    expect(freeUnits({ a: 30 }, 10)).toBe(0);
  });

  test("never more assigned than the pool, whatever the moves", () => {
    let a: Record<string, number> = {};
    const moves: [string, number][] = [
      ["x", 4],
      ["y", 9],
      ["x", -2],
      ["z", 3],
      ["y", -1],
      ["x", 50],
    ];
    for (const [id, n] of moves) {
      a = assignUnits(a, id, n, 10);
      expect(allocatedUnits(a)).toBeLessThanOrEqual(10);
      expect(Object.values(a).every((v) => v >= 0)).toBe(true);
    }
    expect(allocatedUnits(a)).toBe(10);
  });

  test("rebalance trims the most recently assigned first, then to each cap", () => {
    const a = { x: 4, y: 3, z: 3 };
    expect(rebalanceUnits(a, 7, ["x", "z", "y"])).toEqual({ x: 4, y: 0, z: 3 });
    expect(rebalanceUnits(a, 5, ["x", "z", "y"])).toEqual({ x: 4, y: 0, z: 1 });
    expect(rebalanceUnits(a, 10, ["x", "y", "z"], { x: 2 })).toEqual({ x: 2, y: 3, z: 3 });
    expect(rebalanceUnits(a, 20, [])).toEqual(a);
    expect(allocatedUnits(rebalanceUnits(a, 2, ["z"]))).toBe(2);
  });
});

type State = { crew: { size: number }; jobs: { level: Record<string, number> } };
const crew = feature({
  key: "crew",
  initial: () => ({ size: 10 }),
  actions: (api) => ({
    resize: (size: number) =>
      api.set((s) => {
        s.crew.size = size;
      }),
  }),
});
const jobs = allocation({
  key: "jobs",
  pool: (s: State) => s.crew.size,
  sinks: [
    { id: "haul", cap: () => 4 },
    {
      id: "forge",
      cost: { base: 10, growth: 2 },
      speed: () => 1,
      effects: (level): Effect[] => [{ stat: "speed", add: level }],
    },
    { id: "study", cost: (level: number) => 5 + level, speed: () => 2, maxLevel: 3 },
  ],
  away: () => ({ rate: 1, capMs: HOUR_MS }),
});
const game = defineGame({ id: "jobs", save: { key: "jobs.save", version: 1 }, features: [crew, jobs] });

describe("allocation", () => {
  test("assign is clamped to what is free and the cap; fill takes everything free", () => {
    const { store } = freshStore(game);
    expect(store.getState().jobs.assign("haul", 9)).toBe(4);
    expect(store.getState().jobs.assign("forge", 3)).toBe(3);
    expect(jobs.rules.free(store.getState())).toBe(3);
    expect(store.getState().jobs.fill("study")).toBe(3);
    expect(store.getState().jobs.assign("forge", 1)).toBe(0);
    expect(store.getState().jobs.unassign("haul", 1)).toBe(1);
    expect(store.getState().jobs.assign("nothing", 1)).toBe(0);
    expect(store.getState().jobs.clear()).toBe(9);
    expect(allocatedUnits(store.getState().jobs.assigned)).toBe(0);
  });

  test("a shrinking pool takes back from the most recently assigned", () => {
    const { store } = freshStore(game);
    store.getState().jobs.assign("forge", 3);
    store.getState().jobs.assign("haul", 4);
    store.getState().jobs.assign("study", 3);
    store.getState().jobs.assign("forge", 0); // no gain: the order holds
    store.getState().crew.resize(5);
    store.getState().tick(100, T0 + 100);
    expect(store.getState().jobs.assigned).toEqual({ haul: 2, forge: 3, study: 0 });
  });

  test("a bar levels up when full, several levels in one long step, as many short steps do", () => {
    const play = (steps: number, each: number) => {
      const { store } = freshStore(game);
      store.getState().jobs.assign("forge", 3);
      for (let i = 1; i <= steps; i++) store.getState().tick(each, T0 + i * each);
      return store.getState().jobs;
    };
    // 3 work a second for 100 s: 300 work covers 10 + 20 + 40 + 80 = 150, not 310.
    const long = play(1, 100_000);
    const short = play(1000, 100);
    expect(long.level.forge).toBe(4);
    expect(short.level.forge).toBe(4);
    expect(long.progress.forge?.toNumber()).toBeCloseTo(150);
    expect(short.progress.forge?.toNumber()).toBeCloseTo(150);
  });

  test("a walked cost curve stops at its max level", () => {
    const { store } = freshStore(game);
    store.getState().jobs.assign("study", 1);
    store.getState().tick(1000, T0 + 1000); // 2 work: none of the 5
    expect(jobs.rules.bar(store.getState(), "study")).toMatchObject({ level: 0, share: 0.4 });
    store.getState().tick(100_000, T0 + 101_000);
    expect(store.getState().jobs.level.study).toBe(3);
    expect(store.getState().jobs.progress.study?.toNumber()).toBe(0);
  });

  test("an absence fills at the away rate up to its cap; levels feed the bus", () => {
    const { store, clock } = freshStore(game);
    store.getState().jobs.assign("forge", 1);
    clock.advance(10 * HOUR_MS);
    store.getState().catchUp();
    // One hour of 1 work a second: 3600 covers 10 x (2^8 - 1) = 2550, not 5110.
    expect(store.getState().jobs.level.forge).toBe(8);
    const bus = busOf(jobs.rules.contributions(store.getState().jobs));
    expect(statTotals(bus, "speed").add).toBe(8);
    expect(jobs.rules.perSecond(store.getState(), "forge").toNumber()).toBe(1);
    expect(jobs.rules.perSecond(store.getState(), "haul")).toEqual(D(0));
  });

  test("a repeated sink throws", () => {
    expect(() => allocation({ key: "x", pool: () => 1, sinks: [{ id: "a" }, { id: "a" }] })).toThrow(/twice/);
  });
});
