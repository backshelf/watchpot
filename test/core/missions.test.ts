import { describe, expect, test } from "bun:test";
import {
  currencies,
  D,
  type Decimal,
  defineGame,
  HOUR_MS,
  MINUTE_MS,
  missionLeftMs,
  missionReady,
  missions,
  nextInt,
  vocab,
} from "watchpot/core";
import { autoPlayer, createSimWorld, simStore } from "watchpot/sim";
import { freshStore, T0 } from "watchpot/test";

describe("missionLeftMs and missionReady", () => {
  test("read an entry against now", () => {
    expect(missionLeftMs({ endsAt: 5000 }, 3000)).toBe(2000);
    expect(missionLeftMs({ endsAt: 5000 }, 9000)).toBe(0);
    expect(missionReady({ endsAt: 5000 }, 4999)).toBe(false);
    expect(missionReady({ endsAt: 5000 }, 5000)).toBe(true);
  });
});

const WORDS = vocab({ currencies: ["gold", "gems"], stats: [], rarities: ["common"] } as const);
const wallet = currencies({ key: "wallet", vocab: WORDS, start: { gold: 100 } });
type State = { wallet: { gold: Decimal; gems: Decimal } };
type Price = { gold: number };
const trips = missions({
  key: "trips",
  slots: (s: State) => (s.wallet.gems.gte(10) ? 3 : 2),
  list: [
    {
      id: "short",
      durationMs: () => MINUTE_MS,
      reward: (_s, rng) => ({ gems: 1 + nextInt(rng, 1000)[0] }),
    },
    {
      id: "long",
      durationMs: () => HOUR_MS,
      cost: { gold: 60 } satisfies Price,
      reward: (_s, rng) => ({ gems: 100 + nextInt(rng, 1000)[0] }),
    },
    {
      id: "late",
      durationMs: () => MINUTE_MS,
      available: (s) => s.wallet.gold.gte(1000),
      reward: () => ({ gems: 0 }),
    },
  ],
  pay: (d, m) => (m.cost ? wallet.draft.debit(d, "gold", m.cost.gold) : true),
  onClaim: (d, reward) => wallet.draft.credit(d, "gems", reward.gems),
});
const game = defineGame({
  id: "trips",
  save: { key: "trips.save", version: 1 },
  features: [wallet, trips],
  vocab: WORDS,
});

describe("missions", () => {
  test("start refuses with a reason: unknown, unavailable, no slot, cannot pay", () => {
    const { store } = freshStore(game);
    expect(store.getState().trips.start("nothing")).toBe("unknown");
    expect(store.getState().trips.start("late")).toBe("unavailable");
    expect(store.getState().trips.start("long")).toBeNull();
    expect(store.getState().wallet.gold.toNumber()).toBe(40);
    expect(store.getState().trips.start("long")).toBe("cannot-pay");
    expect(store.getState().wallet.gold.toNumber()).toBe(40);
    expect(store.getState().trips.start("short")).toBeNull();
    expect(store.getState().trips.start("short")).toBe("no-slot");
    expect(trips.select.freeSlots(store.getState())).toBe(0);
  });

  test("the reward is rolled at the start, stored, and survives a reload", () => {
    const { store } = freshStore(game, { seed: "s" });
    store.getState().trips.start("short");
    store.getState().trips.start("short");
    const [a, b] = store.getState().trips.active;
    if (!a || !b) throw new Error("no entries");
    expect(a.reward.gems).toBeGreaterThan(0);
    expect(a.id).not.toBe(b.id);
    expect(a.reward).not.toEqual(b.reward); // two starts, two rolls
    const saved = store.getState().exportProfile();
    store.getState().importProfile(saved);
    expect(store.getState().trips.active.map((x) => x.reward)).toEqual([a.reward, b.reward]);

    // The same seed rolls the same rewards.
    const again = freshStore(game, { seed: "s" }).store;
    again.getState().trips.start("short");
    expect(again.getState().trips.active[0]?.reward).toEqual(a.reward);
  });

  test("a claim waits until it is back, pays once and frees the slot", () => {
    const { store, clock } = freshStore(game);
    store.getState().trips.start("short");
    const entry = store.getState().trips.active[0];
    if (!entry) throw new Error("no entry");
    expect(store.getState().trips.claim(entry.id)).toBe(false);
    clock.advance(MINUTE_MS);
    expect(store.getState().trips.claim(entry.id)).toBe(true);
    expect(store.getState().trips.claim(entry.id)).toBe(false);
    expect(store.getState().wallet.gems.toNumber()).toBe(entry.reward.gems);
    expect(store.getState().trips.done.short).toBe(1);
    expect(store.getState().trips.active).toEqual([]);
  });

  test("a mission finishes during an absence; a cancel frees the slot and refunds nothing", () => {
    const { store, clock } = freshStore(game);
    store.getState().trips.start("long");
    store.getState().trips.start("short");
    const [long, short] = store.getState().trips.active;
    if (!long || !short) throw new Error("no entries");
    clock.advance(2 * HOUR_MS);
    store.getState().catchUp();
    expect(trips.select.ready(store.getState(), clock.now()).length).toBe(2);
    expect(store.getState().trips.cancel(short.id)).toBe(true);
    expect(store.getState().trips.cancel("nothing")).toBe(false);
    expect(store.getState().trips.claim(long.id)).toBe(true);
    expect(store.getState().wallet.gold.toNumber()).toBe(40);
    expect(store.getState().wallet.gems.toNumber()).toBe(long.reward.gems);
  });

  test("the auto-player claims what is back and starts what fits", () => {
    const world = createSimWorld((now) => simStore(game, now, "seed"), T0);
    const player = autoPlayer<State>(game, { balance: (s, c) => (c === "gold" ? s.wallet.gold : D(0)) });
    for (let i = 0; i < 30; i++) {
      player.look(world.store);
      world.play(MINUTE_MS);
    }
    const s = world.store.getState();
    expect(s.trips.done.short ?? 0).toBeGreaterThan(5);
    expect(s.trips.active.length).toBe(trips.select.slots(s));
    expect(s.wallet.gems.toNumber()).toBeGreaterThan(0);
  });
});

describe("missions namespaces and reach", () => {
  test("def holds the list and a lookup, draft is empty", () => {
    expect(trips.def.list.map((m) => m.id)).toEqual(["short", "long", "late"]);
    expect(trips.def.mission("long")?.durationMs({} as never)).toBe(HOUR_MS);
    expect(trips.def.mission("nothing")).toBeUndefined();
    expect(trips.draft).toEqual({});
  });

  test("`reach` types the callbacks: a reached feature reads, an unreached one does not", () => {
    const reached = missions({
      key: "errands",
      reach: () => [wallet],
      slots: (s) => (s.wallet.gems.gte(1) ? 2 : 1),
      list: [
        {
          id: "a",
          durationMs: () => 1,
          available: (s) => s.wallet.gold.gte(1) && s.errands.serial >= 0,
          reward: () => 1,
        },
      ],
      onClaim: (d) => wallet.draft.credit(d, "gems", 1),
    });
    missions({
      key: "bad",
      reach: [wallet],
      // @ts-expect-error nothing reached a "moon"
      slots: (s) => s.moon.phase,
      list: [],
    });
    expect(reached.def.list.length).toBe(1);
  });
});
