import { describe, expect, test } from "bun:test";
import { D, defineGame, feature, records } from "watchpot/core";
import { freshStore, T0 } from "watchpot/test";

const stats = records({
  key: "stats",
  keepRuns: 3,
  track: {
    clicks: { kind: "sum", scope: ["run", "life"] },
    gold: { kind: "sum", scope: ["run", "life"], decimal: true },
    peak: { kind: "max", scope: ["run"], decimal: true },
    fastest: { kind: "min", scope: ["run", "life"] },
    lastPick: { kind: "last", scope: ["life"] },
  },
});

/** A step that counts through the draft helper: one tick, one gold. */
const mine = feature({
  key: "mine",
  reach: [stats],
  initial: () => ({}),
  steps: { produce: { count: { pass: "tick", run: (d) => stats.add(d, "gold", 1) } } },
});
const game = defineGame({ id: "stats", save: { key: "stats.save", version: 1 }, features: [stats, mine] });

describe("records", () => {
  test("each kind folds by its rule, at the scopes it keeps", () => {
    const { store } = freshStore(game);
    const s = () => store.getState().stats;
    expect(s().run("clicks")).toBe(0);
    expect(s().run("peak")).toBeUndefined();
    s().add("clicks", 2);
    s().add("clicks", 3);
    s().note("peak", 50);
    s().note("peak", 20);
    s().note("fastest", 9);
    s().note("fastest", 4);
    s().note("fastest", 7);
    s().note("lastPick", 1);
    s().note("lastPick", 8);
    expect(s().run("clicks")).toBe(5);
    expect(s().life("clicks")).toBe(5);
    expect(s().run("peak")?.toNumber()).toBe(50);
    expect(s().life("peak")).toBeUndefined();
    expect(s().run("fastest")).toBe(4);
    expect(s().life("lastPick")).toBe(8);
    expect(s().run("lastPick")).toBeUndefined();
  });

  test("a step counts through the draft helper, in Decimals", () => {
    const { store } = freshStore(game);
    for (let i = 1; i <= 3; i++) store.getState().tick(1000, T0 + i * 1000);
    expect(stats.value(store.getState().stats, "run", "gold")?.toNumber()).toBe(3);
  });

  test("a run reset pushes the run, keeps life, folds the best and the shortest run", () => {
    const { store } = freshStore(game);
    const s = () => store.getState().stats;
    s().add("clicks", 10);
    s().note("peak", D(1e40));
    s().note("fastest", 30);
    store.getState().resetRun({ now: T0 + 60_000 });
    expect(s().run("clicks")).toBe(0);
    expect(s().run("peak")).toBeUndefined();
    expect(s().life("clicks")).toBe(10);
    expect(s().runs).toHaveLength(1);
    expect(s().runs[0]).toMatchObject({ endedAt: T0 + 60_000, lengthMs: 60_000 });
    expect(s().bestRunMs).toBe(60_000);

    s().add("clicks", 4);
    s().note("peak", 5);
    s().note("fastest", 12);
    store.getState().resetRun({ now: T0 + 90_000 });
    expect(s().bestRunMs).toBe(30_000);
    expect(s().best("clicks")).toBe(10);
    expect(s().best("peak")?.toNumber()).toBe(1e40);
    expect(s().best("fastest")).toBe(12);
    expect(s().life("clicks")).toBe(14);
  });

  test("the runs list keeps the newest few, oldest first", () => {
    const { store } = freshStore(game);
    for (let i = 1; i <= 5; i++) {
      store.getState().stats.add("clicks", i);
      store.getState().resetRun({ now: T0 + i * 1000 });
    }
    expect(store.getState().stats.runs.map((r) => r.values.clicks)).toEqual([3, 4, 5]);
  });

  test("a save round trip keeps every scope, Decimals included", () => {
    const { store } = freshStore(game);
    store.getState().stats.note("peak", D("1e400"));
    store.getState().stats.add("clicks", 2);
    store.getState().resetRun({ now: T0 + 5000 });
    store.getState().stats.note("peak", 3);
    const saved = store.getState().exportProfile();
    const { store: again } = freshStore(game, { save: saved });
    expect(again.getState().stats.best("peak")?.eq(D("1e400"))).toBe(true);
    expect(again.getState().stats.run("peak")?.toNumber()).toBe(3);
    expect(again.getState().stats.runs).toHaveLength(1);
    expect(again.getState().stats.life("clicks")).toBe(2);
  });
});
