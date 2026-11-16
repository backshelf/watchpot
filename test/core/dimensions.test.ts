import { describe, expect, test } from "bun:test";
import {
  advanceChain,
  D,
  type Decimal,
  defineCurrencies,
  defineDimensions,
  defineGame,
  feature,
  HOUR_MS,
  vocab,
} from "watchpot/core";
import { autoPlayer, createSimWorld, simStore } from "watchpot/sim";
import { freshStore, T0 } from "watchpot/test";

const num = (d: Decimal | undefined) => (d ?? D(0)).toNumber();

describe("advanceChain", () => {
  test("one tier is a straight line", () => {
    const step = advanceChain([4], [2.5], 10);
    expect(num(step.produced)).toBeCloseTo(100);
    expect(num(step.amounts[0])).toBe(4);
  });

  test("a tier above feeds the one below: the product grows as the square of time", () => {
    // One of the second tier makes 1 of the first a second; the first makes 1 a second.
    const step = advanceChain([0, 1], [1, 1], 10);
    expect(num(step.amounts[0])).toBeCloseTo(10);
    expect(num(step.amounts[1])).toBe(1);
    expect(num(step.produced)).toBeCloseTo(50); // t^2 / 2
  });

  test("one step is many small steps: the stretch can be cut anywhere", () => {
    const rates = [3, 0.5, 2, 0.25];
    const whole = advanceChain([5, 4, 3, 2], rates, 60);
    let amounts: Decimal[] = [D(5), D(4), D(3), D(2)];
    let produced = D(0);
    for (let i = 0; i < 600; i++) {
      const step = advanceChain(amounts, rates, 0.1);
      amounts = step.amounts;
      produced = produced.add(step.produced);
    }
    expect(produced.div(whole.produced).toNumber()).toBeCloseTo(1, 9);
    for (const [i, a] of whole.amounts.entries()) expect(num(amounts[i]) / num(a)).toBeCloseTo(1, 9);
  });

  test("no time, or an empty chain, changes nothing", () => {
    expect(num(advanceChain([7, 7], [1, 1], 0).produced)).toBe(0);
    expect(advanceChain([], [], 10).amounts).toEqual([]);
  });
});

const WORDS = vocab({ currencies: ["gold", "gems"], stats: [], rarities: ["plain"] } as const);
const wallet = defineCurrencies({ key: "wallet", vocab: WORDS, start: { gold: 10 } });
type State = { wallet: { gold: Decimal }; chain: { bought: Record<string, number> } };
const chain = defineDimensions({
  key: "chain",
  wallet,
  makes: "gold",
  set: { size: 10, mult: 2 },
  tiers: [
    { id: "first", cost: { base: 10, growth: 1.5 } },
    { id: "second", cost: { base: 100, growth: 2 } },
    { id: "third", cost: { base: 1e4, growth: 3 }, pays: "gems" },
  ],
  speed: (s: State) => 1 + (s.chain.bought.third ?? 0),
  away: () => ({ rate: 0.5, capMs: HOUR_MS }),
});
const game = defineGame({
  id: "chains",
  save: { key: "chains.save", version: 1 },
  features: [wallet, chain],
  vocab: WORDS,
});

