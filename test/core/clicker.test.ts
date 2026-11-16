import { describe, expect, test } from "bun:test";
import {
  type BuffsState,
  buffActive,
  buffs,
  clicker,
  clickShare,
  comboAt,
  currencies,
  D,
  type Decimal,
  defineGame,
  vocab,
} from "watchpot/core";
import { autoPlayer, createSimWorld, simStore } from "watchpot/sim";
import { freshStore, T0 } from "watchpot/test";

const WORDS = vocab({ currencies: ["gold", "gems"], stats: [], rarities: ["common"] } as const);
const wallet = currencies({ key: "wallet", vocab: WORDS });
type State = { wallet: { gold: Decimal; gems: Decimal } };

const tap = clicker({
  key: "tap",
  wallet,
  currency: "gold",
  power: (s: State) => clickShare(1, s.wallet.gems, 0.5),
  combo: { windowMs: 1000, step: 0.5, max: 2 },
  maxPerSecond: 5,
});
const game = defineGame({
  id: "taps",
  save: { key: "taps.save", version: 1 },
  features: [wallet, tap],
  vocab: WORDS,
});

const lucky = clicker({
  key: "lucky",
  wallet,
  currency: "gold",
  power: () => 10,
  crit: () => ({ chance: 0.5, mult: 7 }),
});
const luckyGame = defineGame({
  id: "lucky",
  save: { key: "lucky.save", version: 1 },
  features: [wallet, lucky],
  vocab: WORDS,
});

const gold = (s: State) => s.wallet.gold.toNumber();

describe("clickShare and comboAt", () => {
  test("a base plus a share of income", () => {
    expect(clickShare(2, 100, 0.01).toNumber()).toBe(3);
  });

  test("a combo steps up inside the window, caps, and falls back after it", () => {
    const combo = { windowMs: 1000, step: 0.5, max: 2 };
    expect(comboAt({ combo: 1, lastAt: 0 }, 5000, combo)).toBe(1);
    expect(comboAt({ combo: 1, lastAt: 4500 }, 5000, combo)).toBe(1.5);
    expect(comboAt({ combo: 2, lastAt: 4500 }, 5000, combo)).toBe(2);
    expect(comboAt({ combo: 2, lastAt: 3000 }, 5000, combo)).toBe(1);
    expect(comboAt({ combo: 2, lastAt: 3000 }, 5000)).toBe(1);
  });
});

describe("clicker", () => {
  test("a press pays power into the wallet and keeps the counters", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit("gems", 4);
    const r = store.getState().tap.click();
    expect(r).toEqual({ amount: D(3), crit: false, combo: 1 });
    expect(gold(store.getState())).toBe(3);
    expect(store.getState().tap.clicks).toBe(1);
    expect(store.getState().tap.earned.toNumber()).toBe(3);
  });

  test("the combo grows while presses land in the window and decays after", () => {
    const { store, clock } = freshStore(game);
    const combos: number[] = [];
    for (let i = 0; i < 4; i++) {
      clock.advance(300);
      combos.push(store.getState().tap.click()?.combo ?? 0);
    }
    expect(combos).toEqual([1, 1.5, 2, 2]);
    clock.advance(5000);
    expect(store.getState().tap.click()?.combo).toBe(1);
  });

  test("presses past the cap in one second of game time are dropped", () => {
    const { store, clock } = freshStore(game);
    const results = Array.from({ length: 8 }, () => store.getState().tap.click());
    expect(results.filter((r) => r === null)).toHaveLength(3);
    expect(store.getState().tap.clicks).toBe(5);
    clock.advance(1000);
    expect(store.getState().tap.click()).not.toBeNull();
  });

  test("crits roll on the saved stream: a reload replays the same rolls", () => {
    const { store } = freshStore(luckyGame, { seed: 7 });
    const saved = store.getState().exportProfile();
    const first = Array.from({ length: 20 }, () => store.getState().lucky.click()?.crit);
    expect(first.some(Boolean)).toBe(true);
    expect(first.every(Boolean)).toBe(false);

    const { store: again } = freshStore(luckyGame, { save: saved });
    const second = Array.from({ length: 20 }, () => again.getState().lucky.click()?.crit);
    expect(second).toEqual(first);
    const crits = first.filter(Boolean).length;
    expect(again.getState().lucky.crits).toBe(crits);
    expect(again.getState().lucky.best.toNumber()).toBe(70);
  });

  test("a run reset clears the run counters and the combo, and keeps the lifetime totals", () => {
    const { store, clock } = freshStore(game);
    store.getState().tap.click();
    clock.advance(100);
    store.getState().tap.click();
    store.getState().resetRun();
    const s = store.getState().tap;
    expect(s.runClicks).toBe(0);
    expect(s.runEarned.toNumber()).toBe(0);
    expect(s.combo).toBe(1);
    expect(s.clicks).toBe(2);
    expect(s.earned.toNumber()).toBe(2.5);
  });

  test("the auto-player presses once per look", () => {
    const world = createSimWorld((now) => simStore(game, now, "seed"), T0);
    const player = autoPlayer<State>(game, {
      balance: (s, c) => (c === "gold" ? s.wallet.gold : s.wallet.gems),
    });
    for (let i = 0; i < 10; i++) {
      expect(player.look(world.store).free).toBe(1);
      world.play(2000);
    }
    expect(world.store.getState().tap.clicks).toBe(10);
  });

  test("power reads a buff at the press's game time", () => {
    const timers = buffs({ key: "timers", list: [{ id: "rush", durationMs: 10_000, stack: "refresh" }] });
    const rushed = clicker({
      key: "rushed",
      wallet,
      currency: "gold",
      power: (s: { timers: BuffsState }, { now }) => (buffActive(s.timers, "rush", now) ? 7 : 1),
    });
    const rushGame = defineGame({
      id: "rush",
      save: { key: "rush.save", version: 1 },
      features: [wallet, timers, rushed],
      vocab: WORDS,
    });
    const { store, clock } = freshStore(rushGame);
    expect(store.getState().rushed.click()?.amount.toNumber()).toBe(1);
    expect(store.getState().timers.start("rush")).toBe(true);
    clock.advance(100);
    expect(store.getState().rushed.click()?.amount.toNumber()).toBe(7);
    expect(timers.select.contributions(store.getState(), clock.now())).toEqual([]);
    clock.advance(10_000);
    expect(store.getState().rushed.click()?.amount.toNumber()).toBe(1);
  });
});
