import { describe, expect, test } from "bun:test";
import { type CostCurve, costAt, costOfMany, D, type GeometricCost, maxAffordable } from "watchpot/core";

const CURVES: Record<string, GeometricCost> = {
  fractional: { base: 15, growth: 1.15 },
  halves: { base: 10, growth: 1.5 },
  whole: { base: 7, growth: 2 },
  flat: { base: 9, growth: 1 },
  sets: { base: 3, growth: 1.07, every: 5 },
  fractionalBase: { base: 2.5, growth: 1.3 },
  explicit: { base: 15, growth: 1.15, round: "ceil" },
};

const walked = (curve: CostCurve, bought: number, count: number) => {
  let total = D(0);
  for (let i = 0; i < count; i++) total = total.add(costAt(curve, bought + i));
  return total;
};

describe("the default rounding of a cost curve", () => {
  test("a curve that leaves out `round` rounds every price up, whatever its growth", () => {
    for (const [name, curve] of Object.entries(CURVES))
      for (let n = 0; n < 30; n++) {
        const price = costAt(curve, n);
        expect(price.eq(price.ceil()), `${name} #${n} is whole`).toBe(true);
        const raw = costAt({ ...curve, round: "none" }, n).toNumber();
        expect(price.toNumber(), `${name} #${n} is not below its raw price`).toBeGreaterThanOrEqual(
          raw * (1 - 1e-9),
        );
        expect(price.toNumber(), `${name} #${n} is the next whole number up`).toBeLessThan(raw + 1 + 1e-9);
      }
  });

  test('`round: "none"` keeps the fractions', () => {
    const raw: CostCurve = { base: 10, growth: 1.5, round: "none" };
    expect(costAt(raw, 2).toNumber()).toBeCloseTo(22.5);
    expect(costOfMany(raw, 0, 3).toNumber()).toBeCloseTo(47.5);
  });

  test("buying many costs what buying one at a time costs", () => {
    for (const [name, curve] of Object.entries(CURVES))
      for (const bought of [0, 3, 11])
        for (const count of [1, 2, 9, 40])
          expect(costOfMany(curve, bought, count).toNumber(), `${name} ${bought}+${count}`).toBe(
            walked(curve, bought, count).toNumber(),
          );
  });

  test("the most affordable is what the wallet pays for, and one more is not", () => {
    for (const [name, curve] of Object.entries(CURVES))
      for (const balance of [0, 1, 9, 10, 44, 1000, 123_456])
        for (const bought of [0, 4]) {
          const n = maxAffordable(curve, bought, balance);
          expect(costOfMany(curve, bought, n).lte(balance), `${name} pays for ${n}`).toBe(true);
          expect(costOfMany(curve, bought, n + 1).gt(balance), `${name} stops at ${n}`).toBe(true);
        }
  });

  test("a curve of whole numbers is summed in closed form, however many are bought", () => {
    expect(costOfMany({ base: 9, growth: 1 }, 0, 1e6).toNumber()).toBe(9e6);
    expect(maxAffordable({ base: 9, growth: 1 }, 0, 9e6)).toBe(1e6);
  });
});
