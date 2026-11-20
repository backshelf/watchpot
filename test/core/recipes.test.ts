import { describe, expect, test } from "bun:test";
import {
  type CraftPurse,
  canCraft,
  craft,
  D,
  type Decimal,
  defineCrafting,
  defineCurrencies,
  defineFeature,
  defineGame,
  HOUR_MS,
  maxCraftable,
  type Recipe,
  recipeCost,
  vocab,
} from "watchpot/core";
import { freshStore, T0 } from "watchpot/test";

type C = "ore" | "bar" | "gem";
const purseOf = (start: Partial<Record<C, number>>) => {
  const held = new Map<C, Decimal>(Object.entries(start).map(([c, a]) => [c as C, D(a ?? 0)]));
  const purse: CraftPurse<C> = {
    balance: (c) => held.get(c) ?? D(0),
    debit: (c, a) => {
      const b = held.get(c) ?? D(0);
      if (b.lt(a)) return false;
      held.set(c, b.sub(a));
      return true;
    },
    credit: (c, a) => held.set(c, (held.get(c) ?? D(0)).add(a)),
  };
  return { purse, held: (c: C) => (held.get(c) ?? D(0)).toNumber() };
};
const SMELT: Recipe<C> = { inputs: { ore: 3, gem: 1 }, outputs: { bar: 2, gem: 0.5 } };

describe("canCraft, maxCraftable and craft", () => {
  test("the fewest whole crafts any input allows", () => {
    const { purse } = purseOf({ ore: 10, gem: 2 });
    expect(maxCraftable(SMELT, purse)).toBe(2);
    expect(maxCraftable(SMELT, purse, 1)).toBe(1);
    expect(canCraft(SMELT, purse, 2)).toBe(true);
    expect(canCraft(SMELT, purse, 3)).toBe(false);
    expect(canCraft(SMELT, purse, 0)).toBe(false);
    expect(maxCraftable({ inputs: {}, outputs: { bar: 1 } }, purse)).toBe(0);
    expect(maxCraftable({ inputs: {}, outputs: { bar: 1 } }, purse, 5)).toBe(5);
  });

  test("all or nothing: a short purse is left untouched", () => {
    const { purse, held } = purseOf({ ore: 10, gem: 2 });
    expect(craft(SMELT, purse, 3)).toBeNull();
    expect([held("ore"), held("gem"), held("bar")]).toEqual([10, 2, 0]);
  });

  test("multi-input, multi-output, scaled by the yield", () => {
    const { purse, held } = purseOf({ ore: 10, gem: 2 });
    const made = craft(SMELT, purse, 2, 1.5);
    expect(made?.bar?.toNumber()).toBe(6);
    expect([held("ore"), held("gem"), held("bar")]).toEqual([4, 1.5, 6]);
  });

  test("crafting n at once equals crafting one n times", () => {
    const a = purseOf({ ore: 100, gem: 40 });
    const b = purseOf({ ore: 100, gem: 40 });
    const n = maxCraftable(SMELT, a.purse);
    craft(SMELT, a.purse, n);
    for (let i = 0; i < n; i++) craft(SMELT, b.purse);
    for (const c of ["ore", "bar", "gem"] as const) expect(a.held(c)).toBeCloseTo(b.held(c));
  });
});

const WORDS = vocab({ currencies: ["gold", "gems"], stats: [], rarities: ["common"] } as const);
const wallet = defineCurrencies({ key: "wallet", vocab: WORDS, start: { gold: 100 } });
type State = { wallet: { gold: Decimal; gems: Decimal } };
const forge = defineCrafting({
  key: "forge",
  wallet,
  list: [
    {
      id: "cut",
      inputs: { gold: 10 },
      outputs: { gems: 1 },
      yield: (s: State) => (s.wallet.gems.gte(5) ? 2 : 1),
    },
    { id: "slow", inputs: { gold: 5 }, outputs: { gems: 3 }, takesMs: 10_000 },
    { id: "late", inputs: { gold: 1 }, outputs: { gems: 1 }, unlocked: (s) => s.wallet.gems.gte(1000) },
  ],
});
const game = defineGame({
  id: "forge",
  save: { key: "forge.save", version: 1 },
  features: [wallet, forge],
  vocab: WORDS,
});

