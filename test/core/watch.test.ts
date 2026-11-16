import { describe, expect, test } from "bun:test";
import { D } from "../../src/core/decimal";
import { crossedMark, newKeys, type WatchRule, watchChanges } from "../../src/core/watch";

interface S {
  runs: number;
  played: number;
  owned: Record<string, number>;
  big: string;
}

/** A store as the watch reads it: `set` hands every listener the new state and the old. */
function storeOf(state: S) {
  let s = state;
  const listeners = new Set<(n: S, p: S) => void>();
  return {
    set(patch: Partial<S>) {
      const prev = s;
      s = { ...s, ...patch };
      for (const l of listeners) l(s, prev);
    },
    subscribe(l: (n: S, p: S) => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

type E = { type: "run"; at: number } | { type: "first"; id: string } | { type: "best"; v: string };

const fresh = (): S => ({ runs: 0, played: 0, owned: {}, big: "1" });

describe("watchChanges", () => {
  test("runs every rule on every change and sends their events in order", () => {
    const store = storeOf(fresh());
    let t = 10_000;
    const got: E[] = [];
    const runs: WatchRule<S, E> = (n, p, emit) => {
      if (n.runs > p.runs) emit({ type: "run", at: n.runs });
    };
    const firsts: WatchRule<S, E> = (n, p, emit) => {
      for (const id of newKeys(p.owned, n.owned)) emit({ type: "first", id });
    };
    watchChanges(store, { rules: [runs, firsts], on: (e) => got.push(e), now: () => t, settleMs: 0 });
    t += 1;
    store.set({ runs: 1, owned: { a: 1 } });
    expect(got).toEqual([
      { type: "run", at: 1 },
      { type: "first", id: "a" },
    ]);
  });

  test("a store that counts its profile swaps has a swapped profile settled with no jump test of the game's", () => {
    const base = storeOf(fresh());
    let swaps = 0;
    const store = { ...base, profileSwaps: () => swaps };
    let t = 10_000;
    const got: E[] = [];
    watchChanges<S, E>(store, {
      rules: [
        (n, p, emit) => {
          if (n.runs > p.runs) emit({ type: "run", at: n.runs });
        },
      ],
      on: (e) => got.push(e),
      now: () => t,
      startMs: 0,
    });
    base.set({ runs: 1 });
    // An import: the count moves, then the change is published. Nothing it brought is news.
    swaps += 1;
    base.set({ runs: 40 });
    t += 500;
    base.set({ runs: 41 });
    expect(got).toEqual([{ type: "run", at: 1 }]);
    t += 5000;
    base.set({ runs: 42 });
    expect(got).toEqual([
      { type: "run", at: 1 },
      { type: "run", at: 42 },
    ]);
  });

  test("settles at the start and after a jump: rules run, nothing goes out, bests are forgotten", () => {
    const store = storeOf(fresh());
    let t = 0;
    const got: E[] = [];
    let ranSettling = 0;
    const best: WatchRule<S, E> = (n, _p, emit, tools) => {
      if (tools.settling) ranSettling++;
      if (tools.best("big", n.big)) emit({ type: "best", v: n.big });
    };
    watchChanges(store, {
      rules: [best],
      on: (e) => got.push(e),
      now: () => t,
      settleMs: 1000,
      jumped: (n, p) => n.played < p.played,
    });
    store.set({ big: "5", played: 1 });
    expect(got).toEqual([]);
    expect(ranSettling).toBe(1);

    t = 1000;
    store.set({ big: "1e400", played: 2 });
    expect(got).toEqual([{ type: "best", v: "1e400" }]);

    // A load: the clock went back. Nothing for a while, and the old best is gone.
    store.set({ played: 0 });
    t = 1500;
    store.set({ big: "1e500", played: 1 });
    expect(got).toHaveLength(1);
    t = 2100;
    store.set({ big: "1e450", played: 2 });
    // 1e450 is below the 1e500 seen while settling, which set the new best.
    expect(got).toHaveLength(1);
    store.set({ big: "1e600", played: 3 });
    expect(got.at(-1)).toEqual({ type: "best", v: "1e600" });
  });

  test("best hands back the best it beat, past 1e308, and nothing for a first sighting or a tie", () => {
    const store = storeOf(fresh());
    const beat: (string | undefined)[] = [];
    watchChanges<S, E>(store, {
      rules: [(n, _p, _e, tools) => beat.push(tools.best("big", n.big)?.toString())],
      on: () => {},
      settleMs: 0,
    });
    for (const big of ["0", "0", "1e400", "1e300", "1e500"]) store.set({ big });
    expect(beat).toEqual([undefined, undefined, "0", undefined, D("1e400").toString()]);
  });

  test("startMs sets the first window apart from settleMs", () => {
    const store = storeOf(fresh());
    let t = 0;
    const got: E[] = [];
    watchChanges<S, E>(store, {
      rules: [(n, _p, emit) => emit({ type: "run", at: n.runs })],
      on: (e) => got.push(e),
      now: () => t,
      settleMs: 1000,
      startMs: 100,
      jumped: (n, p) => n.played < p.played,
    });
    t = 100;
    store.set({ runs: 1, played: 1 });
    expect(got).toHaveLength(1);
    store.set({ played: 0 });
    t = 1099;
    store.set({ runs: 2, played: 1 });
    expect(got).toHaveLength(1);
  });

  test("whileSettling skip leaves rules and their tools alone until the window ends; an entry can opt back in", () => {
    const store = storeOf(fresh());
    let t = 0;
    const got: E[] = [];
    let acked = 0;
    watchChanges<S, E>(store, {
      rules: [
        (n, _p, emit, tools) => {
          if (tools.spare("k", 10_000)) emit({ type: "run", at: n.runs });
          if (tools.best("big", n.big)) emit({ type: "best", v: n.big });
        },
        {
          whileSettling: "run",
          rule: (_n, _p, _e, tools) => {
            if (tools.settling) acked++;
          },
        },
      ],
      on: (e) => got.push(e),
      now: () => t,
      settleMs: 1000,
      whileSettling: "skip",
    });
    store.set({ runs: 1, big: "1e9" });
    expect(acked).toBe(1);
    t = 1000;
    // The load's 1e9 was never seen: 5 is the first sighting, and spare was not used up.
    store.set({ runs: 2, big: "5" });
    store.set({ runs: 3, big: "6" });
    expect(got).toEqual([
      { type: "run", at: 2 },
      { type: "best", v: "6" },
    ]);
  });

  test("spare says yes once per window per kind; streak counts a quick run and resets after a pause", () => {
    const store = storeOf(fresh());
    let t = 0;
    const said: boolean[] = [];
    const steps: number[] = [];
    const rule: WatchRule<S, E> = (_n, _p, _e, tools) => {
      said.push(tools.spare("k", 100));
      steps.push(tools.streak("buy", 50));
    };
    watchChanges(store, { rules: [rule], on: () => {}, now: () => t, settleMs: 0 });
    for (const at of [0, 40, 80, 100, 300]) {
      t = at;
      store.set({ runs: at });
    }
    expect(said).toEqual([true, false, false, true, true]);
    expect(steps).toEqual([0, 1, 2, 3, 0]);
  });

  test("a rule that throws is reported and the rest still run; stop() unsubscribes", () => {
    const store = storeOf(fresh());
    const errors: unknown[] = [];
    const got: E[] = [];
    const watch = watchChanges<S, E>(store, {
      rules: [
        () => {
          throw new Error("bad rule");
        },
        (n, _p, emit) => emit({ type: "run", at: n.runs }),
      ],
      on: (e) => got.push(e),
      onError: (e) => errors.push(e),
      settleMs: 0,
    });
    store.set({ runs: 1 });
    expect(errors).toHaveLength(1);
    expect(got).toHaveLength(1);
    watch.stop();
    store.set({ runs: 2 });
    expect(got).toHaveLength(1);
  });
});

describe("crossedMark", () => {
  test("is the highest mark passed, in any order, and none when nothing was passed", () => {
    expect(crossedMark([25, 10, 50], 9, 30)).toBe(25);
    expect(crossedMark([10, 25, 50], 10, 24)).toBeUndefined();
    expect(crossedMark([10, 25], 30, 40)).toBeUndefined();
    expect(crossedMark([10], 9, 10)).toBe(10);
  });

  test("compares Decimals past 1e308", () => {
    expect(crossedMark(["1e400", "1e500"], D("1e300"), D("1e450"))).toBe("1e400");
  });
});

describe("newKeys", () => {
  test("lists what appeared, in the new record's order", () => {
    expect(newKeys({ a: 1 }, { a: 1, c: 0, b: 2 })).toEqual(["c", "b"]);
    expect(newKeys(undefined, { a: 1 })).toEqual(["a"]);
    expect(newKeys({ a: 1 }, undefined)).toEqual([]);
  });
});
