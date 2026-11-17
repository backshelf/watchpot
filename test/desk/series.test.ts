// The sim desk page's data shaping: windows in, series, medians, table rows and gates out.
import { describe, expect, test } from "bun:test";
import { D } from "../../src/core";
import {
  addWindow,
  beforeAt,
  clock,
  compact,
  currencySeries,
  type DeskData,
  downsample,
  emptyData,
  figure,
  gapPolygons,
  gateRows,
  hourlyRows,
  hoursMinutes,
  knobText,
  log10,
  median,
  medianCurrency,
  medianNext,
  medianSeries,
  nextKeys,
  nextSeries,
  orders,
  type Pt,
  parseClock,
  parseHours,
  parsePrice,
  percentChange,
  short,
  signedOrders,
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

  test("an axis over every seed of every series (far past the call stack's argument limit) still works", () => {
    const ys = Array.from({ length: 1_000_000 }, (_, i) => (i % 9) + 0.5);
    const a = yAxis(ys, true);
    expect(a.lo).toBe(0);
    expect(a.hi).toBeGreaterThanOrEqual(8);
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

describe("comparing with the run before", () => {
  test("the difference is in orders of magnitude, signed, and only where both are above zero", () => {
    expect(orders(D(1000), D(100))).toBeCloseTo(1);
    expect(signedOrders(orders(D(100), D(1000)))).toBe("-1.00");
    expect(signedOrders(orders(D("2.6"), D(1)))).toBe("+0.41");
    expect(signedOrders(orders(D(5), D(5)))).toBe("+0.00");
    expect(signedOrders(orders(D(0), D(5)))).toBe("–");
    expect(signedOrders(orders(D(5), undefined))).toBe("–");
  });

  test("the run before has no value past where it was played", () => {
    const pts: Pt[] = [
      [0, D(1)],
      [2, D(9)],
    ];
    expect(beforeAt(pts, 1)?.toString()).toBe("1");
    expect(beforeAt(pts, 2)?.toString()).toBe("9");
    expect(beforeAt(pts, 2.5)).toBeUndefined();
    expect(beforeAt(undefined, 1)).toBeUndefined();
  });
});

describe("knob values", () => {
  test("a time reads as a clock, a multiple as ×, a percentage with its sign", () => {
    expect(clock(90_000)).toBe("1:30");
    expect(clock(3_600_000)).toBe("1:00:00");
    expect(clock(250)).toBe("0:00.25");
    expect(knobText(90_000, "ms")).toBe("1:30");
    expect(knobText(1.15, "x")).toBe("×1.15");
    expect(knobText(0.15, "%")).toBe("15%");
    expect(knobText(0.5, "%")).toBe("50%");
    expect(knobText(0.1 + 0.2, undefined)).toBe("0.3");
  });

  test("a pinned hour is h:mm or plain hours; a pinned price is a figure Decimal reads", () => {
    expect(parseHours("1:30")).toBe(5_400_000);
    expect(parseHours("2")).toBe(7_200_000);
    expect(parseHours("1.5")).toBe(5_400_000);
    expect(parseHours("1:75")).toBeUndefined();
    expect(parseHours("soon")).toBeUndefined();
    expect(parsePrice(" 250 ")).toBe("250");
    expect(parsePrice("1.5e12")).toBe("1.5e12");
    expect(parsePrice("lots")).toBeUndefined();
    expect(parsePrice("")).toBeUndefined();
  });
});

describe("downsampling to pixel columns", () => {
  // A purchase dip every tenth of an hour on a rising line: thousands of points, a sawtooth when drawn whole.
  const saw: [number, number][] = Array.from({ length: 4000 }, (_, i) => {
    const x = (i / 4000) * 24;
    return [x, x * 10 - (i % 10 === 0 ? 8 : 0)];
  });

  test("one band per occupied column, never more than there are columns", () => {
    const bands = downsample(saw, 0, 24, 200);
    expect(bands.length).toBeLessThanOrEqual(200);
    expect(bands.length).toBeGreaterThan(190);
    for (const b of bands) expect(b.min).toBeLessThanOrEqual(b.max);
  });

  test("the highs follow the trend, so the dips do not make spikes; the dips stay in the band", () => {
    const bands = downsample(saw, 0, 24, 200);
    const highs = bands.map((b) => b.max);
    for (let i = 1; i < highs.length; i++)
      expect(highs[i] as number).toBeGreaterThanOrEqual(highs[i - 1] as number);
    expect(bands.some((b) => b.max - b.min >= 7)).toBe(true);
  });

  test("a real drop (a reset) is still a drop: the next column starts low", () => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 1000; i++) pts.push([i / 1000, 100 + i]);
    for (let i = 0; i < 1000; i++) pts.push([1 + i / 1000, 3 + i / 100]);
    const bands = downsample(pts, 0, 2, 100);
    const before = bands.find((b) => b.x < 1 && b.x > 0.95) as { max: number };
    const after = bands.find((b) => b.x > 1.05) as { max: number };
    expect(before.max).toBeGreaterThan(1000);
    expect(after.max).toBeLessThan(20);
  });

  test("a sparse series is drawn as it is; a floor value stays the low; a NaN is skipped", () => {
    const pts: [number, number][] = [
      [0, Number.NEGATIVE_INFINITY],
      [1, 5],
      [2, Number.NaN],
      [3, 9],
    ];
    expect(downsample(pts, 0, 4, 400)).toEqual([
      { x: 0, min: Number.NEGATIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
      { x: 1, min: 5, max: 5 },
      { x: 3, min: 9, max: 9 },
    ]);
    // Two points in one column become one band at their mean.
    expect(
      downsample(
        [
          [1, 4],
          [1.001, 6],
        ],
        0,
        4,
        4,
      ),
    ).toEqual([{ x: 1.0005, min: 4, max: 6 }]);
    expect(downsample([], 0, 4, 4)).toEqual([]);
  });
});

describe("figures", () => {
  test("three significant digits in the engine's form", () => {
    expect(figure(D("3902.1895043592453"))).toBe("3.90K");
    expect(figure(D(18_899))).toBe("18.90K");
    expect(figure(D(12.3456))).toBe("12.3");
    expect(figure(D(1.2345))).toBe("1.23");
    expect(figure(D(0))).toBe("0");
    expect(figure(D(1_520_000))).toBe("1.52M");
    expect(figure(undefined)).toBe("–");
  });

  test("an axis label drops the zeros", () => {
    expect(compact(D(150_000))).toBe("150K");
    expect(compact(D(1_500_000))).toBe("1.5M");
    expect(compact(D(1000))).toBe("1K");
    expect(compact(D(0.2))).toBe("0.2");
  });

  test("a change against the run before is a signed percentage; blank with no run before", () => {
    expect(percentChange(D(112.4), D(100))).toBe("+12.4%");
    expect(percentChange(D(96.9), D(100))).toBe("−3.1%");
    expect(percentChange(D(16_000), D(100))).toBe("×160");
    expect(percentChange(D(1000), D(100))).toBe("+900%");
    expect(percentChange(D(100), D(100))).toBe("0.0%");
    expect(percentChange(D(5), undefined)).toBe("");
    expect(percentChange(D(5), D(0))).toBe("–");
    expect(percentChange(undefined, D(5))).toBe("–");
  });

  test("a time typed as m:ss or h:mm:ss", () => {
    expect(parseClock("6:00")).toBe(360_000);
    expect(parseClock("1:30")).toBe(90_000);
    expect(parseClock("1:00:00")).toBe(3_600_000);
    expect(parseClock("0:00.25")).toBe(250);
    expect(parseClock("360000")).toBeUndefined();
    expect(parseClock("1:75")).toBeUndefined();
    expect(parseClock("")).toBeUndefined();
  });
});
