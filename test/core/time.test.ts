import { describe, expect, test } from "bun:test";
import { secondsUntil } from "watchpot/core";

const END = Date.UTC(2026, 10, 3, 12, 0, 0);

describe("secondsUntil", () => {
  test("reads zero at the end and past it", () => {
    expect(secondsUntil(END, END)).toBe(0);
    expect(secondsUntil(END, END + 1)).toBe(0);
    expect(secondsUntil(END, END + 60_000)).toBe(0);
  });

  test("rounds a part second up to a whole one", () => {
    expect(secondsUntil(END, END - 1)).toBe(1);
    expect(secondsUntil(END, END - 1000)).toBe(1);
    expect(secondsUntil(END, END - 1001)).toBe(2);
  });

  test("never rises as now moves on", () => {
    let last = Number.POSITIVE_INFINITY;
    for (let now = END - 5_000; now <= END + 1_000; now += 37) {
      const left = secondsUntil(END, now);
      expect(left).toBeLessThanOrEqual(last);
      last = left;
    }
  });
});
