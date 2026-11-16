import { describe, expect, test } from "bun:test";
import { checkRank, D, type GraphNode, rankCost, yieldUnits } from "watchpot/core";

describe("yields", () => {
  test("a fraction a time carries until it makes a whole unit", () => {
    let carry = 0;
    let units = 0;
    for (let i = 0; i < 5; i++) {
      const r = yieldUnits(0.2, 1, 1, carry);
      units += r.units;
      carry = r.carry;
    }
    expect(units).toBe(1);
    expect(carry).toBeCloseTo(0, 9);
  });

  test("the rate multiplies the yield", () => {
    expect(yieldUnits(0.5, 10, 1.25, 0)).toEqual({ units: 6, carry: 0.25 });
  });

  test("nothing negative or broken comes out", () => {
    expect(yieldUnits(-1, 10, 1, 0)).toEqual({ units: 0, carry: 0 });
    expect(yieldUnits(Number.NaN, 1, 1, 0)).toEqual({ units: 0, carry: 0 });
  });
});

describe("nodes", () => {
  const node: GraphNode<never> = {
    id: "n",
    name: "N",
    line: "",
    cost: [{ currency: "ore", amount: 20 }],
    costGrowth: 2,
    maxLevel: 3,
    requires: ["root"],
    effects: [],
  };

  test("each rank costs the growth again", () => {
    expect(rankCost(node, 0)[0]?.amount.toNumber()).toBe(20);
    expect(rankCost(node, 2)[0]?.amount.toNumber()).toBe(80);
  });

  test("a rank needs its requirements, the price and room under the max", () => {
    const balance = (n: number) => () => D(n);
    expect(checkRank(node, {}, balance(1000))).toEqual({ code: "requires", node: "root" });
    expect(checkRank(node, { root: 1 }, balance(10))?.code).toBe("cannot-afford");
    expect(checkRank(node, { root: 1 }, balance(20))).toBeNull();
    expect(checkRank(node, { root: 1, n: 3 }, balance(1000))).toEqual({ code: "maxed" });
  });
});
