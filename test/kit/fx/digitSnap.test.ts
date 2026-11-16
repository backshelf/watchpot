import { describe, expect, test } from "bun:test";
import { MAX_ROLLS_PER_SECOND, splitDigits } from "../../../src/kit/fx/digitSnap";

describe("splitDigits", () => {
  test("a slow number rolls whole", () => {
    expect(splitDigits(204.49, 2, 0.01)).toBe("roll");
    expect(splitDigits(204.49, 2, 0)).toBe("roll");
  });

  test("the digits turning faster than the limit become the tail; the head and tail spell the same number", () => {
    // Hundredths turn 30 times a second, tenths 3: at a limit of 2 a second both snap, the units roll.
    const split = splitDigits(204.49, 2, 0.3);
    expect(typeof split).toBe("object");
    if (typeof split !== "object") return;
    expect(split.head).toBe(204);
    expect(split.decimals).toBe(0);
    expect(split.tail).toBe(".49");
    // At a slower rate only the hundredths snap.
    const slower = splitDigits(204.49, 2, (MAX_ROLLS_PER_SECOND / 100) * 5);
    expect(slower).toEqual({ head: 204.4, decimals: 1, tail: "9" });
  });

  test("a cut inside a digit group, or nothing left to roll, sets the whole number still", () => {
    expect(splitDigits(12_480, 0, 50)).toBe("snap");
    expect(splitDigits(5, 0, 1000)).toBe("snap");
  });

  test("a cut at a group boundary keeps the head grouped", () => {
    expect(splitDigits(12_480, 0, 2_000)).toEqual({ head: 12, decimals: 0, tail: ",480" });
  });
});
