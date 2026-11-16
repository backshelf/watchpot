import { describe, expect, test } from "bun:test";
import { eventNodeRow, type GraphNode, rankCost, tree } from "watchpot/core";

const base = {
  id: "n",
  name: "N",
  line: "",
  cost: [{ currency: "gold", amount: 10 }],
  requires: [],
  effects: [],
};

describe("a node's cost growth", () => {
  test("a one-rank node may leave it out; a node of more ranks must state it", () => {
    const single: GraphNode<never> = { ...base, maxLevel: 1 };
    // @ts-expect-error more than one rank needs a costGrowth
    const many: GraphNode<never> = { ...base, maxLevel: 3 };
    // @ts-expect-error an unbounded node needs one too
    const endless: GraphNode<never> = { ...base, maxLevel: Number.POSITIVE_INFINITY };
    const stated: GraphNode<never> = { ...base, maxLevel: 3, costGrowth: 1 };
    expect(rankCost(single, 0)[0]?.amount.toNumber()).toBe(10);
    expect(rankCost(stated, 2)[0]?.amount.toNumber()).toBe(10);
    expect(many.id).toBe("n");
    expect(endless.id).toBe("n");
  });

  test("a tree throws, naming the node, when one slips past the types", () => {
    const loose = { ...base, id: "wide", maxLevel: 4 } as unknown as GraphNode<never>;
    expect(() => tree({ id: "t", nodes: [loose] })).toThrow(/"wide"/);
    expect(() => tree({ id: "t", nodes: [{ ...base, maxLevel: 1 }] })).not.toThrow();
  });

  test("an event row of several ranks needs a growth too", () => {
    const row = eventNodeRow("ore");
    expect(() => (row as unknown as (...a: unknown[]) => unknown)("x", "X", "", 1, 3, [], [])).toThrow(/"x"/);
    expect(row("y", "Y", "", 1, 1, [], []).id).toBe("y");
    expect(row("z", "Z", "", 1, 3, [], [], 2).costGrowth).toBe(2);
  });
});
