import { describe, expect, test } from "bun:test";
import { damp, defineGame, isDecimal, type LayerDef, type LayerQuery, layers, mulStat } from "watchpot/core";
import { autoPlayer, createSimWorld, simStore } from "watchpot/sim";
import { freshStore, T0 } from "watchpot/test";

type Id = "a" | "b" | "c";
type Stat = "speed" | "gain" | "cost";
type Q = LayerQuery<Id, Stat, "points">;
type Layer = LayerDef<Id, Stat, "points">;

const A: Layer = {
  id: "a",
  row: 1,
  kind: "normal",
  from: "points",
  requires: 10,
  gain: "gain",
  holding: { effects: [mulStat("speed", (q: Q) => damp(q.units("a")))] },
  upgrades: [
    { id: "a1", cost: 1, effects: [mulStat("speed", () => 2)] },
    { id: "a2", cost: 3, effects: [mulStat("gain", () => 2)] },
  ],
  buyables: [
    {
      id: "a.x",
      pay: "a",
      first: 5,
      growth: 3,
      effects: [mulStat("speed", (q: Q) => 1.2 ** q.level("a", "a.x"))],
    },
  ],
};
const B: Layer = { id: "b", row: 2, kind: "static", from: "points", requires: 200, scale: 3, parents: ["a"] };
const C: Layer = { id: "c", row: 2, kind: "normal", from: "points", requires: 1e4, parents: ["a"] };

const climbOf = (list: Layer[]) =>
  layers({ key: "climb", base: { id: "points", rate: "speed" }, layers: list });
const gameOf = (list: Layer[]) =>
  defineGame({ id: "climb", save: { key: "climb.save", version: 1 }, features: [climbOf(list)] });

describe("the layers feature", () => {
  test("steps every tick and over an absence, and its actions settle what follows", () => {
    const { store, clock } = freshStore(gameOf([A, B]));
    const play = (ms: number) => {
      clock.advance(ms);
      store.getState().tick(ms);
    };
    play(10_000);
    const climb = () => store.getState().climb;
    expect(climb().base.toNumber()).toBeCloseTo(10, 6);
    expect(climb().reset("a")).toBe(true);
    expect(climb().layers.a.amount.toNumber()).toBe(1);
    expect(climb().base.toNumber()).toBe(0);
    expect(climb().buy("a", "a1")).toBe(true);
    expect(climb().buy("a", "a1")).toBe(false);
    const before = climb().baseTotal;
    clock.advance(600_000);
    store.getState().catchUp();
    expect(climb().baseTotal.gt(before)).toBe(true);
    expect(climb().playedMs).toBeGreaterThanOrEqual(610_000);
  });

  test("saves, and loads into a build with a layer added since", () => {
    const old = freshStore(gameOf([A, B]));
    old.clock.advance(50_000);
    old.store.getState().tick(50_000);
    old.store.getState().climb.reset("a");
    const held = old.store.getState().climb.layers.a.amount;
    expect(held.gt(0)).toBe(true);

    const { store } = freshStore(gameOf([A, B, C]), { backend: old.backend, catchUp: false });
    const s = store.getState().climb;
    expect(isDecimal(s.layers.a.amount)).toBe(true);
    expect(s.layers.a.amount.eq(held)).toBe(true);
    expect(s.layers.a.established).toBe(true);
    expect(s.layers.c.established).toBe(false);
    expect(isDecimal(s.layers.c.amount)).toBe(true);
    expect(store.getState().climb.reset("a")).toBe(false);
  });

  test("the auto-player climbs two rows of a toy tree from its moves", () => {
    const climb = climbOf([A, B]);
    const game = defineGame({ id: "climb", save: { key: "climb.save", version: 1 }, features: [climb] });
    const world = createSimWorld((now) => simStore(game, now), T0);
    const player = autoPlayer(game, { balance: climb.balance });
    for (let i = 0; i < 60 && !world.store.getState().climb.layers.b.established; i++) {
      player.look(world.store);
      world.play(60_000);
    }
    const s = world.store.getState().climb;
    expect(s.layers.a.established).toBe(true);
    expect(s.layers.b.established).toBe(true);
  });
});
