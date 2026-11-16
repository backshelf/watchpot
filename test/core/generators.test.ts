import { describe, expect, test } from "bun:test";
import { currencies, cyclesIn, D, type Decimal, defineGame, generators, HOUR_MS, vocab } from "watchpot/core";
import { autoPlayer, createSimWorld, simStore } from "watchpot/sim";
import { freshStore, T0 } from "watchpot/test";

const num = (d: Decimal | undefined) => (d ?? D(0)).toNumber();

describe("cyclesIn", () => {
  test("counts whole cycles and carries the rest", () => {
    expect(cyclesIn(0, 2500, 1000)).toEqual({ completed: 2, progress: 500 });
    expect(cyclesIn(800, 300, 1000)).toEqual({ completed: 1, progress: 100 });
    expect(cyclesIn(0, 999, 1000)).toEqual({ completed: 0, progress: 999 });
  });

  test("a cycle started by hand completes once and stops", () => {
    expect(cyclesIn(0, 10_000, 1000, true)).toEqual({ completed: 1, progress: 0 });
  });

  test("cutting the stretch anywhere gives the same count", () => {
    let progress = 0;
    let completed = 0;
    for (const dt of [130, 2000, 7, 999, 4864]) {
      const step = cyclesIn(progress, dt, 700);
      progress = step.progress;
      completed += step.completed;
    }
    const whole = cyclesIn(0, 8000, 700);
    expect(completed).toBe(whole.completed);
    expect(progress).toBeCloseTo(whole.progress);
  });
});

const WORDS = vocab({ currencies: ["gold", "gems"], stats: [], rarities: ["common"] } as const);
const wallet = currencies({ key: "wallet", vocab: WORDS, start: { gold: 10 } });
type State = {
  wallet: { gold: Decimal; gems: Decimal };
  works: { owned: Record<string, number> };
};
const works = generators({
  key: "works",
  wallet,
  list: [
    {
      id: "cart",
      cost: { base: 10, growth: 1.15 },
      pays: "gold",
      makes: "gold",
      rate: 1,
      free: 1,
      milestones: [
        { at: 25, gives: { mult: 2 } },
        { at: 50, gives: { mult: 2 } },
      ],
    },
    {
      id: "mill",
      cost: { base: 100, growth: 1.2 },
      pays: "gold",
      makes: "gold",
      cycle: { ms: 4000, pays: 50 },
      milestones: [{ at: 10, gives: { speed: 2 } }],
    },
    { id: "mine", cost: { base: 1000, growth: 1.3 }, pays: "gold", makes: "gems", rate: 0.1 },
  ],
  global: [{ at: 5, gives: { mult: 3 } }],
  automated: (s: State, g) => g.id === "mill" && (s.works.owned.mine ?? 0) > 0,
  away: () => ({ rate: 0.5, capMs: HOUR_MS }),
});
const game = defineGame({
  id: "works",
  save: { key: "works.save", version: 1 },
  features: [wallet, works],
  vocab: WORDS,
});

