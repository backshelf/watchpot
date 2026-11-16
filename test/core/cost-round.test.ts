import { describe, expect, test } from "bun:test";
import {
  type CostCurve,
  costAt,
  costOfMany,
  currencies,
  D,
  defineGame,
  generators,
  maxAffordable,
  oldestReadable,
  vocab,
  withMigrations,
} from "watchpot/core";

/** A price ladder in whole numbers: 15, 17, 19, 22, 26… */
const FLOORED: CostCurve = { base: 15, growth: 1.15, round: "floor" };

const walked = (curve: CostCurve, bought: number, count: number) => {
  let total = D(0);
  for (let i = 0; i < count; i++) total = total.add(costAt(curve, bought + i));
  return total;
};

describe("a rounded geometric curve", () => {
  test("every price is a whole number, rounded the way asked", () => {
    for (let n = 0; n < 40; n++) {
      const plain = 15 * 1.15 ** n;
      expect(costAt(FLOORED, n).toNumber()).toBe(Math.floor(plain));
      expect(costAt({ base: 15, growth: 1.15, round: "ceil" }, n).toNumber()).toBe(Math.ceil(plain));
      expect(costAt({ base: 15, growth: 1.15, round: "nearest" }, n).toNumber()).toBe(Math.round(plain));
    }
  });

  test("the price of many is the whole-number prices added, exactly", () => {
    for (const [bought, count] of [
      [0, 1],
      [0, 25],
      [13, 60],
      [200, 10],
    ] as const)
      expect(costOfMany(FLOORED, bought, count).eq(walked(FLOORED, bought, count))).toBe(true);
  });

  test("past what a double holds exactly it joins the closed form", () => {
    // From 250 bought the prices are near 1e16 and beyond: 400 of them are still summed, not walked to the limit.
    const sum = costOfMany(FLOORED, 250, 400);
    expect(sum.div(walked({ base: 15, growth: 1.15 }, 250, 400)).toNumber()).toBeCloseTo(1, 9);
  });

  test("buys exactly what the balance covers", () => {
    for (const curve of [FLOORED, { base: 3, growth: 1.07, round: "ceil" as const, every: 5 }])
      for (const balance of [0, 14, 15, 16, 31, 32, 500, 98_765, 1e12])
        for (const bought of [0, 7]) {
          const n = maxAffordable(curve, bought, balance);
          expect(costOfMany(curve, bought, n).lte(balance)).toBe(true);
          expect(costOfMany(curve, bought, n + 1).gt(balance)).toBe(true);
        }
  });
});

describe("withMigrations", () => {
  const WORDS = vocab({ currencies: ["gold"], stats: [], rarities: ["plain"] } as const);
  const wallet = currencies({ key: "wallet", vocab: WORDS });
  const list = generators({
    key: "list",
    wallet,
    list: [{ id: "first", cost: FLOORED, pays: "gold", makes: "gold", rate: 1 }],
  });

  test("gives a factory-made feature its save steps and keeps what the factory put on it", () => {
    const step = (saved: unknown) => saved;
    const made = withMigrations(list, { 2: step });
    expect(made.migrations[2]).toBe(step);
    expect(made.rules).toBe(list.rules);
    expect(made.key).toBe("list");
    const later = withMigrations(made, { 3: step });
    expect(Object.keys(later.migrations)).toEqual(["2", "3"]);
  });

  test("the game reads back as far as the oldest step", () => {
    const game = defineGame({
      id: "steps",
      save: { key: "steps.save", version: 2 },
      features: [wallet, withMigrations(list, { 2: (saved) => saved })],
      vocab: WORDS,
    });
    expect(oldestReadable(game)).toBe(1);
  });
});
