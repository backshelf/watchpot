import { describe, expect, test } from "bun:test";
import {
  type CostCurve,
  costAt,
  costOfMany,
  D,
  maxAffordable,
  nextThreshold,
  reached,
  stepsOf,
  untilStep,
  WALK_LIMIT,
} from "watchpot/core";

const GEO: CostCurve = { base: 10, growth: 1.15 };
const WALKED: CostCurve = (bought) => 10 + bought * 5;
/** Ten at one price, then ten at a thousand times it. */
const SETS: CostCurve = { base: 10, growth: 1000, every: 10 };

/** The sum the closed form must equal, one price at a time. */
const walked = (curve: CostCurve, bought: number, count: number) => {
  let total = D(0);
  for (let i = 0; i < count; i++) total = total.add(costAt(curve, bought + i));
  return total;
};

describe("costOfMany", () => {
  test("the geometric closed form equals the prices added one by one", () => {
    for (const [bought, count] of [
      [0, 1],
      [0, 10],
      [7, 25],
      [100, 3],
    ] as const) {
      const closed = costOfMany(GEO, bought, count);
      const summed = walked(GEO, bought, count);
      expect(closed.div(summed).toNumber()).toBeCloseTo(1, 9);
    }
  });

  test("a growth of 1 is the price times the count; nothing costs nothing", () => {
    expect(costOfMany({ base: 4, growth: 1 }, 50, 6).toNumber()).toBe(24);
    expect(costOfMany(GEO, 3, 0).toNumber()).toBe(0);
  });

  test("with every, a set is bought at one price and the price steps between sets", () => {
    expect(costAt(SETS, 9).toNumber()).toBe(10);
    expect(costAt(SETS, 10).toNumber()).toBe(10_000);
    for (const [bought, count] of [
      [0, 10],
      [4, 6],
      [4, 7],
      [7, 40],
      [10, 25],
    ] as const)
      expect(
        costOfMany(SETS, bought, count)
          .div(walked(SETS, bought, count))
          .toNumber(),
      ).toBeCloseTo(1, 9);
  });

  test("a function curve is summed", () => {
    expect(costOfMany(WALKED, 2, 3).toNumber()).toBe(20 + 25 + 30);
  });
});

describe("maxAffordable", () => {
  test("buys exactly what the balance covers: the next one would not fit", () => {
    for (const curve of [GEO, WALKED, SETS, { base: 1, growth: 2 }, { base: 3, growth: 1 }]) {
      for (const balance of [0, 9, 10, 11, 60, 61, 250, 12_345, 1e6, 123_456_789]) {
        const n = maxAffordable(curve, 4, balance);
        expect(costOfMany(curve, 4, n).lte(balance)).toBe(true);
        expect(costOfMany(curve, 4, n + 1).gt(balance)).toBe(true);
      }
    }
  });

  test("holds at numbers past a double", () => {
    const curve = { base: "1e400", growth: 10 };
    expect(maxAffordable(curve, 0, "1e399")).toBe(0);
    // 1e400 + 1e401 + 1e402 fits in 2e402; the fourth (1e403) does not.
    expect(maxAffordable(curve, 0, "2e402")).toBe(3);
  });

  test("respects the limit, and walks a function curve no further than WALK_LIMIT", () => {
    expect(maxAffordable(GEO, 0, 1e12, 10)).toBe(10);
    expect(maxAffordable(GEO, 0, 1e12, 0)).toBe(0);
    expect(maxAffordable(() => 1, 0, 1e9)).toBe(WALK_LIMIT);
  });
});

describe("steps and thresholds", () => {
  test("stepsOf counts whole steps; untilStep is what completes the current one", () => {
    expect([0, 9, 10, 25].map((n) => stepsOf(n, 10))).toEqual([0, 0, 1, 2]);
    expect([0, 3, 9, 10, 17].map((n) => untilStep(n, 10))).toEqual([10, 7, 1, 10, 3]);
  });

  test("reached lists what each passed threshold gives; nextThreshold is the first ahead", () => {
    const marks = [
      { at: 25, gives: "double" },
      { at: 50, gives: "triple" },
    ];
    expect(reached(marks, 24)).toEqual([]);
    expect(reached(marks, 50)).toEqual(["double", "triple"]);
    expect(nextThreshold(marks, 25)?.at).toBe(50);
    expect(nextThreshold(marks, 50)).toBeNull();
  });
});
