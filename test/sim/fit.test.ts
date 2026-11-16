import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { D, type Decimal } from "watchpot/core";
import {
  BLOCKED,
  type FitGate,
  type FitResult,
  fitReader,
  fitTableSource,
  formatFit,
  holdings,
  nicePrice,
  runFit,
} from "watchpot/sim";

const MIN = 60_000;

/** A jar that fills a coin a second; a gate is paid out of it as soon as its price is set and the jar holds it. */
function jar(plan: Record<string, number>, priceAt: (held: Decimal) => string | null = nicePrice) {
  const s = { coins: D(0), playedMs: 0, paid: new Set<string>() };
  const prices: Record<string, string> = {};
  const have = holdings(["coins"], () => s.coins, 30);
  const asked: string[] = [];
  const gates: FitGate[] = Object.entries(plan).map(([key, minute]) => ({
    key,
    atMs: minute * MIN,
    block: () => {
      prices[key] = BLOCKED;
    },
    price: () => {
      asked.push(key);
      const value = priceAt(have.held("coins"));
      if (value) prices[key] = value.split(" ")[0] ?? value;
      return value;
    },
  }));
  const run = (limitMs = 20 * MIN) =>
    runFit({
      gates,
      step: (dt) => {
        s.coins = s.coins.add(dt / 1000);
        s.playedMs += dt;
      },
      look: () => {
        for (const [key, p] of Object.entries(prices)) {
          if (s.paid.has(key) || s.coins.lt(p)) continue;
          s.coins = s.coins.sub(p);
          s.paid.add(key);
        }
      },
      afterStep: () => have.sample(),
      playedMs: () => s.playedMs,
      done: () => s.paid.size === gates.length,
      limitMs,
    });
  return { s, prices, asked, run };
}

describe("runFit", () => {
  test("blocks every gate, then opens each at or after its minute and finishes", () => {
    const plan = { first: 1, second: 3, third: 4 };
    const j = jar(plan);
    const result = j.run();
    expect(result.finished).toBe(true);
    for (const g of result.gates) {
      expect(g.openedMs).toBeGreaterThanOrEqual(g.atMs);
      expect(g.openedMs).toBeLessThan(g.atMs + MIN);
      expect(g.value).toBeDefined();
    }
    expect(result.playedMs).toBeLessThan(10 * MIN);
  });

  test("a gate nothing prices stays unopened and the run is not finished", () => {
    const j = jar({ first: 1, never: 2 }, (held) => (held.gt(1e9) ? "1" : null));
    const result = j.run(5 * MIN);
    expect(result.finished).toBe(false);
    expect(result.playedMs).toBe(5 * MIN);
    expect(result.gates.every((g) => g.openedMs === undefined)).toBe(true);
    expect(formatFit(result)).toContain("| never | 0:02 | never |  |");
  });

  test("gates due in one step are asked in minute order, the plan's order between equals", () => {
    const j = jar({ late: 2, b: 1, a: 1 });
    j.run(30_000 + 2 * MIN);
    expect(j.asked.slice(0, 2)).toEqual(["b", "a"]);
  });

  test("looks every `lookEvery`th step, before the step", () => {
    const seen: number[] = [];
    let played = 0;
    runFit({
      gates: [],
      step: (dt) => {
        played += dt;
      },
      look: () => seen.push(played),
      playedMs: () => played,
      done: () => false,
      limitMs: 10_000,
      stepMs: 1000,
      lookEvery: 4,
    });
    expect(seen).toEqual([0, 4000, 8000]);
  });
});

