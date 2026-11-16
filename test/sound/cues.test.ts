import { describe, expect, test } from "bun:test";
import { createCueState, createRng, pickTake } from "../../src/sound/cues";
import type { Cue, Take } from "../../src/sound/types";

const takes = (n: number): Take[] => Array.from({ length: n }, (_, i) => ({ sample: `kit/kick-${i}` }));

/** The take indices `count` plays of `cue` pick. */
function picks(cue: Cue, count: number, seed = 7, options = {}): number[] {
  const state = createCueState();
  const rng = createRng(seed);
  const all = cue.takes ?? [];
  return Array.from({ length: count }, () => {
    const picked = pickTake(cue, state, options, rng);
    return picked.take ? all.indexOf(picked.take) : -1;
  });
}

describe("picking a take", () => {
  test("a shuffle never repeats a take back to back over 1,000 picks, and deals every take", () => {
    for (const n of [2, 3, 5]) {
      const seq = picks({ takes: takes(n) }, 1000);
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
      // Each bag of n deals every take once, so no take falls far behind.
      const counts = Array.from({ length: n }, (_, k) => seq.filter((s) => s === k).length);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(n);
    }
  });

  test("the same seed gives the same sequence, another seed another", () => {
    const cue: Cue = { takes: takes(4), vary: { cents: 50, db: 2, startMs: 10 } };
    const run = (seed: number) => {
      const state = createCueState();
      const rng = createRng(seed);
      return Array.from({ length: 50 }, () => pickTake(cue, state, {}, rng));
    };
    expect(run(3)).toEqual(run(3));
    expect(run(3)).not.toEqual(run(4));
  });

  test("a cue with one take and a shuffle repeats it", () => {
    expect(picks({ takes: takes(1) }, 5)).toEqual([0, 0, 0, 0, 0]);
  });

  test("a round goes in order and wraps", () => {
    expect(picks({ takes: takes(3), pick: "round" }, 7)).toEqual([0, 1, 2, 0, 1, 2, 0]);
  });

  test("random picks by weight, and a take of weight 0 never", () => {
    const cue: Cue = {
      pick: "random",
      takes: [
        { sample: "kit/a", weight: 3 },
        { sample: "kit/b", weight: 1 },
        { sample: "kit/c", weight: 0 },
      ],
    };
    const seq = picks(cue, 2000);
    const a = seq.filter((s) => s === 0).length;
    const b = seq.filter((s) => s === 1).length;
    expect(seq).not.toContain(2);
    expect(a / b).toBeGreaterThan(2.4);
    expect(a / b).toBeLessThan(3.8);
  });

  test("velocity picks the takes whose range holds it, else the nearest range's", () => {
    const cue: Cue = {
      takes: [
        { sample: "kit/soft", velocity: [0, 0.3] },
        { sample: "kit/mid", velocity: [0.4, 0.6] },
        { sample: "kit/hard", velocity: [0.8, 0.9] },
      ],
    };
    expect(picks(cue, 4, 1, { velocity: 0.2 })).toEqual([0, 0, 0, 0]);
    expect(picks(cue, 4, 1, { velocity: 0.5 })).toEqual([1, 1, 1, 1]);
    // 1 is outside every range: the hard take is nearest.
    expect(picks(cue, 4, 1, { velocity: 1 })).toEqual([2, 2, 2, 2]);
    // 0.35 is as near the soft range as the mid one: both answer.
    expect(picks(cue, 40, 1, { velocity: 0.35 }).every((i) => i === 0 || i === 1)).toBe(true);
  });

  test("a take that is not ready is passed over; none ready gives no take and still varies", () => {
    const cue: Cue = { takes: takes(3), vary: { cents: 100 } };
    const state = createCueState();
    const rng = createRng(2);
    for (let i = 0; i < 20; i++) {
      expect(pickTake(cue, state, {}, rng, (t) => t.sample !== "kit/kick-1").take?.sample).not.toBe(
        "kit/kick-1",
      );
    }
    const rates = Array.from({ length: 20 }, () => pickTake(cue, state, {}, rng, () => false));
    expect(rates.every((p) => p.take === null)).toBe(true);
    expect(new Set(rates.map((p) => p.rate)).size).toBeGreaterThan(1);
  });
});

