import { describe, expect, test } from "bun:test";
import {
  advanceSpawn,
  D,
  defineGame,
  drawOutcome,
  drawSpawnWait,
  feature,
  HOUR_MS,
  type RngState,
  type SpawnState,
  seedRng,
  spawns,
} from "watchpot/core";
import { autoPlayer, createSimWorld, simStore } from "watchpot/sim";
import { freshStore, T0 } from "watchpot/test";

const draws = (n: number, wait: Parameters<typeof drawSpawnWait>[1]) => {
  let rng: RngState = seedRng("waits");
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const [ms, next] = drawSpawnWait(rng, wait);
    out.push(ms);
    rng = next;
  }
  return out;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("the spawn kernel", () => {
  test("a wait stays inside its window; a ramp pushes it late", () => {
    const flat = draws(2000, { minMs: 1000, maxMs: 5000 });
    const ramped = draws(2000, { minMs: 1000, maxMs: 5000, ramp: { power: 5, stepMs: 33 } });
    for (const ms of [...flat, ...ramped]) {
      expect(ms).toBeGreaterThanOrEqual(1000);
      expect(ms).toBeLessThanOrEqual(5000);
    }
    expect(mean(flat)).toBeGreaterThan(2800);
    expect(mean(flat)).toBeLessThan(3200);
    expect(mean(ramped)).toBeGreaterThan(mean(flat));
    // A slower step means a lower chance each moment: more of them reach the forced arrival at the maximum.
    const slow = draws(2000, { minMs: 1000, maxMs: 5000, ramp: { power: 5, stepMs: 4000 } });
    expect(slow.filter((ms) => ms === 5000).length).toBeGreaterThan(
      ramped.filter((ms) => ms === 5000).length,
    );
  });

  test("an outcome is drawn from those open: gates and no repeats", () => {
    const table = [
      { id: "gold", weight: 10, noRepeat: true },
      { id: "gems", weight: 1, when: (s: { rich: boolean }) => s.rich },
    ];
    let rng = seedRng("o");
    for (let i = 0; i < 20; i++) {
      const [id, next] = drawOutcome(rng, table, { rich: false }, null);
      expect(id).toBe("gold");
      rng = next;
    }
    expect(drawOutcome(rng, table, { rich: true }, "gold")[0]).toBe("gems");
    expect(drawOutcome(rng, table, { rich: false }, "gold")[0]).toBeNull();
  });

  test("advanceSpawn walks a gap: the missed counted, at most one left live", () => {
    const start: SpawnState = {
      nextAt: 1000,
      live: null,
      caught: 0,
      missed: 0,
      born: 0,
      last: null,
      rng: seedRng("a"),
    };
    const timing = { kind: "spark", wait: { minMs: 1000, maxMs: 2000 }, lifeMs: 500 };
    expect(advanceSpawn(start, 999, timing).state).toBe(start);
    const step = advanceSpawn(start, 60_000, timing);
    expect(step.born).toBeGreaterThan(19);
    expect(step.missed).toBeGreaterThanOrEqual(step.born - 1);
    expect(step.state.missed + (step.state.live ? 1 : 0)).toBe(step.state.born);
    if (step.state.live) expect(step.state.live.diesAt).toBeGreaterThan(60_000);
  });
});

const fair = spawns({
  key: "fair",
  kinds: [
    {
      id: "spark",
      wait: { minMs: 10_000, maxMs: 20_000 },
      lifeMs: 5000,
      outcomes: [
        { id: "gold", weight: 3 },
        { id: "gems", weight: 1, noRepeat: true },
      ],
    },
  ],
  onCatch: (d: { purse: { gold: number; gems: number } }, outcome) => {
    if (outcome === "gold") d.purse.gold += 10;
    if (outcome === "gems") d.purse.gems += 1;
  },
});
const purse = feature({ key: "purse", initial: () => ({ gold: 0, gems: 0 }) });
const game = defineGame({ id: "fair", save: { key: "fair.save", version: 1 }, features: [purse, fair] });

describe("spawns feature", () => {
  test("one arrives inside its window and pays its outcome when caught", () => {
    const { store, clock } = freshStore(game, { seed: 1 });
    const spark = () => store.getState().fair.kinds.spark;
    const due = spark()?.nextAt ?? 0;
    expect(due - T0).toBeGreaterThanOrEqual(10_000);
    expect(due - T0).toBeLessThanOrEqual(20_000);
    expect(store.getState().fair.catch("spark")).toBeNull();

    clock.set(due + 100);
    store.getState().tick(1000);
    expect(spark()?.live).toMatchObject({ id: "spark:0", bornAt: due, diesAt: due + 5000 });
    const outcome = store.getState().fair.catch("spark");
    expect(["gold", "gems"]).toContain(outcome ?? "");
    const { gold, gems } = store.getState().purse;
    expect(gold + gems).toBeGreaterThan(0);
    expect(spark()).toMatchObject({ caught: 1, live: null, last: outcome });
    expect((spark()?.nextAt ?? 0) - clock.now()).toBeGreaterThanOrEqual(10_000);
  });

  test("an arrival left alone dies and is counted missed; an absence pays nothing", () => {
    const { store } = freshStore(game, { seed: 2 });
    store.getState().catchUp(T0 + HOUR_MS);
    const spark = store.getState().fair.kinds.spark;
    expect(spark?.missed).toBeGreaterThan(100);
    expect(store.getState().purse).toEqual({ gold: 0, gems: 0 });
  });

  test("a reload replays the same arrivals; a run reset clears the live one and keeps the counts", () => {
    const { store, clock } = freshStore(game, { seed: 3 });
    const saved = store.getState().exportProfile();
    const { store: again } = freshStore(game, { save: saved });
    expect(again.getState().fair.kinds.spark?.nextAt).toBe(store.getState().fair.kinds.spark?.nextAt ?? -1);

    clock.advance(HOUR_MS);
    store.getState().catchUp();
    const missed = store.getState().fair.kinds.spark?.missed ?? 0;
    store.getState().resetRun();
    store.getState().tick(0);
    expect(store.getState().fair.kinds.spark?.missed).toBe(missed);
    expect(store.getState().fair.kinds.spark?.live).toBeNull();
  });

  test("an import of a save from before the spawns arrives as the run would have", () => {
    const before = defineGame({ id: "fair", save: { key: "fair.save", version: 1 }, features: [purse] });
    const old = freshStore(before, { seed: 4 }).store.getState().exportProfile();
    const carried = freshStore(game, { seed: 4 });
    const imported = freshStore(game, { seed: 4 });
    imported.store.getState().importProfile(old, T0);
    imported.store.getState().catchUp(T0);
    for (const { store, clock } of [carried, imported]) {
      clock.advance(HOUR_MS);
      store.getState().catchUp();
    }
    expect(imported.store.getState().fair.kinds).toEqual(carried.store.getState().fair.kinds);
    expect(carried.store.getState().fair.kinds.spark?.missed).toBeGreaterThan(0);
  });

  test("the auto-player catches what is live", () => {
    const world = createSimWorld((now) => simStore(game, now, "seed"), T0, { tickMs: 1000 });
    const player = autoPlayer(game, { balance: () => D(0) });
    for (let i = 0; i < 300; i++) {
      player.look(world.store);
      world.play(2000);
    }
    const spark = world.store.getState().fair.kinds.spark;
    expect(spark?.caught).toBeGreaterThan(10);
    expect(spark?.missed).toBe(0);
  });
});