describe("holdings", () => {
  test("held is the most in the window or the last samples; peak is the most ever", () => {
    let v = 0;
    const h = holdings(["x"], () => D(v), 3);
    expect(h.held("x").toNumber()).toBe(0);
    for (const n of [5, 9, 2, 1, 3]) {
      v = n;
      h.sample();
    }
    expect(h.held("x").toNumber()).toBe(3); // the window is 2, 1, 3
    expect(h.held("x", 2).toNumber()).toBe(3);
    expect(h.held("x", 1).toNumber()).toBe(3);
    expect(h.peak("x").toNumber()).toBe(9);
  });

  test("the ratchet refuses until holdings pass the earlier peak by the margin", () => {
    let v = 0;
    const h = holdings(["x"], () => D(v), 5);
    const feed = (n: number) => {
      v = n;
      h.sample();
    };
    for (const n of [40, 100, 60]) feed(n);
    for (let i = 0; i < 5; i++) feed(0); // a reset: the window forgets the peak, the ratchet does not
    const clear = h.ratchet("x");
    expect(clear()).toBe(false);
    feed(120);
    expect(clear()).toBe(false);
    feed(140); // a new peak does not move the bar fixed on the first call
    expect(clear()).toBe(true);
    const tight = h.ratchet("x", 1);
    expect(tight()).toBe(true);
  });
});

describe("nicePrice", () => {
  test("null below 1 or not finite", () => {
    expect(nicePrice(D(0.99))).toBeNull();
    expect(nicePrice(D(-5))).toBeNull();
    expect(nicePrice(D(Number.POSITIVE_INFINITY))).toBeNull();
    expect(nicePrice(D(Number.NaN))).toBeNull();
  });

  test("whole below 100", () => {
    expect(nicePrice(D(1))).toBe("1");
    expect(nicePrice(D(1.9))).toBe("1");
    expect(nicePrice(D(99.99))).toBe("99");
  });

  test("two figures off the steps, rounded down, digits below a million", () => {
    expect(nicePrice(D(100))).toBe("100");
    expect(nicePrice(D(119))).toBe("100");
    expect(nicePrice(D(123))).toBe("120");
    expect(nicePrice(D(999))).toBe("800");
    expect(nicePrice(D(2500))).toBe("2500");
    expect(nicePrice(D(999_999))).toBe("800000");
  });

  test("`<step>e<exponent>` from a million, past what a number holds", () => {
    expect(nicePrice(D(1e6))).toBe("1e6");
    expect(nicePrice(D(2.7e7))).toBe("2.5e7");
    expect(nicePrice(D("6.5e1234"))).toBe("6e1234");
  });

  test("never above its input, and takes its own steps", () => {
    for (const x of [1, 7.5, 150, 4321, 7.7e5, 3.1e9]) {
      expect(D(nicePrice(D(x)) ?? 0).lte(x)).toBe(true);
    }
    expect(nicePrice(D(7400), [1, 5])).toBe("5000");
    expect(nicePrice(D(4.9e8), [1, 5])).toBe("1e8");
  });
});

describe("the fitted table", () => {
  test("fitReader gives the fitted price, or BLOCKED for a gate the table lacks", () => {
    const read = fitReader<"a" | "b">({ a: "120" });
    expect(read("a")).toBe("120");
    expect(read("b")).toBe(BLOCKED);
    expect(D(BLOCKED).gt("1e1000")).toBe(true);
  });

  test("fitTableSource round-trips through fitReader, without notes or unopened gates", async () => {
    const result: FitResult = {
      finished: false,
      playedMs: 9 * MIN,
      gates: [
        { key: "plain", atMs: MIN, openedMs: MIN, value: "150" },
        { key: "with.dot", atMs: 2 * MIN, openedMs: 3 * MIN, value: "2.5e7 (a note for the report)" },
        { key: "stuck", atMs: 4 * MIN },
      ],
    };
    const text = fitTableSource(result, {
      header: "Written by the fit.\nDo not edit.",
      planImport: "./plan",
      keyType: "Key",
    });
    expect(
      text.startsWith('// Written by the fit.\n// Do not edit.\nimport type { Key } from "./plan";'),
    ).toBe(true);
    expect(text).not.toContain("note");
    expect(formatFit(result)).toContain("2.5e7 (a note for the report)");

    const dir = mkdtempSync(join(tmpdir(), "watchpot-fit-"));
    try {
      const file = join(dir, "fit.table.ts");
      writeFileSync(file, text);
      const { FIT } = (await import(file)) as { FIT: Partial<Record<string, string>> };
      const read = fitReader(FIT);
      expect(read("plain")).toBe("150");
      expect(read("with.dot")).toBe("2.5e7");
      expect(read("stuck")).toBe(BLOCKED);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
