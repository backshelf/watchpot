import { describe, expect, test } from "bun:test";
import {
  type BoardCells,
  type BoardPiece,
  board,
  defineBoard,
  defineGame,
  feature,
  fillBoard,
  searchBoard,
} from "watchpot/core";
import { freshStore } from "watchpot/test";

type Fx = { stat: string; mult: number };

/** A plain piece worth 2; one that doubles per same piece beside it; one that only pays on an edge. */
const PIECES: readonly BoardPiece<Fx>[] = [
  { id: "plain", effects: () => [{ stat: "out", mult: 2 }] },
  {
    id: "pair",
    tags: ["social"],
    effects: (v) => [{ stat: "out", mult: 1 + v.beside.filter((p) => p.id === "pair").length }],
  },
  { id: "rim", limit: 1, effects: (v) => (v.edge ? [{ stat: "out", mult: v.corner ? 5 : 3 }] : []) },
];
const B = board<Fx>({ id: "b", width: 3, height: 3, pieces: PIECES });
const product = (cells: BoardCells, limits?: Parameters<typeof B.contributions>[1]) =>
  B.contributions(cells, limits).reduce((n, c) => n * c.effect.mult, 1);

describe("board", () => {
  test("a placement says why it is refused", () => {
    const cells: BoardCells = {};
    expect(B.place(cells, 4, "plain")).toBeNull();
    expect(B.place(cells, 4, "pair")).toBe("occupied");
    expect(B.place(cells, 0, "nope")).toBe("unknown-piece");
    expect(B.place(cells, 9, "plain")).toBe("closed");
    expect(B.place(cells, 0, "plain", { held: () => 1 })).toBe("none-left");
    expect(B.place(cells, 0, "rim")).toBeNull();
    expect(B.place(cells, 1, "rim")).toBe("limit");
    expect(B.place(cells, 8, "plain", { open: (x, y) => x < 2 && y < 2 })).toBe("closed");
  });

  test("a piece reads its neighbours, its edge and the counts", () => {
    // pair pair .
    // .    rim  .   (the middle is not an edge)
    const cells: BoardCells = { 0: "pair", 1: "pair", 4: "rim" };
    expect(product(cells)).toBe(4);
    const [first] = B.placed(cells);
    expect(first?.view.count("social")).toBe(2);
    expect(first?.view.at(1, 0)?.id).toBe("pair");
    expect(first?.view.at(-1, 0)).toBeNull();
    expect(first?.view.corner).toBe(true);
    expect(product({ 0: "rim" })).toBe(5);
    expect(product({ 1: "rim" })).toBe(3);
    // With only the left two columns open, the middle column is the edge.
    expect(product({ 4: "rim" }, { open: (x) => x < 2 })).toBe(3);
  });

  test("moving swaps, and lifting empties", () => {
    const cells: BoardCells = { 0: "plain", 1: "pair" };
    expect(B.move(cells, 0, 1)).toBeNull();
    expect(cells).toEqual({ 0: "pair", 1: "plain" });
    expect(B.move(cells, 0, 5)).toBeNull();
    expect(cells).toEqual({ 1: "plain", 5: "pair" });
    expect(B.move(cells, 0, 2)).toBe("empty");
    expect(B.lift(cells, 5)).toBe("pair");
    expect(B.lift(cells, 5)).toBeNull();
  });

  test("settling takes up what the limits no longer allow", () => {
    const cells: BoardCells = { 0: "plain", 1: "plain", 8: "pair" };
    expect(B.settle(cells, { held: (p) => (p === "plain" ? 1 : 9), open: (x, y) => x < 2 && y < 2 })).toEqual(
      {
        0: "plain",
      },
    );
  });

  test("a greedy fill respects what is held and beats laying the pieces out in reading order", () => {
    const held = (p: string) => (p === "pair" ? 4 : p === "plain" ? 2 : 1);
    const cells = fillBoard(B, { held, score: (c) => c.reduce((n, x) => n * x.effect.mult, 1) });
    expect(B.used(cells, "pair")).toBe(4);
    expect(B.used(cells, "plain")).toBe(2);
    expect(B.used(cells, "rim")).toBe(1);
    // In reading order: plain plain pair / pair pair pair / rim. The pairs make 1 x 2 x 3 x 2, the rim a corner's 5.
    const naive = product({ 0: "plain", 1: "plain", 2: "pair", 3: "pair", 4: "pair", 5: "pair", 6: "rim" });
    expect(product(cells)).toBeGreaterThan(naive);
  });

  test("a search keeps to what is held, leaves a piece that only costs in hand, and never ends below its start", () => {
    const drag: BoardPiece<Fx> = { id: "drag", effects: () => [{ stat: "out", mult: 0.5 }] };
    const D = board<Fx>({ id: "d", width: 3, height: 3, pieces: [...PIECES, drag] });
    const held = (p: string) => (p === "pair" ? 4 : p === "plain" ? 2 : p === "drag" ? 3 : 1);
    const score = (c: readonly { effect: Fx }[]) => Math.log(c.reduce((n, x) => n * x.effect.mult, 1));
    const start: BoardCells = { 0: "drag", 4: "drag", 8: "pair" };
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const search = searchBoard(D, { held, score, start, trials: 4000, random });
    while (search.step(500)) {}
    const cells = search.best();
    expect(search.progress()).toBe(1);
    expect(D.used(cells, "drag")).toBe(0);
    for (const p of ["pair", "plain", "rim"]) expect(D.used(cells, p)).toBeLessThanOrEqual(held(p));
    expect(search.bestScore()).toBeGreaterThanOrEqual(
      score(D.contributions(fillBoard(D, { held, score }), { held })),
    );
    expect(search.bestScore()).toBeCloseTo(score(D.contributions(cells, { held })));
  });
});

