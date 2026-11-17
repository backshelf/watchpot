import { describe, expect, test } from "bun:test";
import { D, defineKnobs, vocab } from "watchpot/core";
import { type DeskRun, defineDesk, fitTable, type SimSnapshot } from "watchpot/sim";

const TOY = vocab({
  currencies: ["gold", "gems"],
  stats: ["toy.speed"],
  rarities: ["common", "rare"],
} as const);
const knobs = defineKnobs({ growth: { value: 1.15, label: "Growth", group: "Prices" } });

interface Extra {
  bought: number;
}

const run = (): DeskRun<"gold" | "gems", Extra> => ({
  table: fitTable(),
  gates: [],
  step() {},
  look() {},
  playedMs: () => 0,
  sample: () => ({ currencies: { gold: D(1), gems: D(0) } }),
});

const base = { vocab: TOY, knobs, currency: "gold", source: ["src/**"], end: { hours: 10 }, run } as const;

describe("defineDesk", () => {
  test("fills defaults, freezes, does not call run", () => {
    let calls = 0;
    const d = defineDesk({
      ...base,
      run: () => {
        calls++;
        return run();
      },
    });
    expect(d.windowHours).toBe(2);
    expect(d.seeds).toEqual({ tuning: 1, full: 8 });
    expect(Object.isFrozen(d)).toBe(true);
    expect(calls).toBe(0);
    expect(defineDesk({ ...base, windowHours: 4, seeds: { full: 3 } }).seeds).toEqual({ tuning: 1, full: 3 });
  });

  test("throws", () => {
    // @ts-expect-error currency outside the vocab
    expect(() => defineDesk({ ...base, currency: "wood" })).toThrow(/currency/);
    expect(() => defineDesk({ ...base, windowHours: 0 })).toThrow(/windowHours/);
    expect(() => defineDesk({ ...base, end: { hours: 0 } })).toThrow(/end.hours/);
    expect(() => defineDesk({ ...base, seeds: { tuning: 0 } })).toThrow(/seeds.tuning/);
    expect(() => defineDesk({ ...base, seeds: { full: 1.5 } })).toThrow(/seeds.full/);
  });

  test("types: X is inferred from run, sample must hold every currency", () => {
    defineDesk({
      ...base,
      run: (o: { seed: number; from?: SimSnapshot<Extra> }) => {
        void o;
        return run();
      },
    });
    const d = defineDesk({ ...base, run });
    const from: SimSnapshot<Extra> | undefined = undefined as Parameters<typeof d.run>[0]["from"];
    void from;
    // @ts-expect-error X is Extra, so another shape does not fit
    const bad: SimSnapshot<{ other: 1 }> | undefined = undefined as Parameters<typeof d.run>[0]["from"];
    void bad;
    defineDesk({
      ...base,
      // @ts-expect-error sample misses gems
      run: () => ({ ...run(), sample: () => ({ currencies: { gold: D(1) } }) }),
    });
  });
});