describe("generators", () => {
  test("a free one is owned from the start and pays every tick", () => {
    const { store } = freshStore(game);
    expect(store.getState().works.owned.cart).toBe(1);
    store.getState().tick(10_000, T0 + 10_000);
    expect(num(store.getState().wallet.gold)).toBeCloseTo(20);
    expect(num(store.getState().works.perSecond.gold)).toBe(1);
  });

  test("a bulk buy costs what single buys cost, and ends at the same count", () => {
    const one = freshStore(game).store;
    const many = freshStore(game).store;
    for (const s of [one, many]) s.getState().wallet.credit("gold", 1e6);
    for (let i = 0; i < 12; i++) expect(one.getState().works.buy("cart")).toBe(true);
    expect(many.getState().works.buy("cart", 12)).toBe(true);
    expect(many.getState().works.owned.cart).toBe(one.getState().works.owned.cart);
    expect(num(many.getState().wallet.gold) / num(one.getState().wallet.gold)).toBeCloseTo(1, 9);
  });

  test("the draft helpers buy inside a recipe", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit("gold", 1000);
    let bought = 0;
    store.setState((d) => {
      bought = works.buy(d, "cart", 2) + works.buyMax(d, "mill", 3);
    });
    expect(bought).toBe(5);
    expect(store.getState().works.owned).toMatchObject({ cart: 3, mill: 3 });
  });

  test("a buy the balance cannot cover buys nothing; buyMax buys what it can", () => {
    const { store } = freshStore(game);
    expect(store.getState().works.buy("cart", 3)).toBe(false);
    expect(store.getState().works.owned.cart).toBe(1);
    store.getState().wallet.credit("gold", 30);
    const can = works.rules.affordable(store.getState(), "cart");
    expect(can).toBeGreaterThan(0);
    expect(store.getState().works.buyMax("cart")).toBe(can);
    expect(num(store.getState().wallet.gold)).toBeLessThan(num(works.rules.price(store.getState(), "cart")));
  });

  test("a milestone multiplies at its threshold, not before", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit("gold", 1e9);
    expect(works.rules.untilMilestone(store.getState(), "cart")).toBe(24);
    store.getState().works.buy("cart", 23);
    const before = num(works.rules.rate(store.getState(), "cart"));
    expect(before).toBe(24);
    expect(store.getState().works.buyNext("cart")).toBe(true);
    expect(store.getState().works.owned.cart).toBe(25);
    expect(num(works.rules.rate(store.getState(), "cart"))).toBe(50);
    expect(works.rules.untilMilestone(store.getState(), "cart")).toBe(25);
  });

  test("global milestones read the lowest count across the list", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit("gold", 1e12);
    store.getState().works.buy("cart", 10);
    store.getState().works.buy("mill", 5);
    expect(works.rules.boost(store.getState(), "cart").mult).toBe(1);
    store.getState().works.buy("mine", 5);
    expect(works.rules.boost(store.getState(), "cart").mult).toBe(3);
    expect(works.rules.boost(store.getState(), "mine").mult).toBe(3);
  });

  test("a hand cycle runs once when started and stops", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit("gold", 100);
    store.getState().works.buy("mill");
    const gold = () => num(store.getState().wallet.gold);
    expect(store.getState().works.run("mill")).toBe(true);
    expect(store.getState().works.run("mill")).toBe(false); // already under way
    const start = gold();
    store.getState().tick(1000, T0 + 1000); // a quarter in
    expect(store.getState().works.progress.mill).toBe(1000);
    store.getState().tick(20_000, T0 + 21_000);
    // The cart's income, plus one cycle of 50; the rest of the long step does not run another.
    expect(gold() - start).toBeCloseTo(21 + 50);
    expect(store.getState().works.running.mill).toBe(false);
    store.getState().tick(10_000, T0 + 31_000);
    expect(gold() - start).toBeCloseTo(31 + 50);
    expect(works.rules.perSecond(store.getState()).gold?.toNumber()).toBe(1); // a hand cycle is not income
  });

  test("an automated cycle over one long step pays what many short steps pay", () => {
    const play = (steps: number, each: number) => {
      const { store } = freshStore(game);
      store.getState().wallet.credit("gold", 1e6);
      store.getState().works.buy("mill", 3);
      store.getState().works.buy("mine");
      const start = store.getState().wallet.gold;
      for (let i = 1; i <= steps; i++) store.getState().tick(each, T0 + i * each);
      return {
        gained: store.getState().wallet.gold.sub(start),
        progress: store.getState().works.progress.mill,
      };
    };
    const long = play(1, 60_000);
    const short = play(600, 100);
    expect(num(short.gained) / num(long.gained)).toBeCloseTo(1, 9);
    expect(short.progress).toBeCloseTo(long.progress ?? -1);
    // 15 cycles of 50 x 3, and the cart's 60.
    expect(num(long.gained)).toBeCloseTo(15 * 150 + 60);
  });

  test("a speed milestone halves the cycle; perSecond counts an automated cycle at its average", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit("gold", 1e9);
    store.getState().works.buy("mine");
    store.getState().works.buy("mill", 9);
    expect(works.rules.cycleMs(store.getState(), "mill")).toBe(4000);
    store.getState().works.buy("mill");
    expect(works.rules.cycleMs(store.getState(), "mill")).toBe(2000);
    // 10 owned x 50 per 2 s, plus the cart's 1.
    expect(num(works.rules.perSecond(store.getState()).gold)).toBeCloseTo(251);
  });

  test("an absence counts at the away rate, up to the cap", () => {
    const { store } = freshStore(game);
    store.getState().catchUp(T0 + 10 * HOUR_MS);
    expect(num(store.getState().wallet.gold)).toBeCloseTo(10 + 1800);
  });

  test("a run reset owns the free ones again; a save keeps the counts", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit("gold", 1000);
    store.getState().works.buy("cart", 5);
    const saved = store.getState().exportProfile();
    store.getState().resetRun();
    expect(store.getState().works.owned.cart).toBe(1);
    store.getState().importProfile(saved);
    expect(store.getState().works.owned.cart).toBe(6);
  });

  test("a repeated id or an empty cycle throws", () => {
    const twice = () =>
      generators({
        key: "x",
        wallet,
        list: [
          { id: "a", cost: { base: 1, growth: 2 }, pays: "gold", makes: "gold", rate: 1 },
          { id: "a", cost: { base: 1, growth: 2 }, pays: "gold", makes: "gold", rate: 1 },
        ],
      });
    expect(twice).toThrow(/appears twice/);
    const empty = () =>
      generators({
        key: "x",
        wallet,
        list: [
          { id: "a", cost: { base: 1, growth: 2 }, pays: "gold", makes: "gold", cycle: { ms: 0, pays: 1 } },
        ],
      });
    expect(empty).toThrow(/above zero/);
  });

  test("the auto-player grows income over an hour", () => {
    const world = createSimWorld((now) => simStore(game, now, "seed"), T0);
    const player = autoPlayer<State>(game, { balance: (s, c) => (c === "gold" ? s.wallet.gold : D(0)) });
    const income = () => num(works.rules.perSecond(world.store.getState()).gold);
    const first = income();
    for (let i = 0; i < 60; i++) {
      player.look(world.store);
      world.play(60_000);
    }
    expect(income()).toBeGreaterThan(first * 5);
    expect(world.store.getState().works.owned.mill).toBeGreaterThan(0);
  });
});
