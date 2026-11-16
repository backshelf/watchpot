import { describe, expect, setSystemTime, test } from "bun:test";
import { nextFloat, nextInt, pickWeighted, type RngState, randomSeed, seedRng } from "watchpot/core";

/** A random source that yields the same sequence each time it is made. */
const counter = () => {
  let i = 0;
  return () => (i++ % 7) / 7;
};

describe("rng", () => {
  test("the same seed gives the same sequence", () => {
    let a = seedRng("whale");
    let b = seedRng("whale");
    for (let i = 0; i < 100; i++) {
      const [x, na] = nextFloat(a);
      const [y, nb] = nextFloat(b);
      expect(x).toBe(y);
      a = na;
      b = nb;
    }
  });

  test("different seeds differ and floats stay in [0, 1)", () => {
    const [x] = nextFloat(seedRng("a"));
    const [y] = nextFloat(seedRng("b"));
    expect(x).not.toBe(y);
    let s: RngState = seedRng(1);
    for (let i = 0; i < 1000; i++) {
      const [f, n] = nextFloat(s);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      s = n;
    }
  });

  test("nextInt covers the range and pickWeighted skips zero weights", () => {
    let s = seedRng("ints");
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const [v, n] = nextInt(s, 5);
      seen.add(v);
      s = n;
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
    for (let i = 0; i < 500; i++) {
      const [idx, n] = pickWeighted(s, [0, 1, 0, 3]);
      expect([1, 3]).toContain(idx);
      s = n;
    }
  });

  test("state is a serialisable tuple", () => {
    const s = seedRng("x");
    const back = JSON.parse(JSON.stringify(s)) as RngState;
    expect(back).toHaveLength(4);
    expect(nextFloat(back)).toEqual(nextFloat(s));
  });

  test("randomSeed is a function of the wall time and the random source it is handed", () => {
    setSystemTime(new Date(Date.UTC(2026, 0, 1)));
    const a = randomSeed(1234, counter());
    setSystemTime(new Date(Date.UTC(2027, 5, 15)));
    const b = randomSeed(1234, counter());
    setSystemTime();
    expect(a).toEqual(b);
    const c = randomSeed(1235, counter());
    expect(c).not.toEqual(a);
    expect(c).toHaveLength(4);
  });
});
