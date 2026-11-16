import { describe, expect, test } from "bun:test";
import { freshStore } from "watchpot/test";
import { MAIN } from "../src/content/words";
import { game } from "../src/game/game";
// @if generators|dimensions
import { type Decimal, ZERO } from "watchpot/core";
import { autoPlayer, createSimWorld, simStore } from "watchpot/sim";
import type { GameState } from "../src/game/game";
import { incomeOf } from "../src/game/income";
// @end
// @if generators
import { GENERATORS } from "../src/content/generators";
import { producers } from "../src/game/generators";
// @end
// @if dimensions
import { TIERS } from "../src/content/dimensions";
import { chain } from "../src/game/dimensions";
// @end
// @if clicker
import { BASE } from "../src/content/clicker";
// @end
// @if tree
import { NODES } from "../src/content/tree";
// @end
// @if gacha
import { BOX, PULL_PRICE } from "../src/content/gacha";
import { PREMIUM } from "../src/content/words";
// @end
// @if achievements
import { ACHIEVEMENTS } from "../src/content/achievements";
import { met } from "../src/game/achievements";
// @end
// @if visitor
import { BUFF, WAIT } from "../src/content/visitor";
import { VISITOR_KIND } from "../src/game/visitor";
// @end

const fresh = () => freshStore(game);
type Store = ReturnType<typeof fresh>["store"];
type Clock = ReturnType<typeof fresh>["clock"];
const tick = (store: Store, clock: Clock, ms: number) => store.getState().tick(ms, clock.advance(ms));

