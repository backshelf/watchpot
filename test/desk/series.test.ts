// The sim desk page's data shaping: windows in, series, medians, table rows and gates out.
import { describe, expect, test } from "bun:test";
import { D } from "../../src/core";
import {
  addWindow,
  currencySeries,
  type DeskData,
  emptyData,
  gapPolygons,
  gateRows,
  hourlyRows,
  hoursMinutes,
  log10,
  median,
  medianCurrency,
  medianNext,
  medianSeries,
  nextKeys,
  nextSeries,
  type Pt,
  short,
  valueAt,
  yAxis,
} from "../../src/desk/page/series";
import type { ToClient } from "../../src/desk/protocol";

const H = 3_600_000;
type Win = Extract<ToClient, { type: "window" }>;

/** A window of one seed: points are `[hours, coins, next?]`. */
function win(
  seed: number,
  from: number,
  to: number,
  points: [number, string, { cost: string; currency?: string }?][],
  gates: Win["gates"] = [],
): Win {
  return {
    type: "window",
    id: 1,
    seed,
    fromMs: from * H,
    toMs: to * H,
    gates,
    points: points.map(([h, coins, next]) => ({
      atMs: h * H,
      currencies: { coins, gems: "1" },
      ...(next ? { next: { mine: { currency: next.currency ?? "coins", cost: next.cost } } } : {}),
    })),
  };
}

const feed = (...windows: Win[]): DeskData => windows.reduce(addWindow, emptyData());
const hoursOf = (pts: readonly Pt[]) => pts.map((p) => p[0]);
const valuesOf = (pts: readonly Pt[]) => pts.map((p) => p[1].toString());

describe("merging windows", () => {
  test("windows arriving out of order come out in time order", () => {
    const data = feed(
      win(1, 2, 4, [
        [2, "20"],
        [3, "30"],
        [4, "40"],
      ]),
      win(1, 0, 2, [
        [0, "0"],
        [1, "10"],
        [2, "20"],
      ]),
    );
    const pts = currencySeries(data, 1, "coins");
    expect(hoursOf(pts)).toEqual([0, 1, 2, 3, 4]);
    expect(valuesOf(pts)).toEqual(["0", "10", "20", "30", "40"]);
  });

  test("a later window replaces what it overlaps and leaves the rest", () => {
    const data = feed(
      win(1, 0, 2, [
        [0, "0"],
        [1, "10"],
        [2, "20"],
      ]),
      win(1, 4, 6, [[5, "50"]]),
      win(1, 1, 4, [
        [1, "11"],
        [2, "22"],
        [3, "33"],
      ]),
    );
    const pts = currencySeries(data, 1, "coins");
    expect(hoursOf(pts)).toEqual([0, 1, 2, 3, 5]);
    expect(valuesOf(pts)).toEqual(["0", "11", "22", "33", "50"]);
  });

  test("seeds are kept apart, and the input is not mutated", () => {
    const before = feed(win(1, 0, 1, [[0, "1"]]));
    const after = addWindow(before, win(2, 0, 1, [[0, "2"]]));
    expect([...before.seeds.keys()]).toEqual([1]);
    expect([...after.seeds.keys()]).toEqual([1, 2]);
  });

  test("a decimal parses from its string, past a float", () => {
    const pts = currencySeries(feed(win(1, 0, 1, [[0, "1.5e400"]])), 1, "coins");
    expect(pts[0]?.[1].gt(D("1e399"))).toBe(true);
  });
});

