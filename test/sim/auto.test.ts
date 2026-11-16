import { describe, expect, test } from "bun:test";
import { D, type Decimal, defineGame, feature, type Move } from "watchpot/core";
import {
  activeSchedule,
  autoPlayer,
  createSimWorld,
  fixedSchedule,
  planDay,
  playDays,
  rngFor,
  simStore,
} from "watchpot/sim";
import { T0 } from "../core/toy";

/**
 * A shop the auto-player plays: four goods bought once each (value 1, 3, 3 and 0) and a bonus claimed once. Every
 * purchase is logged, and the gold is checked never to go below zero after any of them.
 */
const GOODS = [
  { id: "plain", price: 10, worth: 1 },
  { id: "bargain", price: 10, worth: 3 },
  { id: "grand", price: 30, worth: 3 },
  { id: "dud", price: 5, worth: 0 },
] as const;

type ShopState = { shop: { gold: Decimal; bought: string[]; claimed: boolean; lowest: number } };

const shop = feature({
  key: "shop",
  initial: () => ({ gold: D(25), bought: [] as string[], claimed: false, lowest: 25 }),
  actions: (api) => ({
    buy: (id: string): boolean => {
      const good = GOODS.find((g) => g.id === id);
      let ok = false;
      api.set((s) => {
        if (!good || s.shop.bought.includes(id) || s.shop.gold.lt(good.price)) return;
        s.shop.gold = s.shop.gold.sub(good.price);
        s.shop.bought.push(id);
        s.shop.lowest = Math.min(s.shop.lowest, s.shop.gold.toNumber());
        ok = true;
      });
      return ok;
    },
    claim: (): boolean => {
      let ok = false;
      api.set((s) => {
        if (s.shop.claimed) return;
        s.shop.gold = s.shop.gold.add(40);
        s.shop.bought.push("bonus");
        s.shop.claimed = true;
        ok = true;
      });
      return ok;
    },
    /** Takes the gold and refuses: what a move that never goes through looks like. */
    jammed: (): boolean => false,
  }),
  moves: (s) => {
    const out: Move<typeof s>[] = GOODS.filter((g) => !s.shop.bought.includes(g.id)).map((g) => ({
      id: g.id,
      cost: { currency: "gold", amount: D(g.price) },
      worth: () => g.worth,
      apply: (store) => store.getState().shop.buy(g.id),
    }));
    out.push({
      id: "jam",
      cost: { currency: "gold", amount: D(1) },
      worth: () => 99,
      apply: (store) => store.getState().shop.jammed(),
    });
    if (!s.shop.claimed)
      out.push({ id: "bonus", worth: () => 1, apply: (store) => store.getState().shop.claim() });
    return out;
  },
});

const game = defineGame({ id: "shop", save: { key: "shop.save", version: 1 }, features: [shop] });
const player = autoPlayer(game, { balance: (s: ShopState) => s.shop.gold });

describe("the auto-player", () => {
  test("buys the best value per cost it can afford, then claims, then buys what the claim made affordable", () => {
    const world = createSimWorld((now) => simStore(game, now), T0);
    const done = player.look(world.store);
    const s = world.store.getState().shop;
    // The jammed move scores highest but refuses: tried once in the look, never again.
    expect(s.bought).toEqual(["bargain", "plain", "bonus", "grand"]);
    expect(done).toEqual({ bought: 3, free: 1 });
    // The dud is worth nothing: never bought, though it is affordable.
    expect(s.bought).not.toContain("dud");
    expect(s.lowest).toBeGreaterThanOrEqual(0);
    expect(s.gold.toNumber()).toBe(15);
  });

  test("a look with nothing left to do does nothing", () => {
    const world = createSimWorld((now) => simStore(game, now), T0);
    player.look(world.store);
    expect(player.look(world.store)).toEqual({ bought: 0, free: 0 });
  });

  test("plays days on a schedule: a look every quarter hour of the waking day, a close for each day", () => {
    const world = createSimWorld((now) => simStore(game, now), T0);
    const looks: number[] = [];
    const closes: number[] = [];
    playDays({
      world,
      schedule: fixedSchedule(8, 10, 15, 0),
      days: 2,
      start: T0,
      rng: rngFor("sim", "auto"),
      look: (at) => {
        looks.push(at.day);
        player.look(world.store);
      },
      dayEnd: (day) => closes.push(day),
    });
    // Two hours a day at a look per quarter hour.
    expect(looks.filter((d) => d === 0)).toHaveLength(8);
    expect(looks.filter((d) => d === 1)).toHaveLength(8);
    expect(closes).toEqual([1, 2]);
    expect(world.now()).toBe(T0 + 86_400_000 + 2 * 3_600_000);
  });
});

test("activeSchedule leaves no gap: every hour of every day is played, at its look cadence", () => {
  const day = 86_400_000;
  const s = activeSchedule(15);
  for (let d = 0; d < 3; d++) {
    const [only, ...rest] = planDay(rngFor("a", "p"), s, d, 1, d * day);
    expect(rest).toHaveLength(0);
    expect(only?.startMs).toBe(d * day);
    expect(only?.attendMs).toBe(day);
    expect(only?.lookEveryMs).toBe(15_000);
  }
});
