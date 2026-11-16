import { describe, expect, test } from "bun:test";
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineFeature,
  defineGame,
  HOUR_MS,
  type InitialReason,
  definePrestige as prestigeLayer,
  ZERO,
} from "watchpot/core";
import { generator, prestige, T0, toyStore, wallet } from "./toy";

/** The two resets: `resetRun` by each feature's rule, `resetProfile` for everything. */

/** A toy caught up at T0, an hour in, with a bought generator and a silver tier unlocked. */
function progressed(seed?: string) {
  const { store } = toyStore({ seed });
  store.getState().catchUp(T0);
  store.getState().tick(1000, T0 + 1000);
  store.getState().generator.buy();
  store.setState((s) => {
    s.generator.unlocked.silver = true;
    s.clock.offsetMs = HOUR_MS;
  });
  return store;
}

describe("resetRun", () => {
  test('"run" goes back to initial, { keep } carries the named keys, "never" is untouched', () => {
    const store = progressed();
    store.getState().wallet.earn(500);
    store.getState().prestige.ascend();
    const s = store.getState();
    expect(s.wallet.gold.eq(10)).toBe(true);
    expect(s.wallet.lifetime.eq(0)).toBe(true);
    expect(s.generator.owned).toBe(1);
    expect(s.generator.unlocked).toEqual({ bronze: true, silver: true });
    expect(s.prestige.runs).toBe(1);
    expect(s.prestige.shards.eq(5)).toBe(true);
  });

  test("the clock's anchors land on now and its offset is kept", () => {
    const store = progressed();
    const at = store.getState().gameNow();
    expect(at).toBe(T0 + HOUR_MS);
    store.getState().resetRun();
    expect(store.getState().clock).toEqual({ lastSeen: at, createdAt: at, offsetMs: HOUR_MS });
  });

  test("a function rule maps the state before and a fresh initial to the state after", () => {
    const settings = defineFeature({
      key: "settings",
      initial: () => ({ theme: "light", volume: 1 }),
      reset: (before, fresh) => ({ ...fresh, theme: before.theme }),
    });
    const game = defineGame({ id: "fn", save: { key: "fn", version: 1 }, features: [settings] });
    const store = createIdleStore(game, {
      storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
      now: () => T0,
    });
    store.setState((s) => {
      s.settings.theme = "dark";
      s.settings.volume = 0;
    });
    store.getState().resetRun();
    expect(store.getState().settings).toMatchObject({ theme: "dark", volume: 1 });
  });

  test("initial sees why it is being made: a new profile has no run start, a reset run starts now", () => {
    const store = progressed();
    expect(store.getState().generator.since).toBe(0);
    store.getState().resetRun({ now: T0 + 5 });
    expect(store.getState().generator.since).toBe(T0 + 5);
    store.getState().resetProfile(T0 + 9);
    expect(store.getState().generator.since).toBe(T0 + 9);
  });

  test("a seeded store's resets draw fixed rngs, different each run; an unseeded one draws entropy", () => {
    const a = progressed("seed");
    const b = progressed("seed");
    const first = a.getState().generator.rng;
    expect(first).toEqual(b.getState().generator.rng);
    a.getState().resetRun();
    b.getState().resetRun();
    expect(a.getState().generator.rng).toEqual(b.getState().generator.rng);
    expect(a.getState().generator.rng).not.toEqual(first);
    const run1 = a.getState().generator.rng;
    a.getState().resetRun();
    expect(a.getState().generator.rng).not.toEqual(run1);
    const c = progressed();
    const before = c.getState().generator.rng;
    c.getState().resetRun();
    expect(c.getState().generator.rng).not.toEqual(before);
  });

  test("a reloaded profile's reset draws as the store that wrote it would: the default label is read off the save", () => {
    const { store: a, backend } = toyStore({ seed: "seed" });
    a.getState().catchUp(T0);
    a.getState().resetRun({ now: T0 + 1000 });
    // A second store on the same save, as after a reload, then each resets once more.
    const { store: b } = toyStore({ seed: "seed", backend });
    a.getState().resetRun({ now: T0 + 2000 });
    b.getState().resetRun({ now: T0 + 2000 });
    expect(b.getState().generator.rng).toEqual(a.getState().generator.rng);
  });

  test("the reasons: new, run, reset, import", () => {
    const seen: InitialReason[] = [];
    const why = defineFeature({
      key: "why",
      initial: (ctx) => {
        seen.push(ctx.reason);
        return { reason: ctx.reason };
      },
    });
    const game = defineGame({ id: "why", save: { key: "why", version: 1 }, features: [why] });
    const store = createIdleStore(game, {
      storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
      now: () => T0,
    });
    store.getState().resetRun();
    store.getState().resetProfile();
    store.getState().importProfile(store.getState().exportProfile());
    // `defineGame` probes `initial` once, and an import makes it twice: adjacent repeats collapse.
    expect(seen.filter((r, i) => r !== seen[i - 1])).toEqual(["new", "run", "reset", "import"]);
  });
});

