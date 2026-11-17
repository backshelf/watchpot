import { describe, expect, test } from "bun:test";
import { defineKnobs } from "watchpot/core";
import { tunables } from "watchpot/sim";

const spec = {
  growth: { value: 1.15, label: "Growth", group: "Prices", min: 1, max: 2, step: 0.01, unit: "x" },
  delay: { value: 500, label: "Delay", group: "Timing", unit: "ms" },
} as const;

describe("defineKnobs", () => {
  test("defaults and saved override", () => {
    expect(defineKnobs(spec).defaults()).toEqual({ growth: 1.15, delay: 500 });
    const k = defineKnobs(spec, { delay: 900 });
    expect(k.defaults()).toEqual({ growth: 1.15, delay: 900 });
    expect(k.get("delay")).toBe(900);
    const copy = k.defaults() as { delay: number };
    copy.delay = 1;
    expect(k.defaults().delay).toBe(900);
  });

  test("bound to tunables records first reads; bind(null) restores", () => {
    const k = defineKnobs(spec);
    const t = tunables({ ...k.defaults(), delay: 100 });
    k.bind(t);
    expect(k.get("delay")).toBe(100);
    expect(k.get("growth")).toBe(1.15);
    expect(Object.keys(t.firstRead()).sort()).toEqual(["delay", "growth"]);
    k.bind(null);
    expect(k.get("delay")).toBe(500);
  });

  test("binding replaces an earlier one; a non-number throws", () => {
    const k = defineKnobs(spec);
    k.bind({ values: { growth: 1, delay: 1 } });
    k.bind({ values: { growth: 2, delay: "x" } });
    expect(k.get("growth")).toBe(2);
    expect(() => k.get("delay")).toThrow(/number/);
  });

  test("throws", () => {
    const k = defineKnobs(spec);
    // @ts-expect-error not a knob
    expect(() => k.get("nope")).toThrow('knobs: no knob "nope"');
    // @ts-expect-error not a key
    expect(() => k.get(0)).toThrow();
    expect(() => defineKnobs(spec, { nope: 1 })).toThrow('knobs: saved value for "nope" names no knob');
    expect(() => defineKnobs(spec, { delay: Number.NaN })).toThrow(/finite/);
    expect(() => defineKnobs({ a: { value: Number.POSITIVE_INFINITY, label: "a", group: "g" } })).toThrow(
      /finite/,
    );
    expect(() => defineKnobs({ a: { value: 1, label: "a", group: "g", min: 3, max: 2 } })).toThrow(/min/);
    expect(() => defineKnobs({ a: { value: 1, label: "a", group: "g", step: 0 } })).toThrow(/step/);
  });
});
