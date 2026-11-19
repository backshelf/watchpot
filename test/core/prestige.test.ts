import { describe, expect, test } from "bun:test";
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  D,
  defineCurrencies,
  defineFeature,
  defineGame,
  definePrestige,
  flushSave,
  lifetimeMultiplier,
  nextFloat,
  type PrestigeMilestoneDef,
  powerGain,
  type RngState,
  resetPace,
  serialize,
  vocab,
} from "watchpot/core";
import { generator, T0, wallet } from "./toy";

const memory = () => createGameStorage(createMemoryBackend(), { debounceMs: 0, onError: () => {} });

/** The prestige primitive over the toy's wallet and generator: shards for every 100 gold earned this run. */

function toyWithLayer(extra: { canReset?: boolean } = {}) {
  const seen: { run: number; gain: string; draw: number }[] = [];
  const layer = definePrestige({
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
    const layer = definePrestige({
      key: "ascension",
      reach: [wallet, generator],
      gain: (s) => powerGain(s.wallet.lifetime, { k: 1, exp: 1, per: 100 }),
      beforeReset: (_s, now) => void hooks.push(now),
    });
    // A feature that resets for the player once a reset would pay three or more.
    const auto = defineFeature({
      key: "auto",
      reach: [wallet, layer],
      initial: () => ({ fired: 0 }),
      reset: "never",
      steps: {
        automate: {
          reset: (d, ctx) => {
            if (d.wallet.lifetime.lt(300)) return;
            if (layer.draft.reset(d, { now: ctx.now, resetRun: ctx.resetRun })) d.auto.fired += 1;
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

describe("the reset pace", () => {
  /** A layer paying one unit per gold earned this run, over the toy's generator (a gold a second). */
  function paced() {
    const layer = definePrestige({
      key: "ascension",
      reach: [wallet, generator],
      gain: (s) => powerGain(s.wallet.lifetime, { k: 1, exp: 1, per: 1 }),
      pace: { past: 0.8, floorS: 10 },
    });
    const game = defineGame({
      id: "toy-pace",
      save: { key: "toy-pace.save", version: 1 },
      features: [wallet, generator, layer],
    });
    const store = createIdleStore(game, { storage: memory(), now: () => T0, seed: "pace" });
    store.getState().catchUp(T0);
    return { store, layer };
  }

  test("keeps the run's best pace and serves the pace, its share of the best and whether the run is past it", () => {
    const { store } = paced();
    let peak = 0;
    let past = -1;
    for (let i = 1; i <= 60; i++) {
      store.getState().tick(1000, T0 + i * 1000);
      const s = store.getState().ascension;
      // The peak never falls inside a run, and the pace never stands above it once a pass has run.
      expect(s.peak).toBeGreaterThanOrEqual(peak);
      peak = s.peak;
      expect(s.pace).toBeLessThanOrEqual(s.peak);
      expect(s.peakShare).toBeGreaterThan(0);
      expect(s.peakShare).toBeLessThanOrEqual(1);
      // Past the peak exactly when the pace has fallen under `past` of the best.
      expect(s.pastPeak).toBe(s.peakShare < 0.8);
      if (s.pastPeak && past < 0) past = i;
    }
    // Nothing is past its peak inside the floor; this run (a steady gold a second) gets there soon after.
    expect(past).toBeGreaterThan(10);
    expect(past).toBeLessThan(60);
  });

  test("a reset starts the run: the run start lands on the reset's time and the peak on zero", () => {
    const { store, layer } = paced();
    for (let i = 1; i <= 20; i++) store.getState().tick(1000, T0 + i * 1000);
    expect(store.getState().ascension.peak).toBeGreaterThan(0);
    expect(store.getState().ascension.runStart).toBe(T0);
    expect(store.getState().ascension.reset(T0 + 20_000)).toBe(true);
    const s = store.getState().ascension;
    expect(s.runStart).toBe(T0 + 20_000);
    expect(s.peak).toBe(0);
    expect(s.pastPeak).toBe(false);
    expect(layer.select.runSeconds(store.getState(), T0 + 25_000)).toBe(5);
  });

  test("select answers at any moment: the gain, the held currency, the pace at a given time", () => {
    const { store, layer } = paced();
    for (let i = 1; i <= 5; i++) store.getState().tick(1000, T0 + i * 1000);
    const s = store.getState();
    expect(layer.select.gain(s).eq(s.wallet.lifetime.floor())).toBe(true);
    expect(layer.select.pace(s, T0 + 5000)).toBeCloseTo(s.ascension.pace, 9);
    expect(layer.select.held(s).eq(0)).toBe(true);
    store.getState().ascension.reset(T0 + 5000);
    expect(layer.select.held(store.getState()).eq(store.getState().ascension.currency)).toBe(true);
    expect(layer.def).toMatchObject({
      action: "reset",
      depth: 1,
      pace: { past: 0.8, floorS: 10 },
      payInto: null,
    });
  });

  test("a deeper reset starts a shallower layer's run too; a shallower one leaves a deeper layer's run alone", () => {
    const low = definePrestige({
      key: "low",
      reach: [wallet],
      gain: (s) => powerGain(s.wallet.lifetime, { k: 1, exp: 1, per: 1 }),
      reset: { depth: 2 },
    });
    const high = definePrestige({
      key: "high",
      reach: [low],
      gain: (s) => s.low.lifetime,
      depth: 2,
    });
    const game = defineGame({
      id: "toy-layers",
      save: { key: "toy-layers.save", version: 1 },
      features: [wallet, generator, low, high],
    });
    const store = createIdleStore(game, { storage: memory(), now: () => T0 });
    store.getState().catchUp(T0);
    store.getState().wallet.earn(10);
    expect(store.getState().low.reset(T0 + 1000)).toBe(true);
    expect(store.getState().low.runStart).toBe(T0 + 1000);
    expect(store.getState().high.runStart).toBe(T0);
    expect(store.getState().high.reset(T0 + 2000)).toBe(true);
    expect(store.getState().high.runStart).toBe(T0 + 2000);
    expect(store.getState().low.runStart).toBe(T0 + 2000);
    // The low layer's own rule still ran: a depth-2 reset starts its state over.
    expect(store.getState().low.lifetime.eq(0)).toBe(true);
    expect(store.getState().high.currency.eq(10)).toBe(true);
  });

  test("refuses a past share outside (0, 1] and a game step that takes the layer's own name", () => {
    const gain = () => D(0);
    expect(() => definePrestige({ key: "p", gain, pace: { past: 0 } })).toThrow(/pace.past/);
    expect(() => definePrestige({ key: "p", gain, pace: { past: 1.5 } })).toThrow(/pace.past/);
    expect(() => definePrestige({ key: "p", gain, steps: { settle: { pace: () => {} } } })).toThrow(
      /settle step "pace"/,
    );
  });
});

describe("the auto-player's move", () => {
  test("a layer with no worth declares no move; with one, a free move that presses the reset", () => {
    const bare = definePrestige({ key: "ascension", reach: [wallet], gain: (s) => s.wallet.lifetime });
    expect(bare.moves).toBeUndefined();
    const layer = definePrestige({
      key: "ascension",
      action: "ascend",
      reach: [wallet],
      gain: (s) => powerGain(s.wallet.lifetime, { k: 1, exp: 1, per: 100 }),
      worth: (s) => (s.ascension.pastPeak ? 2 : 0),
    });
    const game = defineGame({
      id: "toy-move",
      save: { key: "toy-move.save", version: 1 },
      features: [wallet, generator, layer],
    });
    const store = createIdleStore(game, { storage: memory(), now: () => T0 });
    store.getState().catchUp(T0);
    store.getState().wallet.earn(500);
    const [move] = layer.moves?.(store.getState() as never) ?? [];
    expect(move?.id).toBe("ascension.ascend");
    expect(move?.cost).toBeUndefined();
    expect(move?.worth?.(store.getState() as never)).toBe(store.getState().ascension.pastPeak ? 2 : 0);
    expect(move?.apply(store as never)).toBe(true);
    expect(store.getState().ascension.runs).toBe(1);
  });
});

describe("paying into a wallet", () => {
  const WORDS = vocab({ currencies: ["gold", "shards"], stats: [], rarities: ["common"] } as const);
  const purse = defineCurrencies({
    key: "purse",
    vocab: WORDS,
    depth: { shards: "never" },
    earnedThisRun: { gold: "goldThisRun" },
    earnedEver: { shards: "shardsEver" },
  });
  const layer = definePrestige({
    key: "ascension",
    action: "ascend",
    reach: [purse],
    payInto: { wallet: purse, currency: "shards" },
    gain: (s) => powerGain(s.purse.goldThisRun, { k: 1, exp: 1, per: 100 }),
  });
  const game = defineGame({
    id: "toy-pay",
    save: { key: "toy-pay.save", version: 1 },
    features: [purse, layer],
    vocab: WORDS,
  });

  test("the reset credits the wallet's currency after the run resets, and the layer keeps no balance of its own", () => {
    const store = createIdleStore(game, { storage: memory(), now: () => T0 });
    store.getState().catchUp(T0);
    store.getState().purse.credit("gold", 450);
    expect(store.getState().ascension.ascend()).toBe(true);
    const s = store.getState();
    expect(s.purse.shards.eq(4)).toBe(true);
    expect(s.purse.shardsEver.eq(4)).toBe(true);
    expect(s.purse.gold.eq(0)).toBe(true);
    expect(s.ascension.lifetime.eq(4)).toBe(true);
    expect("currency" in s.ascension).toBe(false);
    // One home for what is held: the wallet, and `select.held` reads it there.
    expect(layer.select.held(s).eq(s.purse.shards)).toBe(true);
    expect(layer.def.payInto).toEqual({ wallet: "purse", currency: "shards" });
  });

  test("refuses a currency the wallet lacks, or one the layer's own reset would wipe", () => {
    const shallow = defineCurrencies({ key: "shallow", vocab: WORDS });
    const gain = () => D(0);
    expect(() =>
      definePrestige({ key: "p", gain, payInto: { wallet: shallow, currency: "shards" } }),
    ).toThrow(/wiped by a reset of depth 1/);
    expect(() =>
      // @ts-expect-error not a currency of the wallet
      definePrestige({ key: "p", gain, payInto: { wallet: shallow, currency: "keys" } }),
    ).toThrow(/no currency "keys"/);
    const two = defineCurrencies({ key: "two", vocab: WORDS, depth: { shards: 2 } });
    expect(() =>
      definePrestige({ key: "p", gain, payInto: { wallet: two, currency: "shards" } }),
    ).not.toThrow();
    expect(() =>
      definePrestige({ key: "p", gain, depth: 2, payInto: { wallet: two, currency: "shards" } }),
    ).toThrow();
  });
});

describe("milestones", () => {
  /** A layer paying one shard per hundred gold this run, its milestones as given, over `backend`. */
  function milestoned(milestones: readonly PrestigeMilestoneDef[], backend = createMemoryBackend()) {
    const layer = definePrestige({
      key: "ascension",
      action: "ascend",
      reach: [wallet, generator],
      gain: (s) => powerGain(s.wallet.lifetime, { k: 1, exp: 1, per: 100 }),
      milestones,
    });
    const game = defineGame({
      id: "toy-milestones",
      save: { key: "toy-milestones.save", version: 1 },
      features: [wallet, generator, layer],
    });
    const store = createIdleStore(game, {
      storage: createGameStorage(backend, { debounceMs: 0, onError: () => {} }),
      now: () => T0,
      seed: "milestones",
    });
    store.getState().catchUp(T0);
    return { store, layer, game, backend };
  }

  test("fifty resets at the least gain never reach a milestone above that gain", () => {
    const { store, layer } = milestoned([
      { id: "best-5", at: 5 },
      { id: "runs-50", at: 50, on: "runs" },
    ]);
    // The least gain: a hundred gold, one shard, every run.
    for (let i = 0; i < 50; i++) {
      store.getState().wallet.earn(100);
      expect(store.getState().ascension.ascend()).toBe(true);
    }
    const s = store.getState();
    expect(s.ascension.runs).toBe(50);
    expect(s.ascension.best.eq(1)).toBe(true);
    // The reset count is farmable this way, which is why it is not the default: the best gain is not.
    expect(layer.select.reached(s, "runs-50")).toBe(true);
    expect(layer.select.reached(s, "best-5")).toBe(false);
  });

  test("total, runs and seconds each reach when they should", () => {
    const { store, layer } = milestoned([
      { id: "total-3", at: 3, on: "total" },
      { id: "runs-2", at: 2, on: "runs" },
      { id: "seconds-5", at: 5, on: "seconds" },
    ]);
    const reached = (id: string) => layer.select.reached(store.getState(), id);
    for (let i = 1; i <= 3; i++) {
      store.getState().wallet.earn(100);
      store.getState().ascension.ascend();
      expect(reached("total-3")).toBe(i === 3);
      expect(reached("runs-2")).toBe(i >= 2);
    }
    expect(reached("seconds-5")).toBe(false);
    // Seconds reach while the run waits: the settle step sees them pass, with no reset.
    for (let i = 1; i <= 6; i++) store.getState().tick(1000, T0 + i * 1000);
    expect(reached("seconds-5")).toBe(true);
  });

  test("a reached milestone stays reached through later resets and a save", () => {
    const { store, layer, game, backend } = milestoned([{ id: "first", at: 1 }]);
    store.getState().wallet.earn(100);
    store.getState().ascension.ascend();
    expect(layer.select.reached(store.getState(), "first")).toBe(true);
    store.getState().wallet.earn(100);
    store.getState().ascension.ascend();
    expect(store.getState().ascension.runs).toBe(2);
    expect(layer.select.reached(store.getState(), "first")).toBe(true);
    flushSave(store);

    const reloaded = createIdleStore(game, {
      storage: createGameStorage(backend, { debounceMs: 0, onError: () => {} }),
      now: () => T0,
      seed: "milestones",
    });
    const s = reloaded.getState();
    expect(s.ascension.runs).toBe(2);
    expect(s.ascension.best.eq(1)).toBe(true);
    expect(s.ascension.milestones).toEqual(["first"]);
    expect(layer.select.reached(s, "first")).toBe(true);
  });

  test("a save from before best and milestones loads with 0 and none, and plays", () => {
    const backend = createMemoryBackend();
    backend.setItem(
      "toy-milestones.save",
      serialize({
        version: 1,
        state: {
          ascension: {
            runs: 4,
            lifetime: "10",
            currency: "2",
            runStart: T0 - 2000,
            peak: 0,
            paceAt: T0 - 2000,
          },
        },
      }),
    );
    const { store, layer } = milestoned([{ id: "runs-5", at: 5, on: "runs" }], backend);
    const s = store.getState();
    expect(s.ascension.runs).toBe(4);
    expect(s.ascension.lifetime.eq(10)).toBe(true);
    expect(s.ascension.best.eq(0)).toBe(true);
    expect(s.ascension.milestones).toEqual([]);
    // It plays: the fifth reset is the one the milestone waits for.
    store.getState().wallet.earn(100);
    expect(store.getState().ascension.ascend()).toBe(true);
    expect(layer.select.reached(store.getState(), "runs-5")).toBe(true);
    expect(store.getState().ascension.best.eq(1)).toBe(true);
  });

  test("refuses a repeated id, an at not above 0 and an unknown count", () => {
    const gain = () => D(0);
    expect(() =>
      definePrestige({
        key: "p",
        gain,
        milestones: [
          { id: "m", at: 1 },
          { id: "m", at: 2 },
        ],
      }),
    ).toThrow(/declared twice/);
    expect(() => definePrestige({ key: "p", gain, milestones: [{ id: "m", at: 0 }] })).toThrow(/above 0/);
    expect(() =>
      definePrestige({
        key: "p",
        gain,
        // @ts-expect-error not a count a milestone knows
        milestones: [{ id: "m", at: 1, on: "gold" }],
      }),
    ).toThrow(/unknown "gold"/);
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