describe("resetProfile", () => {
  test("every feature back to initial, the never-reset one too; the offset zeroed; anchors at now", () => {
    const store = progressed();
    store.getState().wallet.earn(500);
    store.getState().prestige.ascend();
    store.getState().resetProfile(T0 + 7);
    const s = store.getState();
    expect(s.prestige.runs).toBe(0);
    expect(s.prestige.shards.eq(0)).toBe(true);
    expect(s.generator.unlocked).toEqual({ bronze: true, silver: false });
    expect(s.clock).toEqual({ lastSeen: T0 + 7, createdAt: T0 + 7, offsetMs: 0 });
    expect(s.gameNow()).toBe(T0);
  });

  test("the features keep their actions through both resets", () => {
    const store = progressed();
    store.getState().resetRun();
    store.getState().resetProfile();
    expect(typeof store.getState().wallet.earn).toBe("function");
    expect(typeof store.getState().prestige.ascend).toBe("function");
    expect([wallet, generator, prestige].map((f) => f.key)).toEqual(["wallet", "generator", "prestige"]);
  });
});

describe("reset depths", () => {
  /** Two layers: `lower` resets the run; `upper` resets at depth 2, which also starts `lower` and its shop over. */
  function layered() {
    const run = defineFeature({ key: "run", initial: () => ({ gold: 0 }) });
    const shop = defineFeature({
      key: "shop",
      initial: () => ({ ranks: 0, seen: 0 }),
      reset: { depth: 2, rule: { keep: ["seen"] } },
    });
    const vault = defineFeature({
      key: "vault",
      initial: () => ({ gems: 0, depths: [] as number[] }),
      reset: (before, fresh, ctx) => ({
        ...(ctx.depth === 2 ? fresh : before),
        depths: [...before.depths, ctx.depth ?? 0],
      }),
    });
    const lower = prestigeLayer({ key: "lower", gain: () => ZERO.add(1), reset: { depth: 2 } });
    const upper = prestigeLayer({ key: "upper", gain: () => ZERO.add(1), depth: 2 });
    const game = defineGame({
      id: "depths",
      save: { key: "depths", version: 1 },
      features: [run, shop, vault, lower, upper],
    });
    const store = createIdleStore(game, {
      storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
      now: () => T0,
    });
    store.setState((s) => {
      s.run.gold = 9;
      s.shop.ranks = 3;
      s.shop.seen = 2;
      s.vault.gems = 5;
    });
    return store;
  }

  test("an ordinary reset leaves a { depth: 2 } feature alone; a depth-2 reset follows its rule", () => {
    const store = layered();
    store.getState().lower.reset();
    let s = store.getState();
    expect(s.run.gold).toBe(0);
    expect(s.shop).toMatchObject({ ranks: 3, seen: 2 });
    expect(s.vault.gems).toBe(5);
    expect(s.lower.runs).toBe(1);
    store.setState((d) => {
      d.run.gold = 4;
    });
    store.getState().upper.reset();
    s = store.getState();
    expect(s.run.gold).toBe(0);
    expect(s.shop).toMatchObject({ ranks: 0, seen: 2 });
    expect(s.vault.gems).toBe(0);
    expect(s.vault.depths).toEqual([1, 2]);
    expect(s.lower.runs).toBe(0);
    expect(s.lower.currency.eq(0)).toBe(true);
    expect(s.upper.runs).toBe(1);
    expect(s.upper.currency.eq(1)).toBe(true);
  });

  test("the root action takes a depth, and defineGame refuses a depth below 1", () => {
    const store = layered();
    store.getState().resetRun({ depth: 2 });
    expect(store.getState().shop.ranks).toBe(0);
    const bad = defineFeature({ key: "bad", initial: () => ({ n: 0 }), reset: { depth: 0 } });
    expect(() => defineGame({ id: "bad", save: { key: "bad", version: 1 }, features: [bad] })).toThrow(
      "a reset depth is 1 or more",
    );
  });
});