describe("variation", () => {
  test("rates stay inside vary.cents, levels inside vary.db, starts inside vary.startMs", () => {
    const cue: Cue = { takes: takes(3), vary: { cents: 30, db: 2, startMs: 15 } };
    const state = createCueState();
    const rng = createRng(11);
    const all = Array.from({ length: 1000 }, () => pickTake(cue, state, {}, rng));
    for (const p of all) {
      expect(Math.abs(1200 * Math.log2(p.rate))).toBeLessThanOrEqual(30 + 1e-9);
      expect(Math.abs(p.db)).toBeLessThanOrEqual(2 + 1e-9);
      expect(p.startMs).toBeGreaterThanOrEqual(0);
      expect(p.startMs).toBeLessThanOrEqual(15);
    }
    // It actually spreads across the range.
    const cents = all.map((p) => 1200 * Math.log2(p.rate));
    expect(Math.max(...cents)).toBeGreaterThan(20);
    expect(Math.min(...cents)).toBeLessThan(-20);
  });

  test("widen scales vary", () => {
    const cue: Cue = { takes: takes(2), vary: { cents: 20 } };
    const state = createCueState();
    const rng = createRng(5);
    const cents = Array.from(
      { length: 500 },
      () => 1200 * Math.log2(pickTake(cue, state, {}, rng, undefined, 2).rate),
    );
    expect(Math.max(...cents.map(Math.abs))).toBeGreaterThan(30);
    expect(Math.max(...cents.map(Math.abs))).toBeLessThanOrEqual(40 + 1e-9);
  });

  test("a cue with no vary does not vary: the take's own rate, level and start", () => {
    const cue: Cue = { takes: [{ sample: "kit/hat", rate: 1.5, level: -3, at: 0.02 }] };
    expect(pickTake(cue, createCueState(), {}, createRng(1))).toEqual({
      take: { sample: "kit/hat", rate: 1.5, level: -3, at: 0.02 },
      rate: 1.5,
      db: -3,
      startMs: 20,
    });
  });

  test("a ladder step multiplies the rate by its ratio, held to the ladder's ends", () => {
    const cue: Cue = { takes: [{ sample: "kit/pad", rate: 2 }], ladder: [1, 1.25, 1.5] };
    const at = (step?: number) => pickTake(cue, createCueState(), { step }, createRng(1)).rate;
    expect(at()).toBeCloseTo(2, 9);
    expect(at(1)).toBeCloseTo(2.5, 9);
    expect(at(2)).toBeCloseTo(3, 9);
    expect(at(9)).toBeCloseTo(3, 9);
    expect(at(-1)).toBeCloseTo(2, 9);
  });

  test("a scale ladder leaves its step to the harmony clock: the rate is the take's own", () => {
    const cue: Cue = { takes: takes(1), ladder: "scale" };
    for (const step of [-7, 0, 3, 9])
      expect(pickTake(cue, createCueState(), { step }, createRng(1)).rate).toBe(1);
  });

  test("velocity scales the level: softer is quieter, full is untouched, zero is the floor", () => {
    const cue: Cue = { takes: takes(1) };
    const db = (velocity: number) => pickTake(cue, createCueState(), { velocity }, createRng(1)).db;
    expect(db(1)).toBeCloseTo(0, 9);
    expect(db(0.5)).toBeCloseTo(-6.02, 1);
    expect(db(0.25)).toBeLessThan(db(0.5));
    expect(Number.isFinite(db(0))).toBe(true);
    expect(db(0)).toBeLessThan(db(0.25));
  });
});
