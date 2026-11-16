import { describe, expect, test } from "bun:test";
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  D,
  defineGame,
  feature,
  lifetimeMultiplier,
  nextFloat,
  powerGain,
  prestige,
  type RngState,
  resetPace,
} from "watchpot/core";
import { generator, T0, wallet } from "./toy";

/** The prestige primitive over the toy's wallet and generator: shards for every 100 gold earned this run. */

function toyWithLayer(extra: { canReset?: boolean } = {}) {
  const seen: { run: number; gain: string; draw: number }[] = [];
  const layer = prestige({
    key: "ascension",
    action: "ascend",
    reach: [wallet, generator],
    initial: () => ({ lastGain: "0" }),
    gain: (s) => powerGain(s.wallet.lifetime, { k: 1, exp: 1, per: 100 }),
    ...(extra.canReset === false ? { canReset: () => false } : {}),
    afterReset: (s, { gain, run }) => {
      s.ascension.lastGain = gain.toString();
      seen.push({ run, gain: gain.toString(), draw: nextFloat(s.generator.rng as RngState)[0] });
    },
    actions: (api) => ({ shards: () => api.get().ascension.currency.toNumber() }),
  });
  const game = defineGame({
    id: "toy-prestige",
    save: { key: "toy-prestige.save", version: 1 },
    features: [wallet, generator, layer],
  });
  const store = createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend(), { debounceMs: 0, onError: () => {} }),
    now: () => T0,
    seed: "prestige",
  });
  store.getState().catchUp(T0);
  return { store, seen };
}

describe("the prestige primitive", () => {
  test("pays the gain into currency and lifetime, resets the run and counts it", () => {
    const { store, seen } = toyWithLayer();
    store.getState().wallet.earn(450);
    expect(store.getState().ascension.ascend()).toBe(true);
    const s = store.getState();
    expect(s.ascension.runs).toBe(1);
    expect(s.ascension.currency.eq(4)).toBe(true);
    expect(s.ascension.lifetime.eq(4)).toBe(true);
    expect(s.ascension.lastGain).toBe("4");
    expect(s.ascension.shards()).toBe(4);
    // The run is back to its initial state.
    expect(s.wallet.gold.eq(10)).toBe(true);
    expect(s.wallet.lifetime.eq(0)).toBe(true);
    expect(seen.map((r) => r.run)).toEqual([1]);
  });

  test("carries lifetime across resets while currency is spent", () => {
    const { store } = toyWithLayer();
    store.getState().wallet.earn(300);
    store.getState().ascension.ascend();
    store.setState((s) => {
      s.ascension.currency = s.ascension.currency.sub(3);
    });
    store.getState().wallet.earn(200);
    store.getState().ascension.ascend();
    const s = store.getState().ascension;
    expect(s.runs).toBe(2);
    expect(s.currency.eq(2)).toBe(true);
    expect(s.lifetime.eq(5)).toBe(true);
  });

  test("refuses a reset that pays nothing, or one canReset refuses", () => {
    const { store } = toyWithLayer();
    store.getState().wallet.earn(50);
    expect(store.getState().ascension.ascend()).toBe(false);
    expect(store.getState().ascension.runs).toBe(0);
    expect(store.getState().wallet.gold.eq(60)).toBe(true);

    const refused = toyWithLayer({ canReset: false }).store;
    refused.getState().wallet.earn(1000);
    expect(refused.getState().ascension.ascend()).toBe(false);
    expect(refused.getState().ascension.lifetime.eq(0)).toBe(true);
  });

  test("draws each run from the saved run number, the same on every store with the seed", () => {
    const draws = () => {
      const { store, seen } = toyWithLayer();
      for (let i = 0; i < 2; i++) {
        store.getState().wallet.earn(100);
        store.getState().ascension.ascend();
      }
      return seen.map((r) => r.draw);
    };
    const a = draws();
    expect(a).toEqual(draws());
    expect(a[0]).not.toBe(a[1]);
  });
});