describe("boardFeature", () => {
  const bag = feature({ key: "bag", initial: () => ({ pairs: 1, size: 2 }) });
  const sheet = defineBoard({
    key: "sheet",
    reach: [bag],
    width: 3,
    height: 3,
    pieces: PIECES,
    held: (s, piece) => (piece === "pair" ? s.bag.pairs : 9),
    open: (s, x, y) => x < s.bag.size && y < s.bag.size,
  });
  const game = defineGame({ id: "boards", save: { key: "boards.save", version: 1 }, features: [bag, sheet] });

  test("what is held and what is open are read off the game", () => {
    const { store } = freshStore(game);
    const act = () => store.getState().sheet;
    expect(act().place(0, "pair")).toBeNull();
    expect(act().place(1, "pair")).toBe("none-left");
    expect(act().place(8, "plain")).toBe("closed");
    store.setState((s) => {
      s.bag.pairs = 2;
      s.bag.size = 3;
    });
    expect(act().place(1, "pair")).toBeNull();
    expect(act().place(8, "plain")).toBeNull();
    expect(sheet.select.contributions(store.getState()).map((c) => c.effect.mult)).toEqual([2, 2, 2]);
    // The board shrinks again: the piece on the closed cell stops counting but stays where it was put.
    store.setState((s) => {
      s.bag.size = 2;
    });
    expect(sheet.select.contributions(store.getState())).toHaveLength(2);
    expect(store.getState().sheet.cells[8]).toBe("plain");
    act().lay({ 0: "plain", 4: "rim", 8: "rim" });
    expect(store.getState().sheet.cells).toEqual({ 0: "plain", 4: "rim" });
  });

  test("def carries the rules, select the state-reading questions, draft nothing", () => {
    expect(sheet.def.board.width).toBe(3);
    expect(sheet.draft).toEqual({});
    const { store } = freshStore(game);
    expect(sheet.select.limits(store.getState()).held?.("pair")).toBe(1);
  });

  test("a callback reads a reached feature; one it does not reach is a type error", () => {
    const other = feature({ key: "other", initial: () => ({ m: 0 }) });
    const peek = defineBoard({
      key: "peek",
      reach: [bag],
      width: 1,
      height: 1,
      pieces: PIECES,
      held: (s) => s.bag.pairs,
      // @ts-expect-error `other` is not in the reach
      open: (s) => s.other.m === 0,
    });
    expect(peek.key).toBe("peek");
    expect(other.key).toBe("other");
  });
});
