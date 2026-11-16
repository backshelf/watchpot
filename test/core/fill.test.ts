import { describe, expect, test } from "bun:test";
import { D, Decimal, fillDeep } from "watchpot/core";

const fresh = () => ({
  a: 1,
  box: { x: 1, y: 2, deep: { gold: D(5), n: 0 } },
  items: { one: 1 } as Record<string, number>,
  list: [1, 2],
});

describe("fillDeep", () => {
  test("fills a missing key two levels down and keeps what was saved", () => {
    const out = fillDeep({ box: { x: 9, deep: { n: 4 } } }, fresh());
    expect(out.box.x).toBe(9);
    expect(out.box.y).toBe(2);
    expect(out.box.deep.n).toBe(4);
    expect(out.a).toBe(1);
  });

  test("coerces a saved number or string into a Decimal three levels down", () => {
    expect(fillDeep({ box: { deep: { gold: 7 } } }, fresh()).box.deep.gold).toBeInstanceOf(Decimal);
    expect(fillDeep({ box: { deep: { gold: "1e50" } } }, fresh()).box.deep.gold.eq("1e50")).toBe(true);
  });

  test("an id-keyed record keeps keys fresh lacks", () => {
    const out = fillDeep({ items: { one: 3, two: 4 } }, fresh());
    expect(out.items).toEqual({ one: 3, two: 4 });
  });

  test("an array is a leaf: the saved one wins whole", () => {
    expect(fillDeep({ list: [9] }, fresh()).list).toEqual([9]);
  });

  test("a saved value that is not a plain object gives fresh itself", () => {
    const f = fresh();
    for (const junk of [null, undefined, 3, "x", [1]]) expect(fillDeep(junk, f)).toBe(f);
  });

  test("nothing is mutated", () => {
    const f = fresh();
    const saved = { box: { x: 9, deep: { gold: 7 } } };
    const savedCopy = structuredClone(saved);
    const out = fillDeep(saved, f);
    expect(out).not.toBe(f);
    expect(f.box.x).toBe(1);
    expect(f.box.deep.gold.eq(5)).toBe(true);
    expect(saved).toEqual(savedCopy);
  });
});