describe("the game", () => {
  // @if generators|dimensions
  test("a new profile earns while it ticks", () => {
    const { store, clock } = freshStore(game);
    // @if dimensions
    const lowest = TIERS[0]?.id ?? "";
    expect(store.getState().dimensions.buy(lowest)).toBe(true);
    // @end
    const before = store.getState().wallet[MAIN];
    tick(store, clock, 10_000);
    expect(incomeOf(store.getState()).gt(0)).toBe(true);
    expect(store.getState().wallet[MAIN].gt(before)).toBe(true);
  });
  // @end

  // @if generators
  test("a new profile owns the first generator", () => {
    const { store } = freshStore(game);
    expect(store.getState().generators.owned[GENERATORS[0]?.id ?? ""]).toBe(1);
  });

  test("buying generators pays their price and raises the income", () => {
    const { store, clock } = freshStore(game);
    const id = GENERATORS[0]?.id ?? "";
    store.getState().wallet.credit(MAIN, producers.select.price(store.getState(), id, 10));
    tick(store, clock, 1_000);
    const before = incomeOf(store.getState());
    expect(store.getState().generators.buy(id, 10)).toBe(true);
    expect(store.getState().generators.owned[id]).toBe(11);
    tick(store, clock, 1_000);
    expect(incomeOf(store.getState()).gt(before)).toBe(true);
  });

  test("a purchase the wallet cannot cover is refused and changes nothing", () => {
    const { store } = freshStore(game);
    const last = GENERATORS[GENERATORS.length - 1]?.id ?? "";
    expect(store.getState().generators.buy(last)).toBe(false);
    expect(store.getState().generators.owned[last]).toBe(0);
  });
  // @end

  // @if dimensions
  test("each tier makes the one below it, and every ten bought doubles a tier", () => {
    const { store, clock } = freshStore(game);
    const [low, next] = TIERS;
    if (!low || !next) throw new Error("the chain needs two tiers");
    store.getState().wallet.credit(MAIN, 1e9);
    expect(store.getState().dimensions.buy(low.id, 10)).toBe(true);
    expect(chain.select.setBonus(store.getState(), low.id).eq(2)).toBe(true);
    expect(chain.select.open(store.getState(), next.id)).toBe(true);
    expect(store.getState().dimensions.buy(next.id)).toBe(true);
    const held = store.getState().dimensions.amount[low.id] ?? ZERO;
    tick(store, clock, 10_000);
    expect((store.getState().dimensions.amount[low.id] ?? ZERO).gt(held)).toBe(true);
  });
  // @end

  // @if clicker
  test("a press pays at least its base, and the cap drops presses past it", () => {
    const { store } = freshStore(game, { seed: "press" });
    const before = store.getState().wallet[MAIN];
    const paid = store.getState().clicker.click();
    expect(paid?.amount.gte(BASE)).toBe(true);
    expect(store.getState().wallet[MAIN].gt(before)).toBe(true);
    let dropped = 0;
    for (let i = 0; i < 40; i++) if (store.getState().clicker.click() === null) dropped++;
    expect(dropped).toBeGreaterThan(0);
  });
  // @end

  // @if tree
  test("an upgrade rank pays from the wallet and lands on the stats", () => {
    const { store } = freshStore(game);
    const node = NODES.find((n) => n.requires.length === 0 && n.effects.some((e) => e.stat === "output"));
    if (!node) throw new Error("no root output node");
    store.getState().wallet.credit(MAIN, 1e6);
    expect(store.getState().upgrades.buy(node.id).ok).toBe(true);
    // The stats follow the ranks at once: no pass needed.
    expect(store.getState().stats.output.toNumber()).toBeGreaterThan(1);
  });
  // @end

  // @if gacha
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

  test("a granted free pull opens without spending premium", () => {
    const { store } = freshStore(game, { seed: "free" });
    store.getState().summon.grant(BOX, 1);
    const held = store.getState().wallet[PREMIUM];
    expect(store.getState().collection.pull(1)).toBe(true);
    expect(store.getState().wallet[PREMIUM].eq(held)).toBe(true);
    expect(store.getState().summon.tokens[BOX]).toBe(0);
  });

  test("premium drips in over time", () => {
    const { store, clock } = freshStore(game);
    const held = store.getState().wallet[PREMIUM];
    for (let i = 0; i < 60; i++) tick(store, clock, 60_000);
    expect(store.getState().wallet[PREMIUM].gt(held)).toBe(true);
  });
  // @end

  // @if prestige
  test("a prestige pays, resets the run and keeps what is above it", () => {
    const { store, clock } = freshStore(game);
    store.getState().wallet.credit(MAIN, 1e40);
    // @if gacha
    store.getState().wallet.credit(PREMIUM, PULL_PRICE);
    store.getState().collection.pull(1);
    const found = { ...store.getState().collection.owned };
    // @end
    // @if achievements
    tick(store, clock, 1_000);
    const earned = { ...store.getState().achievements.earned };
    // @end
    expect(store.getState().prestige.ascend()).toBe(true);
    const s = store.getState();
    expect(s.prestige.runs).toBe(1);
    expect(s.prestige.currency.gt(0)).toBe(true);
    expect(s.wallet.earned.eq(0)).toBe(true);
    // @if generators
    expect(s.generators.owned[GENERATORS[0]?.id ?? ""]).toBe(1);
    // @end
    // @if dimensions
    expect(Object.values(s.dimensions.bought).every((n) => n === 0)).toBe(true);
    // @end
    // @if gacha
    expect(s.collection.owned).toEqual(found);
    // @end
    // @if achievements
    for (const id of Object.keys(earned)) expect(s.achievements.earned[id]).toBeDefined();
    // @end
    tick(store, clock, 1_000);
    expect(store.getState().stats.output.toNumber()).toBeGreaterThan(1);
  });
  // @end

  // @if achievements
  test("an achievement is earned once its condition holds, and raises output", () => {
    const { store, clock } = freshStore(game);
    const easy = ACHIEVEMENTS.find((a) => "earned" in a.when);
    if (!easy || !("earned" in easy.when)) throw new Error("no earned achievement in the content");
    expect(met(easy.when, store.getState())).toBe(false);
    store.getState().wallet.credit(MAIN, easy.when.earned);
    tick(store, clock, 1_000);
    expect(store.getState().achievements.earned[easy.id]).toBeDefined();
    expect(store.getState().achievements.fresh).toContain(easy.id);
    expect(store.getState().stats.output.toNumber()).toBeGreaterThan(1);
  });
  // @end

  // @if visitor
  test("a visitor arrives within its wait, and catching it starts the bonus", () => {
    const { store, clock } = freshStore(game, { seed: "visit" });
    for (let t = 0; t <= WAIT.maxMs && !store.getState().visitors.kinds[VISITOR_KIND]?.live; t += 1_000)
      tick(store, clock, 1_000);
    expect(store.getState().visitors.kinds[VISITOR_KIND]?.live).not.toBeNull();
    const output = store.getState().stats.output.toNumber();
    expect(store.getState().visitors.catch(VISITOR_KIND)).toBe(BUFF.id);
    tick(store, clock, 1_000);
    expect(store.getState().stats.output.toNumber()).toBeCloseTo(output * BUFF.mult, 5);
    tick(store, clock, BUFF.seconds * 1000);
    expect(store.getState().stats.output.toNumber()).toBeCloseTo(output, 5);
  });
  // @end

  test("the save comes back as it was", () => {
    const { store, clock } = freshStore(game);
    tick(store, clock, 60_000);
    const saved = store.getState().exportProfile();
    const other = freshStore(game).store;
    other.getState().importProfile(saved);
    expect(other.getState().wallet[MAIN].eq(store.getState().wallet[MAIN])).toBe(true);
    // @if generators
    expect(other.getState().generators.owned).toEqual(store.getState().generators.owned);
    // @end
    // @if dimensions
    expect(other.getState().dimensions.bought).toEqual(store.getState().dimensions.bought);
    // @end
  });

  // @if generators|dimensions
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
    expect(incomeOf(world.store.getState() as unknown as GameState).gt(0)).toBe(true);
  });
  // @end
});
