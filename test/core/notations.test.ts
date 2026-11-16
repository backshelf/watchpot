import { describe, expect, test } from "bun:test";
import { Decimal, fmt, formatter, letterSuffix, NOTATIONS } from "watchpot/core";

const text = (value: number | string, notation: (typeof NOTATIONS)[number]) =>
  fmt(typeof value === "string" ? new Decimal(value) : value, { notation }).text;

describe("NOTATIONS", () => {
  test("lists every notation, the default first", () => {
    expect(NOTATIONS[0]).toBe("suffix");
    expect([...NOTATIONS].sort()).toEqual(["engineering", "letters", "logarithm", "scientific", "suffix"]);
  });

  test("every notation prints zero, the plain range, infinity and NaN alike", () => {
    for (const n of NOTATIONS) {
      expect(text(0, n)).toBe("0");
      expect(text(99_999, n)).toBe("99,999");
      expect(text(-1234, n)).toBe("-1,234");
      expect(fmt(Number.POSITIVE_INFINITY, { notation: n }).text).toBe("∞");
      expect(fmt(Number.NEGATIVE_INFINITY, { notation: n }).text).toBe("-∞");
      expect(fmt(Number.NaN, { notation: n }).text).toBe("0");
    }
  });
});

describe("engineering", () => {
  test("an exponent that is a multiple of three, three figures, floored", () => {
    expect(text(100_000, "engineering")).toBe("100e3");
    expect(text(999_999, "engineering")).toBe("999e3");
    expect(text(1e6, "engineering")).toBe("1.00e6");
    expect(text(12_345_678, "engineering")).toBe("12.3e6");
    expect(text(-4.56e10, "engineering")).toBe("-45.6e9");
    expect(fmt(12_345_678, { notation: "engineering" })).toEqual({
      mantissa: 12.3,
      suffix: "e6",
      text: "12.3e6",
      negative: false,
    });
  });

  test("past a double, with a grouped exponent", () => {
    expect(text("1.5e400", "engineering")).toBe("15.0e399");
    expect(text("2e3001", "engineering")).toBe("20.0e3,000");
  });
});

describe("letters", () => {
  test("bijective letters: z is followed by aa", () => {
    expect([1, 2, 26, 27, 28, 52, 53, 702, 703].map(letterSuffix)).toEqual([
      "a",
      "b",
      "z",
      "aa",
      "ab",
      "az",
      "ba",
      "zz",
      "aaa",
    ]);
  });

  test("a per thousand after the plain range; the suffix changes at each thousand", () => {
    expect(text(100_000, "letters")).toBe("100.00a");
    expect(text(999_999_999, "letters")).toBe("999.99b");
    expect(text(1e9, "letters")).toBe("1.00c");
    expect(text(1e78, "letters")).toBe("1.00z");
    expect(text(1e81, "letters")).toBe("1.00aa");
    expect(text(-2.5e6, "letters")).toBe("-2.50b");
  });

  test("past a double", () => {
    expect(text("1e309", "letters")).toBe(`1.00${letterSuffix(103)}`);
  });
});

describe("logarithm", () => {
  test("the exponent alone, to two decimals, floored", () => {
    expect(text(100_000, "logarithm")).toBe("e5.00");
    expect(text(1e12 * 2.2, "logarithm")).toBe("e12.34");
    expect(text("1e1234", "logarithm")).toBe("e1,234.00");
    expect(text(-1e20, "logarithm")).toBe("-e20.00");
  });

  test("a value whose exponent outgrows a double prints its logarithm in scientific", () => {
    expect(text("ee20", "logarithm")).toBe("e1.00e20");
    expect(text("ee20", "letters")).toBe("e1.00e20");
  });
});

describe("plainBelow and the formatter", () => {
  test("every new notation honours plainBelow", () => {
    for (const notation of ["engineering", "letters", "logarithm"] as const)
      expect(fmt(5000, { notation, plainBelow: 1000 }).text).not.toBe("5,000");
  });

  test("formatter binds a notation to every printer", () => {
    const f = formatter({ notation: "engineering" });
    expect(f.num(12_345_678)).toBe("12.3e6");
    expect(f.times(12_345_678)).toBe("×12.3e6");
    expect(f.rate(12_345_678)).toBe("12.3e6/s");
    expect(formatter({ notation: "letters" }).num(2e6)).toBe("2.00b");
    expect(formatter({ notation: "logarithm" }).plus(1e6)).toBe("+e6.00");
  });
});
