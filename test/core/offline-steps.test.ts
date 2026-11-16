import { describe, expect, test } from "bun:test";
import { offlineCredit, offlineSteps } from "watchpot/core";

const HOUR = 3_600_000;

describe("offlineSteps", () => {
  test("carries what offlineCredit says: the cap and the rate", () => {
    const s = offlineSteps(3 * HOUR, { capMs: HOUR, rate: 0.5 });
    expect(s).toMatchObject(offlineCredit(3 * HOUR, 0.5, HOUR));
    expect(s.capped).toBe(true);
    expect(s.creditedMs).toBe(HOUR / 2);
  });

  test("steps at each bound: none, one, ceil by minStepMs, the cap on steps", () => {
    const o = { capMs: 10 * HOUR };
    expect(offlineSteps(0, o).steps).toBe(0);
    expect(offlineSteps(1, o).steps).toBe(1);
    expect(offlineSteps(1000, o).steps).toBe(1);
    expect(offlineSteps(1001, o).steps).toBe(2);
    expect(offlineSteps(240_000, o).steps).toBe(240);
    expect(offlineSteps(240_001, o).steps).toBe(240);
    expect(offlineSteps(5 * HOUR, o).steps).toBe(240);
    expect(offlineSteps(5 * HOUR, { ...o, maxSteps: 10 }).steps).toBe(10);
    expect(offlineSteps(5000, { ...o, minStepMs: 500 }).steps).toBe(10);
  });

  test("the steps add back up to the credited time", () => {
    for (const ms of [1, 999, 1001, 77_777, 5 * HOUR]) {
      const s = offlineSteps(ms, { capMs: 2 * HOUR, rate: 0.7 });
      expect(s.steps * s.stepMs).toBeCloseTo(s.creditedMs, 6);
    }
  });

  test("a negative, NaN or infinite absence is what offlineCredit makes of it, with no steps", () => {
    for (const ms of [-5, Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
      const s = offlineSteps(ms, { capMs: HOUR });
      const base = offlineCredit(ms, 1, HOUR);
      expect(s.awayMs).toBe(base.awayMs);
      expect(s.capped).toBe(base.capped);
      expect(s.creditedMs).toBe(base.creditedMs);
      if (!(base.creditedMs > 0)) expect(s).toMatchObject({ steps: 0, stepMs: 0 });
    }
  });
});
