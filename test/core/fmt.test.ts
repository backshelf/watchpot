import { describe, expect, test } from "bun:test";
import {
  bonusPercent,
  Decimal,
  fmt,
  fmtCents,
  fmtCounted,
  fmtPlayed,
  fmtPlus,
  fmtRate,
  fmtTimer,
  fmtTimes,
  fmtWait,
  formatter,
} from "watchpot/core";

describe("fmt", () => {
  test("plain with separators below 100,000, then two decimals and a suffix, then scientific; always floored", () => {
    expect(fmt(99999.9).text).toBe("99,999");
    expect(fmt(100_000).text).toBe("100.00K");
    expect(fmt(1.999e6).text).toBe("1.99M");
    expect(fmt(1e33).text).toBe("1.00Dc");
    expect(fmt(new Decimal("2.5e40")).text).toBe("2.50e40");
    expect(fmt(new Decimal("1e400")).text).toBe("1.00e400");
    expect(fmt(-1.52e6).text).toBe("-1.52M");
  });

  test("returns the mantissa and suffix a ticker animates", () => {
    expect(fmt(1.52e6)).toEqual({ mantissa: 1.52, suffix: "M", text: "1.52M", negative: false });
    expect(fmt(-1234)).toMatchObject({ suffix: "", negative: true });
  });

  test("real money is always to the cent; a timer never runs negative and lets hours pass 99", () => {
    expect(fmtCents(1)).toBe("$0.01");
    expect(fmtCents(120417)).toBe("$1,204.17");
    expect(fmtCents(-14)).toBe("-$0.14");
    expect(fmtTimer(3_661_000)).toBe("01:01:01");
    expect(fmtTimer(-5000)).toBe("00:00:00");
    expect(fmtTimer(100 * 3600 * 1000)).toBe("100:00:00");
  });

  test("a wait never reads shorter than it is, and names its two largest units", () => {
    expect(fmtWait(61_000)).toBe("2m");
    expect(fmtWait((60 + 52) * 60_000 - 1)).toBe("1h 52m");
    expect(fmtWait(0)).toBe("now");
    expect(fmtWait(0, { zero: "0m" })).toBe("0m");
    expect(fmtWait(90_000, { zero: "0m" })).toBe("2m");
    expect(fmtWait(Number.POSITIVE_INFINITY)).toBe("never");
    expect(fmtWait(30_000)).toBe("under a minute");
  });

  test("a bonus is signed, never below the zero bonus, and to the tenth", () => {
    for (const v of [0, 0.04, 4.4, 120]) expect(bonusPercent(v).startsWith("+")).toBe(true);
    expect(bonusPercent(-3)).toBe(bonusPercent(0));
    expect(bonusPercent(4.41)).toBe(bonusPercent(4.39));
    expect(bonusPercent(4.4)).not.toBe(bonusPercent(4.5));
  });
});

describe("scientific notation", () => {
  const sci = { notation: "scientific", plainBelow: 1e6 } as const;

  test("plain below plainBelow, then a floored mantissa and an exponent", () => {
    expect(fmt(999_999.9, sci).text).toBe("999,999");
    expect(fmt(1e6, sci).text).toBe("1.00e6");
    expect(fmt(1.239e45, sci).text).toBe("1.23e45");
    expect(fmt(-2.5e12, sci).text).toBe("-2.50e12");
    expect(fmt(1.5e6, sci)).toMatchObject({ mantissa: 1.5, suffix: "e6" });
  });

  test("a mantissa that floors to 10 rolls the exponent", () => {
    expect(fmt(new Decimal("9.9999e20"), sci).text).toBe("9.99e20");
    expect(fmt(new Decimal("9.99999999999999e20"), sci).text).not.toMatch(/^10/);
  });

  test("an exponent of 1,000 or more is printed with separators", () => {
    expect(fmt(new Decimal("1.5e999"), sci).text).toBe("1.50e999");
    expect(fmt(new Decimal("1.5e1000"), sci).text).toBe("1.50e1,000");
    expect(fmt(new Decimal("2e123456"), sci).suffix).toBe("e123,456");
  });

  test("the suffix notation's own scientific range keeps its exponent ungrouped, as before", () => {
    expect(fmt(new Decimal("1.5e1000")).text).toBe("1.50e1000");
    expect(fmt(new Decimal("2e123456")).suffix).toBe("e123456");
  });

  test("the default plain range is the suffix notation's", () => {
    expect(fmt(150_000, { notation: "scientific" }).text).toBe("1.50e5");
    expect(fmt(99_999, { notation: "scientific" }).text).toBe("99,999");
  });

  test("decimalsBelow limits decimals to values under it", () => {
    expect(fmt(12.5, { decimals: 1, decimalsBelow: 100 }).text).toBe("12.5");
    expect(fmt(1234.5, { decimals: 1, decimalsBelow: 100 }).text).toBe("1,234");
    expect(fmt(1234.5, { decimals: 1 }).text).toBe("1,234.5");
  });
});

describe("the printers", () => {
  test("times: two decimals below 100, none from 100", () => {
    expect(fmtTimes(3.2)).toBe("×3.20");
    expect(fmtTimes(150)).toBe("×150");
    expect(fmtTimes(new Decimal("1.239e45"), { notation: "scientific", plainBelow: 1e6 })).toBe("×1.23e45");
  });

  test("plus: two decimals", () => {
    expect(fmtPlus(0.5)).toBe("+0.50");
    expect(fmtPlus(1234.567)).toBe("+1,234.56");
  });

  test("rate: one decimal below 100, none from 100", () => {
    expect(fmtRate(12.5)).toBe("12.5/s");
    expect(fmtRate(250)).toBe("250/s");
  });

  test("counted: the singular exactly at 1", () => {
    expect(fmtCounted(1, ["gem", "gems"])).toBe("1 gem");
    expect(fmtCounted(2, ["gem", "gems"])).toBe("2 gems");
    expect(fmtCounted(0, ["gem", "gems"])).toBe("0 gems");
    expect(fmtCounted(1.5, ["gem", "gems"])).toBe("1 gems");
  });

  test("played: hours and minutes from an hour, minutes and seconds under; negative is zero", () => {
    expect(fmtPlayed((4 * 60 + 25) * 60_000)).toBe("4h 25m");
    expect(fmtPlayed(12 * 60_000 + 3000)).toBe("12m 03s");
    expect(fmtPlayed(-5000)).toBe("0m 00s");
  });

  test("formatter binds the options to every printer", () => {
    const f = formatter({ notation: "scientific", plainBelow: 1e6 });
    expect(f.num(2.5e9)).toBe("2.50e9");
    expect(f.num(12.345, 1)).toBe("12.3");
    expect(f.times(2e9)).toBe("×2.00e9");
    expect(f.plus(2e9)).toBe("+2.00e9");
    expect(f.rate(2e9)).toBe("2.00e9/s");
    expect(f.counted(1, ["a", "b"])).toBe("1 a");
    expect(formatter().num(1.52e6)).toBe("1.52M");
  });
});
