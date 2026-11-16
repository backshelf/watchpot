import { describe, expect, test } from "bun:test";
import {
  applySoftcap,
  busOf,
  checkRank,
  D,
  explainStat,
  type GraphNode,
  rankCost,
  statValue,
  yieldUnits,
} from "watchpot/core";

describe("the stat bus", () => {
  const bus = busOf([
    { source: "a", effect: { stat: "x", add: 2 } },
    { source: "b", effect: { stat: "x", mult: 1.5 } },
    { source: "c", effect: { stat: "x", add: 3, mult: 2 } },
    { source: "d", effect: { stat: "y", mult: 2 } },
  ]);

  test("adds to the base, then multiplies", () => {
    expect(statValue(bus, "x", 5)).toBe((5 + 2 + 3) * 1.5 * 2);
    expect(statValue(bus, "y", 1)).toBe(2);
  });

  test("a stat nothing touches is its base", () => {
    expect(statValue(bus, "z", 7)).toBe(7);
    expect(statValue(bus, "z")).toBe(0);
  });

  test("the hardcap holds after everything else", () => {
    expect(statValue(bus, "x", 5, { hardcap: 10 })).toBe(10);
  });

  test("the softcap is The Modding Tree's: value^p x start^(1-p) past the start", () => {
    const cap = { start: 100, power: 0.5, label: "patch" };
    expect(applySoftcap(50, cap)).toBe(50);
    expect(applySoftcap(400, cap)).toBeCloseTo(200);
    // Monotonic and never above the value, even just past the start.
    expect(applySoftcap(100.25, cap)).toBeLessThanOrEqual(100.25);
    expect(applySoftcap(100.25, cap)).toBeGreaterThan(100);
  });

  test("explain lists what feeds a stat and names the softcap while it bites", () => {
    const cap = { start: 10, power: 0.5, label: "Balance patch 1.0.1" };
    const out = explainStat(bus, "x", 5, { softcap: cap });
    expect(out.sources.map((c) => c.source)).toEqual(["a", "b", "c"]);
    expect(out.raw).toBe(30);
    expect(out.value).toBeCloseTo(Math.sqrt(30 * 10));
    expect(out.softcapped).toBe("Balance patch 1.0.1");
    expect(explainStat(bus, "y", 1, { softcap: cap }).softcapped).toBeNull();
  });
});

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