describe("dimensions", () => {
  test("produce advances the chain inside a recipe, as the tick does", () => {
    const a = freshStore(game).store;
    const b = freshStore(game).store;
    for (const s of [a, b]) {
      s.getState().wallet.credit("gold", 200);
      s.getState().chain.buy("first", 2);
      s.getState().chain.buy("second");
    }
    a.getState().tick(30_000, T0 + 30_000);
    b.setState((d) => {
      chain.draft.produce(d, 10);
      chain.draft.produce(d, 20);
    });
    expect(num(b.getState().wallet.gold)).toBeCloseTo(num(a.getState().wallet.gold), 6);
    expect(num(b.getState().chain.amount.first)).toBeCloseTo(num(a.getState().chain.amount.first), 6);
  });

  test("the draft helpers buy inside a recipe, as an autobuyer's run does", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit("gold", 90);
    let bought = 0;
    store.setState((d) => {
      bought = chain.draft.buy(d, "first", 2);
    });
    expect(bought).toBe(2);
    store.setState((d) => {
      bought = chain.draft.buy(d, "first", 99);
    });
    expect(bought).toBe(0);
    store.setState((d) => {
      bought = chain.draft.buyMax(d, "first");
    });
    expect(bought).toBe(2);
    expect(store.getState().chain.bought.first).toBe(4);
    store.getState().wallet.credit("gold", 1000);
    store.setState((d) => {
      bought = chain.draft.maxAll(d);
    });
    expect(bought).toBeGreaterThan(0);
    expect(store.getState().chain.bought.second).toBeGreaterThan(0);
  });

  test("the first tier earns the currency; the second earns the first", () => {
    const { store } = freshStore(game);
    expect(store.getState().chain.buy("first")).toBe(true);
    expect(num(store.getState().wallet.gold)).toBe(0);
    store.getState().tick(10_000, T0 + 10_000);
    expect(num(store.getState().wallet.gold)).toBeCloseTo(10);

    store.getState().wallet.credit("gold", 90);
    expect(store.getState().chain.buy("second")).toBe(true);
    store.getState().tick(10_000, T0 + 20_000);
    // The second made 10 of the first; the first made 10 + t^2 / 2 over the ten seconds.
    expect(num(store.getState().chain.amount.first)).toBeCloseTo(11);
    expect(num(store.getState().wallet.gold)).toBeCloseTo(60);
    expect(store.getState().chain.bought.first).toBe(1);
  });

  test("a tier opens once the one below was bought, and refuses what the balance cannot cover", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit("gold", 1000);
    expect(store.getState().chain.buy("second")).toBe(false);
    expect(chain.select.open(store.getState(), "second")).toBe(false);
    store.getState().chain.buy("first");
    expect(chain.select.open(store.getState(), "second")).toBe(true);
    expect(store.getState().chain.buy("second", 99)).toBe(false);
    expect(store.getState().chain.bought.second).toBe(0);
  });

  test("every ten bought doubles the tier; the price reads what was bought, not what is held", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit("gold", 1e9);
    expect(chain.select.untilSet(store.getState(), "first")).toBe(10);
    expect(store.getState().chain.buySet("first")).toBe(true);
    expect(store.getState().chain.bought.first).toBe(10);
    expect(num(chain.select.setBonus(store.getState(), "first"))).toBe(2);
    expect(num(chain.select.perSecond(store.getState(), "first"))).toBe(20);

    store.getState().chain.buy("first", 3);
    expect(chain.select.untilSet(store.getState(), "first")).toBe(7);
    expect(num(chain.select.price(store.getState(), "first"))).toBe(Math.ceil(10 * 1.5 ** 13));
  });

  test("buyMax spends what it can and stops; maxAll buys the highest tier first", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit("gold", 90); // 100 held: 10 + 15 + 23 + 34 = 82 (each price rounds up), the fifth is 51
    expect(store.getState().chain.buyMax("first")).toBe(4);
    expect(num(store.getState().wallet.gold)).toBe(18);

    store.getState().wallet.credit("gold", 1000);
    const bought = store.getState().chain.maxAll();
    expect(bought).toBeGreaterThan(0);
    expect(store.getState().chain.bought.second).toBeGreaterThan(0);
    expect(store.getState().chain.bought.third).toBe(0); // priced in gems, none held
  });

  test("the game's speed multiplies every tier", () => {
    const { store } = freshStore(game);
    store.getState().chain.buy("first");
    store.getState().wallet.credit("gold", 100);
    store.getState().chain.buy("second");
    store.getState().wallet.credit("gems", 1e4);
    expect(store.getState().chain.buy("third")).toBe(true);
    expect(num(chain.select.rate(store.getState(), "first"))).toBe(2);
  });

  test("an absence counts at the away rate, up to its cap, on the same curve", () => {
    const { store } = freshStore(game);
    store.getState().chain.buy("first");
    store.getState().catchUp(T0 + 10 * HOUR_MS); // half of one hour counts
    expect(num(store.getState().wallet.gold)).toBeCloseTo(1800);
  });

  test("a run reset starts the chain over; a save keeps the Decimals", () => {
    const { store } = freshStore(game);
    store.getState().chain.buy("first");
    store.getState().tick(5000, T0 + 5000);
    const saved = store.getState().exportProfile();
    store.getState().resetRun();
    expect(store.getState().chain.bought.first).toBe(0);
    expect(num(store.getState().chain.amount.first)).toBe(0);

    store.getState().importProfile(saved);
    expect(store.getState().chain.bought.first).toBe(1);
    expect(store.getState().chain.amount.first?.add(1).toNumber()).toBe(2);
  });

  test("a repeated tier id throws", () => {
    expect(() =>
      defineDimensions({
        key: "twice",
        wallet,
        makes: "gold",
        tiers: [
          { id: "a", cost: { base: 1, growth: 2 } },
          { id: "a", cost: { base: 1, growth: 2 } },
        ],
      }),
    ).toThrow(/appears twice/);
  });

  test("the auto-player climbs the chain", () => {
    const world = createSimWorld((now) => simStore(game, now, "seed"), T0);
    const player = autoPlayer<State>(game, { balance: (s, c) => (c === "gold" ? s.wallet.gold : D(0)) });
    for (let i = 0; i < 240; i++) {
      player.look(world.store);
      world.play(15_000);
    }
    const bought = world.store.getState().chain.bought;
    expect(bought.first).toBeGreaterThan(5);
    expect(bought.second).toBeGreaterThan(0);
  });
});

describe("reach", () => {
  test("a callback reads a reached feature with no annotation, and not one that was not reached", () => {
    const door = feature({ key: "door", initial: () => ({ open: true }) });
    const gated = defineDimensions({
      key: "gated",
      wallet,
      makes: "gold",
      reach: [door],
      tiers: [{ id: "a", cost: { base: 1, growth: 1.1 } }],
      open: (s) => s.door.open && s.wallet.gold.gte(0),
      mult: (s) => {
        // @ts-expect-error `lid` was never reached
        s.lid;
        return 1;
      },
    });
    expect(gated.def.tiers).toHaveLength(1);
    expect(gated.needs).toBeUndefined();
  });
});
