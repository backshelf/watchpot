import { describe, expect, test } from "bun:test";
import {
  type Decimal,
  defineAutobuyers,
  defineCurrencies,
  defineFeature,
  defineGame,
  everyMs,
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
const wallet = defineCurrencies({ key: "wallet", vocab: WORDS, start: { gold: 10 } });
const shop = defineFeature({
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
  if (!wallet.draft.debit(d, "gold", price)) return 0;
  d.shop[item] += 1;
  return 1;
};
const auto = defineAutobuyers({
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
    expect(auto.select.nextInMs(store.getState(), "carts", T0 + 5000)).toBeNull();

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

  test("a run that puts a new slice in place still counts what it bought", () => {
    type Slice = {
      on: Record<string, boolean>;
      lastAt: Record<string, number>;
      bought: Record<string, number>;
    };
    const swap = defineAutobuyers({
      key: "swap",
      list: [
        {
          id: "renew",
          unlocked: () => true,
          intervalMs: () => 0,
          run: (d: { swap: Slice }) => {
            // A game's own reset that replaces the record rather than writing into it.
            d.swap = { on: { ...d.swap.on }, lastAt: { ...d.swap.lastAt }, bought: {} };
            return 1;
          },
        },
      ],
    });
    const g = defineGame({ id: "swap", save: { key: "swap.save", version: 1 }, features: [swap] });
    const { store } = freshStore(g);
    store.getState().tick(100, T0 + 100);
    expect(store.getState().swap.bought.renew).toBe(1);
  });
});

describe("reach", () => {
  test("a callback reads a reached feature with no annotation, and not one that was not reached", () => {
    const door = defineFeature({ key: "door", initial: () => ({ open: true }) });
    const gated = defineAutobuyers({
      key: "gated",
      reach: [wallet, door],
      list: [
        {
          id: "a",
          unlocked: (s) => s.door.open && s.wallet.gold.gte(0),
          intervalMs: (s) => {
            // @ts-expect-error `lid` was never reached
            s.lid;
            return 1000;
          },
          run: (d) => (d.door.open ? 0 : 1),
        },
      ],
    });
    expect(gated.def.list).toHaveLength(1);
    expect(gated.needs).toBeUndefined();
  });
});

describe("autobuyers draft helpers", () => {
  test("toggle and setAll work inside a recipe as the actions do", () => {
    const { store } = freshStore(game);
    let after = true;
    store.setState((d) => {
      after = auto.draft.toggle(d, "carts");
    });
    expect(after).toBe(false);
    expect(store.getState().auto.on.carts).toBe(false);
    store.setState((d) => {
      auto.draft.setAll(d, false);
      after = auto.draft.toggle(d, "nope");
    });
    expect(after).toBe(false);
    expect(store.getState().auto.on.mills).toBe(false);
    expect(auto.def.autobuyer("mills")?.priority).toBe(5);
  });
});
