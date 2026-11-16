import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { D, type Decimal } from "watchpot/core";
import {
  BLOCKED,
  DRAFT_LINE,
  type FitGate,
  fitTable,
  fitTableSource,
  formatFit,
  holdings,
  isBlocked,
  nicePrice,
  priceAbove,
  runFit,
} from "watchpot/sim";

const MIN = 60_000;

/** A jar that fills a coin a second; a gate is paid out of it as soon as the table prices it and the jar holds it. */
function jar(plan: Record<string, number>, priceAt: (held: Decimal) => string | null = nicePrice) {
  const s = { coins: D(0), playedMs: 0, paid: new Set<string>() };
  const table = fitTable();
  const have = holdings(["coins"], () => s.coins, { window: 30 });
  const asked: string[] = [];
  const gates: FitGate[] = Object.entries(plan).map(([key, minute]) => ({
    key,
    atMs: minute * MIN,
    price: () => {
      asked.push(key);
      return priceAt(have.held("coins"));
    },
  }));
  const run = (limitMs = 20 * MIN) =>
    runFit({
      table,
      gates,
      step: (dt) => {
        s.coins = s.coins.add(dt / 1000);
        s.playedMs += dt;
      },
      look: () => {
        for (const key of Object.keys(plan)) {
          const p = table.get(key);
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
  return { s, table, asked, run };
}

describe("runFit", () => {
  test("shuts every gate, then prices each into the table at or after its minute and finishes", () => {
    const j = jar({ first: 1, second: 3, third: 4 });
    j.table.set("first", "1"); // a stale price the fit must shut
    const result = j.run();
    expect(result.finished).toBe(true);
    for (const g of result.gates) {
      expect(g.openedMs).toBeGreaterThanOrEqual(g.atMs);
      expect(g.openedMs).toBeLessThan(g.atMs + MIN);
      expect(j.table.figure(g.key)).toBe(g.value);
    }
    expect(result.playedMs).toBeLessThan(10 * MIN);
    expect(result.snapshots).toEqual([]);
  });

  test("a gate nothing prices stays shut and the run is not finished", () => {
    const j = jar({ first: 1, never: 2 }, (held) => (held.gt(1e9) ? "1" : null));
    const result = j.run(5 * MIN);
    expect(result.finished).toBe(false);
    expect(result.playedMs).toBe(5 * MIN);
    expect(result.gates.every((g) => g.openedMs === undefined)).toBe(true);
    expect(isBlocked(j.table.get("never"))).toBe(true);
    expect(formatFit(result)).toContain("| never | 0:02 | never |  |");
  });

  test("a note after the price goes in the report, never in the table", () => {
    const j = jar({ only: 1 }, (held) => {
      const p = nicePrice(held);
      return p && `${p} (with a note)`;
    });
    const result = j.run();
    expect(result.gates[0]?.value).toMatch(/ \(with a note\)$/);
    expect(j.table.figure("only")).toBe(result.gates[0]?.value?.split(" ")[0]);
  });

  test("gates due in one step are asked in minute order, the plan's order between equals", () => {
    const j = jar({ late: 2, b: 1, a: 1 });
    j.run(30_000 + 2 * MIN);
    expect(j.asked.slice(0, 2)).toEqual(["b", "a"]);
  });

  test("steps at its quality, or at its stepMs", () => {
    const seen: number[] = [];
    let played = 0;
    const go = (o: { quality?: "quick" | "rough"; stepMs?: number }) =>
      runFit({
        table: fitTable(),
        gates: [],
        step: (dt) => {
          seen.push(dt);
          played += dt;
        },
        look: () => {},
        playedMs: () => played,
        done: () => false,
        limitMs: played + 60_000,
        ...o,
      });
    go({});
    expect(seen.at(-1)).toBe(1000);
    go({ quality: "quick" });
    expect(seen.at(-1)).toBe(10_000);
    go({ quality: "rough", stepMs: 500 });
    expect(seen.at(-1)).toBe(500);
  });

  test("looks every `lookEvery`th step, before the step", () => {
    const seen: number[] = [];
    let played = 0;
    runFit({
      table: fitTable(),
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
    const h = holdings(["x"], () => D(v), { window: 3 });
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
    const h = holdings(["x"], () => D(v), { window: 5 });
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

  test("carry on from what they remembered: the window, the peaks and each ratchet's bar", () => {
    let v = 0;
    const a = holdings(["x"], () => D(v), { window: 3 });
    const clearA = a.ratchet("x");
    for (const n of [50, 10]) {
      v = n;
      a.sample();
    }
    expect(clearA()).toBe(false); // the bar is fixed at 67
    const b = holdings(["x"], () => D(v), { window: 3, from: a.remember() });
    const clearB = b.ratchet("x");
    v = 200;
    b.sample(); // a new peak: a fresh ratchet would fix its bar at 268
    expect(clearB()).toBe(true);
    expect(b.peak("x").toNumber()).toBe(200);
    expect(b.held("x").toNumber()).toBe(200);
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

describe("priceAbove", () => {
  test("a readable figure strictly above its input", () => {
    expect(priceAbove(D(0.3))).toBe("1");
    expect(priceAbove(D(1))).toBe("2");
    expect(priceAbove(D(99.5))).toBe("100");
    expect(priceAbove(D(100))).toBe("110");
    expect(priceAbove(D(123))).toBe("130");
    expect(priceAbove(D(995))).toBe("1000");
    expect(priceAbove(D(2.71e7))).toBe("2.8e7");
    expect(priceAbove(D(9.95e7))).toBe("1e8");
    expect(priceAbove(D("6.51e1234"))).toBe("6.6e1234");
    for (const x of [0, 1, 7.5, 99, 150, 4321, 7.7e5, 3.1e9, 9.99e12])
      expect(D(priceAbove(D(x))).gt(x)).toBe(true);
    expect(() => priceAbove(D(Number.POSITIVE_INFINITY))).toThrow(/no price above/);
  });
});

describe("the fit table", () => {
  test("gives a priced gate's price, BLOCKED for one it lacks, and counts its changes", () => {
    const t = fitTable<"a" | "b">({ a: "120" });
    expect(t.get("a").toNumber()).toBe(120);
    expect(t.figure("a")).toBe("120");
    expect(t.get("b").eq(D(BLOCKED))).toBe(true);
    expect(isBlocked(t.get("b"))).toBe(true);
    expect(isBlocked(t.get("a"))).toBe(false);
    const v = t.version();
    t.set("b", "2.5e7");
    expect(t.has("b")).toBe(true);
    expect(t.get("b").toNumber()).toBe(2.5e7);
    t.set("a", null);
    expect(t.has("a")).toBe(false);
    expect(t.version()).toBe(v + 2);
    expect(t.data()).toEqual({ b: "2.5e7" });
    t.load({ a: "3" });
    expect(t.data()).toEqual({ a: "3" });
    expect(() => t.set("a", "lots")).toThrow(/not a price/);
  });

  test("fitTableSource round-trips through fitTable, in the plan's order, a draft saying so", async () => {
    const table = fitTable({ "with.dot": "2.5e7", plain: "150" });
    const text = fitTableSource(table, {
      header: "Written by the fit.\nDo not edit.",
      planImport: "./plan",
      keyType: "Key",
      order: ["plain", "stuck", "with.dot"],
    });
    expect(
      text.startsWith('// Written by the fit.\n// Do not edit.\nimport type { Key } from "./plan";'),
    ).toBe(true);
    expect(text.indexOf("plain")).toBeLessThan(text.indexOf("with.dot"));
    expect(text).not.toContain("stuck");
    const draft = fitTableSource(table.data(), {
      header: "x",
      planImport: "./plan",
      keyType: "Key",
      draft: true,
    });
    expect(draft.startsWith(`${DRAFT_LINE}\n// x\n`)).toBe(true);

    const dir = mkdtempSync(join(tmpdir(), "watchpot-fit-"));
    try {
      const file = join(dir, "fit.table.ts");
      writeFileSync(file, text);
      const { FIT } = (await import(file)) as { FIT: Partial<Record<string, string>> };
      const read = fitTable(FIT);
      expect(read.figure("plain")).toBe("150");
      expect(read.figure("with.dot")).toBe("2.5e7");
      expect(isBlocked(read.get("stuck"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