describe("the draft helper", () => {
  test("resets inside a step with the action's checks, gain and hooks", () => {
    const hooks: number[] = [];
    const layer = prestige({
      key: "ascension",
      reach: [wallet, generator],
      gain: (s) => powerGain(s.wallet.lifetime, { k: 1, exp: 1, per: 100 }),
      beforeReset: (_s, now) => void hooks.push(now),
    });
    // A feature that resets for the player once a reset would pay three or more.
    const auto = feature({
      key: "auto",
      reach: [wallet, layer],
      initial: () => ({ fired: 0 }),
      reset: "never",
      steps: {
        automate: {
          reset: (d, ctx) => {
            if (d.wallet.lifetime.lt(300)) return;
            if (layer.resetDraft(d, { now: ctx.now, resetRun: ctx.resetRun })) d.auto.fired += 1;
          },
        },
      },
    });
    const game = defineGame({
      id: "toy-auto",
      save: { key: "toy-auto.save", version: 1 },
      features: [wallet, generator, layer, auto],
    });
    const store = createIdleStore(game, {
      storage: createGameStorage(createMemoryBackend(), { debounceMs: 0, onError: () => {} }),
      now: () => T0,
      seed: "auto",
    });
    store.getState().catchUp(T0);
    store.getState().wallet.earn(250);
    store.getState().tick(1000, T0 + 1000);
    expect(store.getState().auto.fired).toBe(0);
    store.getState().wallet.earn(100);
    store.getState().tick(1000, T0 + 2000);
    const s = store.getState();
    expect(s.auto.fired).toBe(1);
    expect(s.ascension.runs).toBe(1);
    expect(s.ascension.currency.gte(3)).toBe(true);
    expect(s.wallet.lifetime.lt(100)).toBe(true);
    expect(hooks).toEqual([T0 + 2000]);
  });
});

describe("the curves", () => {
  test("powerGain rises with the amount, floors, and is never negative", () => {
    const t = { k: 10, exp: 0.6, per: 1000 };
    expect(powerGain(D(0), t).eq(0)).toBe(true);
    expect(powerGain(D(-5), t).eq(0)).toBe(true);
    expect(powerGain(D(1000), t).eq(10)).toBe(true);
    expect(powerGain(D(4000), t).gt(powerGain(D(2000), t))).toBe(true);
    expect(powerGain(D(1000), { ...t, mult: -1 }).eq(0)).toBe(true);
  });

  test("resetPace is the gain a second while the gain is small, and the leap a second once it dwarfs what is kept", () => {
    // Small beside what is kept: proportional to the gain, and to one over the time.
    const small = resetPace(D(10), D(1e6), 20);
    expect(resetPace(D(20), D(1e6), 20) / small).toBeCloseTo(2, 3);
    expect(resetPace(D(10), D(1e6), 40) / small).toBeCloseTo(0.5, 6);
    // Dwarfing it: the orders of magnitude gained, so a hundredfold more gain is two orders, not a hundred times.
    expect(resetPace(D("1e30"), D(1e10), 10)).toBeCloseTo(2, 6);
    expect(resetPace(D("1e32"), D(1e10), 10)).toBeCloseTo(2.2, 6);
    // Past 1e308 on both sides, a ratio too small for `1 + r`, nothing kept, nothing gained.
    expect(resetPace(D("1e400"), D("1e390"), 5)).toBeCloseTo(2, 6);
    expect(resetPace(D(1), D("1e12"), 1)).toBeGreaterThan(0);
    expect(resetPace(D(1000), D(0), 1)).toBeCloseTo(Math.log10(1001), 6);
    expect(resetPace(D(0), D(5), 1)).toBe(0);
    // Under the floor the seconds do not count, so the pace only rises with the gain.
    expect(resetPace(D(100), D(1), 2, 10)).toBe(resetPace(D(100), D(1), 9, 10));
  });

  test("lifetimeMultiplier is exactly 1 with nothing earned and rises after", () => {
    const t = { k: 0.1, exp: 0.5 };
    expect(lifetimeMultiplier(D(0), t)).toBe(1);
    expect(lifetimeMultiplier(D(100), t)).toBeGreaterThan(lifetimeMultiplier(D(10), t));
  });
});