describe("medians", () => {
  test("of three seeds at one hour is the middle one", () => {
    const data = feed(win(1, 0, 1, [[1, "10"]]), win(2, 0, 1, [[1, "1000"]]), win(3, 0, 1, [[1, "100"]]));
    expect(valuesOf(medianCurrency(data, "coins"))).toEqual(["100"]);
  });

  test("seeds sampled at different hours each count their last point at or before it", () => {
    const data = feed(
      win(1, 0, 4, [
        [0, "1"],
        [2, "100"],
        [4, "10000"],
      ]),
      win(2, 0, 4, [
        [1, "10"],
        [3, "1000"],
      ]),
      win(3, 0, 4, [
        [0, "5"],
        [4, "50000"],
      ]),
    );
    const med = medianCurrency(data, "coins");
    expect(hoursOf(med)).toEqual([0, 1, 2, 3, 4]);
    // h0: seeds 1 and 3 only (1, 5): their mean. h1: 1, 10, 5 -> 5. h2: 100, 10, 5 -> 10. h3: 100, 1000, 5 -> 100.
    // h4: 10000, 1000, 50000 -> 10000.
    expect(valuesOf(med)).toEqual(["3", "5", "10", "100", "10000"]);
  });

  test("an even count averages the two in the middle; one series comes back as it is", () => {
    expect(median([D(1), D(9)]).toString()).toBe("5");
    const only: Pt[] = [[1, D(7)]];
    expect(medianSeries([only, []])).toEqual(only);
  });

  test("a next-cost median keeps the wallet and the price on the same hours", () => {
    const data = feed(
      win(1, 0, 1, [[1, "10", { cost: "100" }]]),
      win(2, 0, 1, [[1, "30", { cost: "300" }]]),
      win(3, 0, 1, [[1, "20", { cost: "200" }]]),
    );
    const [p] = medianNext(data, "mine");
    expect([p?.held.toString(), p?.cost.toString()]).toEqual(["20", "200"]);
  });
});

describe("next-cost series", () => {
  test("pair the balance of the currency that pays with the price", () => {
    const data = feed(
      win(1, 0, 2, [
        [0, "5", { cost: "10" }],
        [1, "12", { cost: "10" }],
        [2, "3", { cost: "40", currency: "gems" }],
      ]),
    );
    expect(nextKeys(data)).toEqual(["mine"]);
    const pts = nextSeries(data, 1, "mine");
    expect(pts.map((p) => [p.hours, p.held.toString(), p.cost.toString()])).toEqual([
      [0, "5", "10"],
      [1, "12", "10"],
      [2, "1", "40"],
    ]);
  });

  test("a sample without the buyable adds no point", () => {
    const data = feed(
      win(1, 0, 2, [
        [0, "5"],
        [1, "6", { cost: "9" }],
      ]),
    );
    expect(nextSeries(data, 1, "mine")).toHaveLength(1);
  });
});

describe("the hourly table", () => {
  test("has one row per whole hour that has data, from the last point at or before it", () => {
    const pts: Pt[] = [
      [0.5, D(5)],
      [1.2, D(12)],
      [2.9, D(29)],
    ];
    const rows = hourlyRows([{ id: "a", label: "coins", pts }]);
    expect(rows.map((r) => r.hour)).toEqual([1, 2]);
    expect(rows.map((r) => r.cells[0]?.toString())).toEqual(["5", "12"]);
  });

  test("starts at the first hour any column has a value; the others are empty there", () => {
    const a: Pt[] = [
      [0, D(1)],
      [3, D(3)],
    ];
    const b: Pt[] = [[2, D(2)]];
    const rows = hourlyRows([
      { id: "a", label: "a", pts: a },
      { id: "b", label: "b", pts: b },
    ]);
    expect(rows.map((r) => r.hour)).toEqual([0, 1, 2, 3]);
    expect(rows.map((r) => r.cells[1]?.toString())).toEqual([undefined, undefined, "2", "2"]);
  });

  test("is empty with no data", () => {
    expect(hourlyRows([])).toEqual([]);
    expect(hourlyRows([{ id: "a", label: "a", pts: [] }])).toEqual([]);
  });
});

