import { describe, expect, test } from "bun:test";
import {
  autobuyers,
  currencies,
  type Decimal,
  defineGame,
  everyMs,
  feature,
  HOUR_MS,
  vocab,
} from "watchpot/core";
import { freshStore, T0 } from "watchpot/test";

describe("everyMs", () => {
  test("fires at once the first time, then on the interval's phase", () => {
    expect(everyMs(undefined, 1000, 500)).toBe(500);
    expect(everyMs(500, 1000, 1400)).toBeNull();
    expect(everyMs(500, 1000, 1700)).toBe(1500);
    expect(everyMs(500, 1000, 9_999)).toBe(9500); // many intervals behind: one fire, phase kept
    expect(everyMs(500, 0, 501)).toBe(501);
  });

  test("the count of fires does not depend on the tick length", () => {
    const fires = (tickMs: number) => {
      let last: number | undefined = 0;
      let n = 0;
      for (let t = tickMs; t <= 60_000; t += tickMs) {
        const next = everyMs(last, 1000, t);
        if (next === null) continue;
        last = next;
        n++;
      }
      return n;
    };
    expect(fires(300)).toBe(fires(100));
    expect(fires(750)).toBe(fires(100));
    expect(fires(100)).toBe(60); // every whole second; a schedule that drifted would fire less
  });
});

const WORDS = vocab({ currencies: ["gold"], stats: [], rarities: ["common"] } as const);
const wallet = currencies({ key: "wallet", vocab: WORDS, start: { gold: 10 } });
const shop = feature({
  key: "shop",
  initial: () => ({ carts: 0, mills: 0, unlocked: true }),
  actions: (api) => ({
    lock: (unlocked: boolean) =>
      api.set((s) => {
        s.shop.unlocked = unlocked;
      }),
  }),
});
type State = { wallet: { gold: Decimal }; shop: { carts: number; mills: number; unlocked: boolean } };
const buyOne = (d: State, item: "carts" | "mills", price: number): number => {
  if (!wallet.debit(d, "gold", price)) return 0;
  d.shop[item] += 1;
  return 1;
};
const auto = autobuyers({
  key: "auto",
  list: [
    {
      id: "carts",
      unlocked: (s: State) => s.shop.unlocked,
      intervalMs: () => 1000,
      run: (d) => buyOne(d, "carts", 10),
    },
    {
      id: "mills",
      unlocked: () => true,
      intervalMs: () => 0,
      run: (d) => buyOne(d, "mills", 10),
      priority: 5,
    },
  ],
});
const game = defineGame({
  id: "auto",
  save: { key: "auto.save", version: 1 },
  features: [wallet, shop, auto],
  vocab: WORDS,
});

describe("autobuyers", () => {
  test("the higher priority buys first from a balance that covers one", () => {
    const { store } = freshStore(game);
    store.getState().tick(100, T0 + 100);
    expect(store.getState().shop.mills).toBe(1);
    expect(store.getState().shop.carts).toBe(0);
    expect(store.getState().auto.bought.mills).toBe(1);
  });

  test("an interval of 0 fires every tick; an interval fires on its schedule", () => {
    const { store } = freshStore(game);
    store.getState().auto.toggle("mills", false);
    store.getState().wallet.credit("gold", 1000);
    for (let t = 300; t <= 10_200; t += 300) store.getState().tick(300, T0 + t);
    // First at 300, then every whole second after: 1300, 2300, … 10300 is past the end.
    expect(store.getState().shop.carts).toBe(10);
    expect(store.getState().auto.lastAt.carts).toBe(T0 + 9300);

    store.getState().auto.toggle("mills", true);
    store.getState().auto.toggle("carts", false);
    for (let t = 1; t <= 5; t++) store.getState().tick(100, T0 + 10_200 + t * 100);
    expect(store.getState().shop.mills).toBe(5);
  });

  test("a locked or switched-off autobuyer never fires", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit("gold", 1000);
    store.getState().auto.setAll(false);
    store.getState().tick(5000, T0 + 5000);
    expect(store.getState().shop.carts + store.getState().shop.mills).toBe(0);
    expect(auto.rules.nextInMs(store.getState(), "carts", T0 + 5000)).toBeNull();

    expect(store.getState().auto.toggle("carts")).toBe(true);
    store.getState().shop.lock(false);
    store.getState().tick(5000, T0 + 10_000);
    expect(store.getState().shop.carts).toBe(0);
    expect(store.getState().auto.toggle("nothing")).toBe(false);
  });

  test("a catch-up fires each at most once", () => {
    const { store, clock } = freshStore(game);
    store.getState().wallet.credit("gold", 1000);
    store.getState().auto.toggle("mills", false);
    store.getState().tick(100, T0 + 100);
    expect(store.getState().shop.carts).toBe(1);
    clock.advance(HOUR_MS);
    store.getState().catchUp();
    expect(store.getState().shop.carts).toBe(2);
  });

  test("a run reset keeps the switches and clears the rest", () => {
    const { store } = freshStore(game);
    store.getState().auto.toggle("carts", false);
    store.getState().tick(100, T0 + 100);
    expect(store.getState().auto.bought.mills).toBe(1);
    store.getState().resetRun();
    expect(store.getState().auto.on.carts).toBe(false);
    expect(store.getState().auto.bought.mills).toBe(0);
    expect(store.getState().auto.lastAt).toEqual({});
  });
});
