import { describe, expect, test } from "bun:test";
import {
  type Achievement,
  achievementBoard,
  achievements,
  currencies,
  type Decimal,
  defineGame,
  type Effect,
  vocab,
} from "watchpot/core";
import { freshStore, T0 } from "watchpot/test";
import { totals } from "./fold";

const WORDS = vocab({ currencies: ["gold", "gems"], stats: [], rarities: ["common"] } as const);
const wallet = currencies({ key: "wallet", vocab: WORDS });
type State = { wallet: { gold: Decimal; gems: Decimal } };

const LIST: Achievement<State, Effect>[] = [
  {
    id: "first",
    name: "First",
    line: "Hold 10 gold.",
    when: (s) => s.wallet.gold.gte(10),
    effects: [{ stat: "speed", add: 1 }],
  },
  { id: "rich", name: "Rich", line: "Hold 1,000 gold.", when: (s) => s.wallet.gold.gte(1000) },
  {
    id: "patient",
    name: "Patient",
    line: "Hold 5 gems for 30 seconds.",
    when: (s) => s.wallet.gems.gte(5),
    forMs: 30_000,
  },
  {
    id: "bare",
    name: "Bare",
    line: "Reset with no gems.",
    on: ["reset"],
    when: (s) => s.wallet.gems.lte(0),
    secret: true,
  },
  { id: "given", name: "Given", line: "The game says so.", effects: [{ stat: "speed", mul: 2 }] },
  { id: "late", name: "Late", line: "Hold 1e9 gold.", when: (s) => s.wallet.gold.gte(1e9) },
];

const wall = achievements({
  key: "wall",
  list: LIST,
  columns: 3,
  rowEffects: (row) => [{ stat: "speed", add: 10 * (row.index + 1) }],
});
const game = defineGame({
  id: "walls",
  save: { key: "walls.save", version: 1 },
  features: [wallet, wall],
  vocab: WORDS,
});

/** A fresh store and a one-second tick ending at `at`. */
const start = (save?: string) => {
  const { store } = freshStore(game, { save });
  return { store, play: (at: number) => store.getState().tick(1000, at) };
};

describe("achievementBoard", () => {
  const board = achievementBoard({ id: "b", list: LIST, columns: 4 });

  test("rows of the width, a short last row, a secret hidden until earned", () => {
    const rows = board.rows({});
    expect(rows.map((r) => r.tiles.length)).toEqual([4, 2]);
    expect(rows[0]?.tiles[3]).toMatchObject({ hidden: true, earned: false, at: null });
    const earned = board.rows({ bare: 5 });
    expect(earned[0]?.tiles[3]).toMatchObject({ hidden: false, earned: true, at: 5 });
  });

  test("a row completes once every tile is earned; power multiplies the count and the rows", () => {
    const all = { first: 1, rich: 1, patient: 1, bare: 1 };
    expect(board.rowsComplete({ first: 1, rich: 1 })).toBe(0);
    expect(board.rowsComplete(all)).toBe(1);
    expect(board.count({ ...all, gone: 1 })).toBe(4);
    const power = board.power(all, { each: 1.03, row: 1.25 }).toNumber();
    expect(power).toBeCloseTo(1.03 ** 4 * 1.25);
    expect(board.power({}, { each: 1.03 }).toNumber()).toBe(1);
    expect(board.power({ first: 1, rich: 1 }, { each: 2 }).gt(board.power({ first: 1 }, { each: 2 }))).toBe(
      true,
    );
  });

  test("contributions feed the stat bus, sourced by achievement and by row", () => {
    const narrow = achievementBoard({
      id: "w",
      list: LIST,
      columns: 2,
      rowEffects: () => [{ stat: "speed", add: 100 }],
    });
    const fed = narrow.contributions({ first: 1, rich: 1, given: 1 });
    expect(totals(fed, "speed")).toEqual({ add: 101, mult: 2 });
    expect(fed.map((c) => c.source)).toEqual(["w:first", "w:given", "w:row:0"]);
  });

  test("a repeated id throws", () => {
    expect(() =>
      achievementBoard({
        id: "x",
        columns: 2,
        list: [
          { id: "a", name: "A", line: "" },
          { id: "a", name: "A", line: "" },
        ],
      }),
    ).toThrow(/appears twice/);
  });
});