describe("gates", () => {
  const gates = (opened: number | undefined, pinned = false): Win["gates"] => [
    {
      key: "g1",
      atMs: 1 * H,
      ...(opened === undefined ? {} : { openedMs: opened * H }),
      ...(pinned ? { pinned: { atMs: true as const } } : {}),
    },
  ];

  test("drift is opened minus planned: late is positive, early negative", () => {
    const late = gateRows(feed(win(1, 0, 3, [[0, "1"]], gates(1.5))));
    expect(late[0]?.driftH).toBeCloseTo(0.5);
    const early = gateRows(feed(win(1, 0, 3, [[0, "1"]], gates(0.75))));
    expect(early[0]?.driftH).toBeCloseTo(-0.25);
    expect(hoursMinutes(0.5, true)).toBe("+0:30");
    expect(hoursMinutes(-1.0833, true)).toBe("-1:05");
    expect(hoursMinutes(0, true)).toBe("0:00");
  });

  test("an unopened gate has no opened hour or drift; the pinned flag comes through", () => {
    const [g] = gateRows(feed(win(1, 0, 1, [[0, "1"]], gates(undefined, true))));
    expect(g).toMatchObject({ key: "g1", plannedH: 1, opened: 0, pinned: true });
    expect(g?.openedH).toBeUndefined();
    expect(g?.driftH).toBeUndefined();
  });

  test("the gates of the furthest window stand, whatever order windows came in", () => {
    const data = feed(win(1, 2, 4, [[3, "1"]], gates(1.5)), win(1, 0, 2, [[1, "1"]], gates(undefined)));
    expect(gateRows(data)[0]?.openedH).toBe(1.5);
  });

  test("with several seeds the opened hour is the median of those that opened it", () => {
    const data = feed(
      win(1, 0, 3, [[0, "1"]], gates(1)),
      win(2, 0, 3, [[0, "1"]], gates(2)),
      win(3, 0, 3, [[0, "1"]], gates(undefined)),
    );
    const [g] = gateRows(data);
    expect(g).toMatchObject({ openedH: 1.5, opened: 2, seeds: 3 });
  });
});

describe("axes and scales", () => {
  test("log10 of zero is minus infinity, the axis floor; of 1e45 it is 45", () => {
    expect(log10(D(0))).toBe(Number.NEGATIVE_INFINITY);
    expect(log10(D("1e45"))).toBeCloseTo(45);
  });

  test("short form", () => {
    expect(short(D("1.2345e45"))).toBe("1.23e45");
    expect(short(D(12.345))).toBe("12.35");
    expect(short(D(0.005))).toBe("5.00e-3");
    expect(short(D(12345))).toBe("1.23e4");
    expect(short(D(0))).toBe("0");
  });

  test("a log axis takes whole powers; zeros do not move it", () => {
    const a = yAxis([Number.NEGATIVE_INFINITY, 0.4, 7.2], true);
    expect([a.lo, a.hi]).toEqual([0, 8]);
    expect(a.ticks[0]).toBe(0);
  });

  test("a linear axis starts at zero and ends on a tick", () => {
    const a = yAxis([3, 87], false);
    expect(a.lo).toBe(0);
    expect(a.hi).toBeGreaterThanOrEqual(87);
    expect(a.ticks.at(-1)).toBe(a.hi);
  });

  test("valueAt is the last point at or before the hour", () => {
    const pts: Pt[] = [
      [1, D(1)],
      [3, D(3)],
    ];
    expect(valueAt(pts, 0.5)).toBeUndefined();
    expect(valueAt(pts, 2)?.toString()).toBe("1");
    expect(valueAt(pts, 3)?.toString()).toBe("3");
  });
});

describe("the hatched gap", () => {
  test("is one polygon where the price stays above the balance", () => {
    const polys = gapPolygons([
      { x: 0, high: 5, low: 2 },
      { x: 1, high: 6, low: 3 },
    ]);
    expect(polys).toEqual([
      [
        [0, 5],
        [1, 6],
        [1, 3],
        [0, 2],
      ],
    ]);
  });

  test("splits where the lines cross", () => {
    const polys = gapPolygons([
      { x: 0, high: 4, low: 2 },
      { x: 2, high: 2, low: 4 },
      { x: 4, high: 6, low: 4 },
    ]);
    expect(polys).toHaveLength(2);
    expect(polys[0]?.some(([x, y]) => x === 1 && y === 3)).toBe(true);
    expect(polys[1]?.some(([x, y]) => x === 3 && y === 4)).toBe(true);
  });

  test("is empty when the balance always covers the price", () => {
    expect(
      gapPolygons([
        { x: 0, high: 1, low: 2 },
        { x: 1, high: 1, low: 3 },
      ]),
    ).toEqual([]);
  });
});
