import { expect, test } from "bun:test";
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  currencies,
  defineGame,
  feature,
  type GeneratorsState,
  generators,
  reach,
  vocab,
} from "../../src/core";

type LidState = { open: boolean };
type StoveState = { burners: number };

// 1. A value reach of a feature declared further down the file.
const pot = feature({
  key: "pot",
  initial: () => ({ bubbles: 0 }),
  reach: () => [stove],
  actions: (api) => ({
    boil: () =>
      api.set((d) => {
        d.pot.bubbles += d.stove.burners;
        // @ts-expect-error pot never reached lid
        d.lid;
      }),
  }),
});

// 2. A cycle: lid reaches stove by value, stove reaches lid by type.
const lid = feature({
  key: "lid",
  initial: (): LidState => ({ open: false }),
  reach: () => [stove],
  actions: (api) => ({
    slam: () =>
      api.set((d) => {
        d.stove.burners += 1;
        d.lid.open = false;
      }),
  }),
});

const stove = feature({
  key: "stove",
  initial: (): StoveState => ({ burners: 0 }),
  reach: reach<{ lid: LidState }>(),
  actions: (api) => ({
    vent: () =>
      api.set((d) => {
        d.lid.open = true;
        d.stove.burners = 0;
      }),
  }),
});

// 3. A mix: one by value, one by type, and a third feature reaching both sides of the cycle by type.
const fan = feature({
  key: "fan",
  initial: () => ({ rpm: 0 }),
  reach: () => [pot, reach<{ lid: LidState; stove: StoveState }>()],
  steps: {
    produce: {
      spin: {
        pass: "both",
        run: (d) => {
          d.fan.rpm = d.lid.open ? d.stove.burners + d.pot.bubbles : 0;
        },
      },
    },
  },
});

const save = { key: "spike.save", version: 1 } as const;
const game = defineGame({ id: "spike", save, features: [pot, lid, stove, fan] });

test("a lazy reach and a type reach play together", () => {
  const store = createIdleStore(game, { now: () => 0, storage: createGameStorage(createMemoryBackend()) });
  store.getState().lid.slam();
  store.getState().pot.boil();
  expect(store.getState().stove.burners).toBe(1);
  expect(store.getState().pot.bubbles).toBe(1);
  store.getState().stove.vent();
  expect(store.getState().lid.open).toBe(true);
  expect(pot.reach()).toEqual([stove]);
  expect(fan.reach()).toEqual([pot]);
});

test("a type reach is checked against the game", () => {
  const typo = feature({
    key: "typo",
    initial: () => ({}),
    reach: reach<{ ldi: LidState }>(),
  });
  const drift = feature({
    key: "drift",
    initial: () => ({}),
    reach: reach<{ lid: { open: string } }>(),
  });
  // @ts-expect-error no feature is keyed "ldi"
  defineGame({ id: "typo", save, features: [lid, stove, typo] });
  // @ts-expect-error lid's `open` is a boolean
  defineGame({ id: "drift", save, features: [lid, stove, drift] });
  // @ts-expect-error stove reaches lid by type, and this game has no lid
  defineGame({ id: "missing", save, features: [stove] });
});

// 4. An engine factory in a cycle: the generators' callbacks read the kitchen, and the kitchen reads the generators.
const WORDS = vocab({ currencies: ["bubbles"], stats: [], rarities: ["common"] } as const);
const wallet = currencies({ key: "wallet", vocab: WORDS, start: { bubbles: 100 } });

const burners = generators({
  key: "burners",
  wallet,
  reach: () => [kitchen],
  list: [{ id: "burner", pays: "bubbles", makes: "bubbles", rate: 1, cost: { base: 10, growth: 1.15 } }],
  mult: (s) => {
    // @ts-expect-error burners never reached lid
    s.lid;
    return s.kitchen.hot ? 2 * Number(s.wallet.bubbles.gt(0)) : s.burners.owned.burner === 0 ? 1 : 1;
  },
  open: (s, g) => s.kitchen.hot || g.id === "burner",
});

const kitchen = feature({
  key: "kitchen",
  initial: () => ({ hot: false }),
  reach: reach<{ burners: GeneratorsState }>(),
  steps: {
    settle: {
      heat: (d) => {
        d.kitchen.hot = (d.burners.owned.burner ?? 0) >= 1;
      },
    },
  },
});

const cooking = defineGame({ id: "cooking", save, vocab: WORDS, features: [wallet, burners, kitchen] });

test("a factory's callbacks reach a feature that reaches the factory", () => {
  const store = createIdleStore(cooking, { now: () => 0, storage: createGameStorage(createMemoryBackend()) });
  expect(store.getState().burners.buy("burner")).toBe(true);
  store.getState().tick(1000);
  expect(store.getState().kitchen.hot).toBe(true);
  expect(burners.select.rate(store.getState(), "burner").toNumber()).toBe(2);
});