describe("crafting", () => {
  test("an instant craft takes and gives at once; the yield reads the state", () => {
    const { store } = freshStore(game);
    expect(store.getState().forge.craft("cut", 5)).toBe(true);
    expect(store.getState().wallet.gems.toNumber()).toBe(5);
    expect(store.getState().forge.craft("cut")).toBe(true);
    expect(store.getState().wallet.gems.toNumber()).toBe(7); // five gems held doubles the yield
    expect(store.getState().forge.made.cut?.toNumber()).toBe(6);
    expect(store.getState().forge.craft("cut", 99)).toBe(false);
    expect(store.getState().forge.craft("late")).toBe(false);
    expect(store.getState().forge.craftMax("cut")).toBe(4);
    expect(store.getState().wallet.gold.toNumber()).toBe(0);
  });

  test("a timed craft pays at once and gives one at a time; one long step equals many short", () => {
    const play = (steps: number, each: number) => {
      const { store } = freshStore(game);
      expect(store.getState().forge.craft("slow", 3)).toBe(true);
      expect(store.getState().wallet.gold.toNumber()).toBe(85);
      for (let i = 1; i <= steps; i++) store.getState().tick(each, T0 + i * each);
      return store.getState();
    };
    const long = play(1, 25_000);
    const short = play(250, 100);
    expect(long.wallet.gems.toNumber()).toBe(6);
    expect(short.wallet.gems.toNumber()).toBe(6);
    expect(forge.select.job(long, "slow")).toMatchObject({ times: 3, done: 2 });
    expect(forge.select.nextInMs(long, "slow", T0 + 25_000)).toBe(5000);
  });

  test("a second craft extends the job; a queue finishes during an absence", () => {
    const { store, clock } = freshStore(game);
    store.getState().forge.craft("slow");
    store.getState().forge.craft("slow", 2);
    expect(store.getState().forge.queue).toHaveLength(1);
    clock.advance(HOUR_MS);
    store.getState().catchUp();
    expect(store.getState().wallet.gems.toNumber()).toBe(9);
    expect(store.getState().forge.queue).toEqual([]);
    expect(store.getState().forge.made.slow?.toNumber()).toBe(3);
  });

  test("a time that reads the state: the craft under way keeps its progress and the rest runs at the new pace", () => {
    const heard: [string, number][] = [];
    const quick = defineCrafting({
      key: "forge",
      wallet,
      list: [
        { id: "cut", inputs: { gold: 1 }, outputs: { gems: 1 } },
        {
          id: "spin",
          inputs: { gold: 5 },
          outputs: { gold: 0 },
          takesMs: (s: State) => (s.wallet.gems.gte(100) ? 5000 : 10_000),
        },
      ],
      onCraft: (_d, recipe, times) => {
        heard.push([recipe.id, times]);
      },
    });
    const { store } = freshStore(
      defineGame({
        id: "forge",
        save: { key: "forge.save", version: 1 },
        features: [wallet, quick],
        vocab: WORDS,
      }),
    );
    expect(store.getState().forge.craft("spin", 3)).toBe(true);
    store.getState().tick(5000, T0 + 5000);
    expect(quick.select.nextInMs(store.getState(), "spin", T0 + 5000)).toBe(5000);
    store.getState().wallet.credit("gems", 100); // the pace doubles: half a craft at the old pace is half at the new
    store.getState().tick(1, T0 + 5000);
    expect(quick.select.nextInMs(store.getState(), "spin", T0 + 5000)).toBe(2500);
    store.getState().tick(12_500, T0 + 17_500);
    expect(store.getState().forge.made.spin?.toNumber()).toBe(3);
    expect(store.getState().forge.queue).toEqual([]);
    expect(heard).toEqual([["spin", 3]]); // one pass gave all three: one batch

    store.getState().forge.craft("cut", 4);
    store.setState((d) => {
      quick.draft.craft(d, "cut", 2, T0);
    });
    expect(heard).toEqual([
      ["spin", 3],
      ["cut", 4],
      ["cut", 2],
    ]);
  });

  test("a repeated id or a zero time throws", () => {
    const one = { id: "a", inputs: {}, outputs: {} };
    expect(() => defineCrafting({ key: "x", wallet, list: [one, one] })).toThrow(/twice/);
    expect(() => defineCrafting({ key: "x", wallet, list: [{ ...one, takesMs: 0 }] })).toThrow(/above zero/);
  });

  test("scaled costs and recipe limits scale each craft by how many were made or queued", () => {
    const scaled = defineCrafting({
      key: "scaled",
      wallet,
      list: [
        {
          id: "cap",
          inputs: { gold: 10, gems: 2 },
          costGrowth: { gold: 2, gems: 1.5 },
          outputs: {},
        },
        {
          id: "relic",
          inputs: { gold: 20 },
          costGrowth: 2,
          limit: 1,
          outputs: {},
          takesMs: 10_000,
        },
      ],
    });
    const { store } = freshStore(
      defineGame({
        id: "scaled",
        save: { key: "scaled.save", version: 1 },
        features: [wallet, scaled],
        vocab: WORDS,
      }),
    );
    store.getState().wallet.credit("gems", 10);

    // First craft: 10 gold, 2 gems; second: 20 gold, 3 gems; third: 40 gold, 4 gems (floored 2 * 1.5^2 = 4.5 -> 4).
    expect(scaled.select.cost(store.getState(), "cap").gold?.toNumber()).toBe(10);
    expect(scaled.select.cost(store.getState(), "cap").gems?.toNumber()).toBe(2);
    expect(scaled.select.craftable(store.getState(), "cap")).toBe(3); // 10+20+40=70 <= 100 gold; 2+3+4=9 <= 10 gems
    expect(store.getState().scaled.craft("cap", 1)).toBe(true);
    expect(store.getState().wallet.gold.toNumber()).toBe(90);
    expect(store.getState().wallet.gems.toNumber()).toBe(8);
    expect(scaled.select.cost(store.getState(), "cap").gold?.toNumber()).toBe(20);
    expect(scaled.select.cost(store.getState(), "cap").gems?.toNumber()).toBe(3);
    expect(recipeCost({ inputs: { gold: 10 }, costGrowth: 2, outputs: {} }, 2, 1).gold?.toNumber()).toBe(60);

    // Timed relic with limit: 1 cannot be crafted or queued a second time even before its timer finishes.
    expect(scaled.select.craftable(store.getState(), "relic")).toBe(1);
    expect(store.getState().scaled.craft("relic", 1)).toBe(true);
    expect(scaled.select.craftable(store.getState(), "relic")).toBe(0);
    expect(store.getState().scaled.craft("relic", 1)).toBe(false);
  });
});

describe("reach", () => {
  test("a callback reads a reached feature with no annotation, and not one that was not reached", () => {
    const door = defineFeature({ key: "door", initial: () => ({ open: true }) });
    const gated = defineCrafting({
      key: "gated",
      wallet,
      reach: [door],
      list: [
        {
          id: "a",
          inputs: { gold: 1 },
          outputs: { gems: 1 },
          unlocked: (s) => s.door.open && s.wallet.gold.gte(0),
          yield: (s) => {
            // @ts-expect-error `lid` was never reached
            s.lid;
            return 1;
          },
        },
      ],
    });
    expect(gated.def.list).toHaveLength(1);
    expect(gated.needs).toBeUndefined();
  });
});

describe("crafting draft helpers", () => {
  test("craft and craftMax inside a recipe do what the actions do", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit("gold", 100);
    let ok = false;
    let n = 0;
    store.setState((d) => {
      ok = forge.draft.craft(d, "cut", 2, T0);
      n = forge.draft.craftMax(d, "cut", T0);
    });
    expect(ok).toBe(true);
    expect(n).toBeGreaterThan(0);
    expect(store.getState().forge.made.cut?.toNumber()).toBe(2 + n);
    expect(forge.def.recipe("cut")?.id).toBe("cut");
  });
});