describe("achievements feature", () => {
  test("earned once, at game time, kept across a run reset", () => {
    const { store, play } = start();
    store.getState().wallet.credit("gold", 10);
    play(T0 + 1000);
    expect(store.getState().wall.earned.first).toBe(T0 + 1000);
    expect(store.getState().wall.fresh).toEqual(["first"]);

    store.getState().wallet.debit("gold", 10);
    store.getState().wallet.credit("gold", 10);
    play(T0 + 2000);
    expect(store.getState().wall.earned.first).toBe(T0 + 1000);
    expect(store.getState().wall.fresh).toEqual(["first"]);

    store.getState().resetRun();
    expect(store.getState().wall.earned.first).toBe(T0 + 1000);
    store.getState().wall.acknowledge();
    expect(store.getState().wall.fresh).toEqual([]);
  });

  test("forMs needs the condition unbroken; a break starts the timer over", () => {
    const { store, play } = start();
    store.getState().wallet.credit("gems", 5);
    play(T0 + 1000);
    play(T0 + 20_000);
    store.getState().wallet.debit("gems", 5);
    play(T0 + 21_000);
    expect(store.getState().wall.holding.patient).toBeUndefined();
    store.getState().wallet.credit("gems", 5);
    play(T0 + 22_000);
    play(T0 + 40_000);
    expect(store.getState().wall.earned.patient).toBeUndefined();
    play(T0 + 52_000);
    expect(store.getState().wall.earned.patient).toBe(T0 + 52_000);
  });

  test("over a catch-up the gap counts when the condition holds at the end", () => {
    const { store, play } = start();
    store.getState().wallet.credit("gems", 5);
    play(T0 + 1000);
    store.getState().catchUp(T0 + 60_000);
    expect(store.getState().wall.earned.patient).toBe(T0 + 60_000);
  });

  test("notify checks only its listeners; award earns the rest", () => {
    const { store, play } = start();
    play(T0 + 1000);
    expect(store.getState().wall.earned.bare).toBeUndefined(); // no gems, but nothing said "reset"
    expect(store.getState().wall.notify("other")).toEqual([]);
    expect(store.getState().wall.notify("reset")).toEqual(["bare"]);
    expect(store.getState().wall.notify("reset")).toEqual([]);

    expect(store.getState().wall.award("given")).toBe(true);
    expect(store.getState().wall.award("given")).toBe(false);
    expect(store.getState().wall.award("nobody")).toBe(false);
    expect(wall.board.rows(store.getState().wall.earned)[1]?.tiles[0]?.earned).toBe(true);
  });

  test("fresh is capped, oldest first out", () => {
    const capped = achievements({ key: "capped", list: LIST, columns: 3, keepFresh: 2 });
    const g = defineGame({
      id: "c",
      save: { key: "c.save", version: 1 },
      features: [wallet, capped],
      vocab: WORDS,
    });
    const { store } = freshStore(g);
    store.getState().capped.award("given");
    store.getState().capped.award("bare");
    store.getState().capped.award("late");
    expect(store.getState().capped.fresh).toEqual(["bare", "late"]);
    store.getState().capped.acknowledge(["bare"]);
    expect(store.getState().capped.fresh).toEqual(["late"]);
  });

  test("a save round trip keeps the earned record and the timers", () => {
    const { store, play } = start();
    store.getState().wallet.credit("gold", 10);
    store.getState().wallet.credit("gems", 5);
    play(T0 + 1000);
    const saved = store.getState().exportProfile();
    const { store: again } = freshStore(game, { save: saved });
    expect(again.getState().wall.earned).toEqual({ first: T0 + 1000 });
    expect(again.getState().wall.holding).toEqual({ patient: T0 + 1000 });
  });
});
