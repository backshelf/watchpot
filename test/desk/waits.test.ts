// The waits between upgrades: purchases read off the samples, dry spells, per-key and per-window stats.
import { describe, expect, test } from "bun:test";
import { D } from "../../src/core";
import type { DeskData, Sample } from "../../src/desk/page/series";
import {
  drySpells,
  perKey,
  perWindow,
  purchases,
  sampleStepHours,
  waitStats,
} from "../../src/desk/page/waits";

/** A sample at `hours` whose next costs are `{ key: cost }`. */
const at = (hours: number, next: Record<string, string> = {}): Sample => ({
  atMs: hours * 3_600_000,
  hours,
  currencies: {},
  next: Object.fromEntries(Object.entries(next).map(([k, c]) => [k, { currency: "coins", cost: D(c) }])),
});

describe("purchases", () => {
  test("a changed cost is a purchase; an unchanged one, even a fresh Decimal, is not", () => {
    expect(purchases([at(0, { a: "10" }), at(1, { a: "10" }), at(2, { a: "25" })])).toEqual([
      { hours: 2, key: "a" },
    ]);
  });
  test("a key appearing and one disappearing are purchases", () => {
    expect(
      purchases([at(0, { a: "1" }), at(1, { b: "1" })]).sort((x, y) => x.key.localeCompare(y.key)),
    ).toEqual([
      { hours: 1, key: "a" },
      { hours: 1, key: "b" },
    ]);
  });
});

const run = [
  at(0, { a: "1", b: "1" }),
  at(1, { a: "1", b: "1" }),
  at(2, { a: "2", b: "1" }),
  at(3, { a: "2", b: "5" }),
  at(4, { a: "2", b: "5" }),
];

describe("drySpells", () => {
  test("longest first, with who ended each, and the trailing gap", () => {
    const s = drySpells([...run, at(10, { a: "2", b: "5" })], 12);
    expect(s[0]).toEqual({ from: 3, to: 12, hours: 9, endedBy: [] });
    expect(s.map((x) => x.hours)).toEqual([9, 2, 1]);
    expect(s[1]).toEqual({ from: 0, to: 2, hours: 2, endedBy: ["a"] });
    expect(s[2]?.endedBy).toEqual(["b"]);
  });
  test("sample step is the median gap", () => {
    expect(sampleStepHours(run)).toBe(1);
    expect(sampleStepHours([at(0)])).toBe(0);
  });
});

describe("perKey", () => {
  test("sorted by longest wait, undefined last", () => {
    const rows = perKey([
      at(0, { a: "1", b: "1", c: "1" }),
      at(1, { a: "2", b: "2", c: "2" }),
      at(2, { a: "2", b: "2", c: "3" }),
      at(5, { a: "3", b: "2", c: "3" }),
      at(6, { a: "3", b: "3", c: "3" }),
    ]);
    expect(rows.map((r) => r.key)).toEqual(["b", "a", "c"]);
    expect(rows[1]).toEqual({ key: "a", bought: 2, firstHours: 1, medianWait: 4, longestWait: 4 });
  });
  test("a key bought once has no wait and sorts last", () => {
    const rows = perKey([at(0, { a: "1", d: "1" }), at(1, { a: "2", d: "2" }), at(3, { a: "3", d: "2" })]);
    expect(rows.map((r) => r.key)).toEqual(["a", "d"]);
    expect(rows[1]).toEqual({
      key: "d",
      bought: 1,
      firstHours: 1,
      medianWait: undefined,
      longestWait: undefined,
    });
  });
});

describe("perWindow", () => {
  test("a spell belongs to the window its end falls in", () => {
    const w = perWindow(run, 2, 4);
    expect(w).toHaveLength(2);
    expect(w[0]).toEqual({ from: 0, to: 2, longest: 0, median: 0, buys: 0 });
    expect(w[1]).toEqual({ from: 2, to: 4, longest: 2, median: 1.5, buys: 2 });
  });
});

describe("waitStats", () => {
  test("picks the seed with the median longest dry spell", () => {
    const seed = (gap: number) => ({
      samples: [at(0, { a: "1" }), at(gap, { a: "2" })],
      gates: [],
      gatesToMs: 0,
    });
    const data: DeskData = {
      seeds: new Map([
        [1, seed(5)],
        [2, seed(1)],
        [3, seed(3)],
      ]),
    };
    const stats = waitStats(data, 2, 5);
    expect(stats?.seed).toBe(2);
    expect(stats?.spells.length).toBeLessThanOrEqual(5);
    expect(waitStats({ seeds: new Map() }, 2, 6)).toBeUndefined();
  });
});
