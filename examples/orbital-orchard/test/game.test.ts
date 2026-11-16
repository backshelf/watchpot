import { describe, expect, test } from "bun:test";
import { D, type Decimal, ZERO } from "watchpot/core";
import { autoPlayer, createSimWorld, simStore } from "watchpot/sim";
import { freshStore } from "watchpot/test";
import { BOX, PULL_PRICE } from "../src/content/gacha";
import { GENERATORS } from "../src/content/generators";
import { NODES } from "../src/content/tree";
import { MAIN, PREMIUM } from "../src/content/words";
import { type GameState, game } from "../src/game/game";
import { generatorCost } from "../src/game/generators";
import { nextOrbitAt, prestigeGain } from "../src/game/prestige";

const first = GENERATORS[0]?.id ?? "";

describe("the game", () => {
  test("a new profile owns the first generator and earns while it ticks", () => {
    const { store, clock } = freshStore(game);
    const before = store.getState().wallet[MAIN];
    expect(store.getState().generators.owned[first]).toBe(1);
    store.getState().tick(10_000, clock.advance(10_000));
    expect(store.getState().generators.perSecond.gt(0)).toBe(true);
    expect(store.getState().wallet[MAIN].gt(before)).toBe(true);
  });

  test("buying a generator pays its price and raises the rate", () => {
    const { store, clock } = freshStore(game);
    const g = GENERATORS[0];
    if (!g) throw new Error("no generators");
    store.getState().wallet.credit(MAIN, generatorCost(g, 1));
    const rate = () => {
      store.getState().tick(1_000, clock.advance(1_000));
      return store.getState().generators.perSecond;
    };
    const before = rate();
    expect(store.getState().generators.buy(g.id)).toBe(true);
    expect(store.getState().generators.owned[g.id]).toBe(2);
    expect(rate().gt(before)).toBe(true);
  });

  test("a purchase the wallet cannot cover is refused and changes nothing", () => {
    const { store } = freshStore(game);
    const last = GENERATORS[GENERATORS.length - 1];
    if (!last) throw new Error("no generators");
    expect(store.getState().generators.buy(last.id)).toBe(false);
    expect(store.getState().generators.owned[last.id]).toBe(0);
  });

  test("an upgrade rank pays from the wallet and lands on the stats", () => {
    const { store, clock } = freshStore(game);
    const node = NODES.find((n) => n.requires.length === 0 && n.effects.some((e) => e.stat === "output"));
    if (!node) throw new Error("no root output node");
    store.getState().wallet.credit(MAIN, 1e6);
    expect(store.getState().upgrades.buy(node.id).ok).toBe(true);
    store.getState().tick(1_000, clock.advance(1_000));
    expect(store.getState().generators.output).toBeGreaterThan(1);
  });

  test("a pull spends premium, finds an item and counts toward the guarantee", () => {
    const { store } = freshStore(game, { seed: "pull" });
    store.getState().wallet.credit(PREMIUM, PULL_PRICE);
    const held = store.getState().wallet[PREMIUM];
    expect(store.getState().collection.pull(1)).toBe(true);
    expect(store.getState().wallet[PREMIUM].eq(held.sub(PULL_PRICE))).toBe(true);
    expect(store.getState().collection.last).toHaveLength(1);
    expect(store.getState().summon.opened[BOX]).toBe(1);
    const owned = Object.values(store.getState().collection.owned).reduce((a, b) => a + b, 0);
    expect(owned).toBe(1);
  });

  test("premium drips in over time", () => {
    const { store, clock } = freshStore(game);
    const held = store.getState().wallet[PREMIUM];
    for (let i = 0; i < 60; i++) store.getState().tick(60_000, clock.advance(60_000));
    expect(store.getState().wallet[PREMIUM].gt(held)).toBe(true);
  });

  test("a prestige pays, resets the run and keeps what is above it", () => {
    const { store, clock } = freshStore(game);
    store.getState().wallet.credit(MAIN, 1e12);
    store.getState().wallet.credit(PREMIUM, PULL_PRICE);
    store.getState().collection.pull(1);
    const found = { ...store.getState().collection.owned };
    expect(store.getState().prestige.ascend()).toBe(true);
    const s = store.getState();
    expect(s.prestige.runs).toBe(1);
    expect(s.prestige.currency.gt(0)).toBe(true);
    expect(s.wallet.earned.eq(0)).toBe(true);
    expect(s.generators.owned[first]).toBe(1);
    expect(s.collection.owned).toEqual(found);
    store.getState().tick(1_000, clock.advance(1_000));
    expect(store.getState().generators.output).toBeGreaterThan(1);
  });

  test("the next orbit's mark is where a burn starts paying one more", () => {
    const { store } = freshStore(game);
    for (const banked of [0, 1e9, 1e12]) {
      if (banked) store.getState().wallet.credit(MAIN, banked - store.getState().wallet.earned.toNumber());
      const s = store.getState();
      const gain = prestigeGain(s).toNumber();
      const at = nextOrbitAt(s);
      expect(at).toBeGreaterThan(s.wallet.earned.toNumber());
      const there = { ...s, wallet: { ...s.wallet, earned: D(at * 1.0001) } };
      expect(prestigeGain(there).toNumber()).toBe(gain + 1);
    }
  });

  test("the save comes back as it was", () => {
    const { store, clock } = freshStore(game);
    store.getState().tick(60_000, clock.advance(60_000));
    const saved = store.getState().exportProfile();
    const other = freshStore(game).store;
    other.getState().importProfile(saved);
    expect(other.getState().wallet[MAIN].eq(store.getState().wallet[MAIN])).toBe(true);
    expect(other.getState().generators.owned).toEqual(store.getState().generators.owned);
  });

  test("the auto-player plays an hour and buys", () => {
    const START = Date.UTC(2026, 0, 5, 8);
    const world = createSimWorld((now) => simStore(game, now, "test"), START);
    const auto = autoPlayer<GameState>(game, {
      balance: (s, c) => (s.wallet as unknown as Record<string, Decimal>)[c] ?? ZERO,
    });
    let bought = 0;
    for (let i = 0; i < 60; i++) {
      bought += auto.look(world.store as never).bought;
      world.play(60_000);
    }
    expect(bought).toBeGreaterThan(0);
    const s = world.store.getState() as unknown as GameState;
    expect(Object.values(s.generators.owned).filter((n) => n > 0).length).toBeGreaterThan(1);
  });
});
