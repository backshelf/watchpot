import { describe, expect, test } from "bun:test";
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  currencies,
  D,
  defineGame,
  vocab,
} from "watchpot/core";

const T0 = Date.UTC(2026, 9, 29, 12);

const TOY = vocab({
  currencies: ["gold", "gems"],
  stats: ["toy.speed"],
  rarities: ["common", "rare"],
} as const);

const purse = currencies({
  key: "purse",
  vocab: TOY,
  start: { gold: 30 },
  earned: { gold: "lifetimeGold" },
  spent: { gems: "gemsSpent" },
  extra: () => ({ dust: D(0) }),
  actions: ({ set }, helpers) => ({
    sweep: () =>
      set((s) => {
        helpers.credit(s, "gems", s.purse.dust);
        s.purse.dust = D(0);
      }),
  }),
});

const game = defineGame({ id: "toy", save: { key: "toy.save", version: 1 }, features: [purse], vocab: TOY });

function storeOf(backend = createMemoryBackend()) {
  return createIdleStore(game, { storage: createGameStorage(backend, { debounceMs: 0 }), now: () => T0 });
}

describe("currencies", () => {
  test("a fresh purse holds its starting balances, zero elsewhere, and the game's own fields", () => {
    const s = storeOf().getState().purse;
    expect(s.gold.eq(30)).toBe(true);
    expect(s.gems.eq(0)).toBe(true);
    expect(s.lifetimeGold.eq(0)).toBe(true);
    expect(s.gemsSpent.eq(0)).toBe(true);
    expect(s.dust.eq(0)).toBe(true);
  });

  test("credit adds and keeps the earned total; nothing or less is ignored", () => {
    const store = storeOf();
    store.getState().purse.credit("gold", 12);
    store.getState().purse.credit("gold", -5);
    store.getState().purse.credit("gems", 4);
    const s = store.getState().purse;
    expect(s.gold.eq(42)).toBe(true);
    expect(s.lifetimeGold.eq(12)).toBe(true);
    expect(s.gems.eq(4)).toBe(true);
  });

  test("debit takes what the balance covers, keeps the spent total, and refuses the rest untouched", () => {
    const store = storeOf();
    store.getState().purse.credit("gems", 10);
    expect(store.getState().purse.debit("gems", 7)).toBe(true);
    expect(store.getState().purse.debit("gems", 7)).toBe(false);
    const s = store.getState().purse;
    expect(s.gems.eq(3)).toBe(true);
    expect(s.gemsSpent.eq(7)).toBe(true);
    expect(s.lifetimeGold.eq(0)).toBe(true);
  });

  test("a negative debit is refused: it neither credits nor shrinks the spent total", () => {
    const store = storeOf();
    store.getState().purse.credit("gems", 10);
    expect(store.getState().purse.debit("gems", -5)).toBe(false);
    const s = store.getState().purse;
    expect(s.gems.eq(10)).toBe(true);
    expect(s.gemsSpent.eq(0)).toBe(true);
  });

  test("the draft helpers work inside a recipe, and a purse pays a tree's way", () => {
    const store = storeOf();
    const afford = { before: false, after: true };
    store.setState((s) => {
      afford.before = purse.canAfford(s, "gold", 30);
      const p = purse.purse(s);
      expect(p.debit("gold", 25)).toBe(true);
      expect(p.balance("gold").eq(5)).toBe(true);
      afford.after = purse.canAfford(s, "gold", 6);
    });
    expect(afford).toEqual({ before: true, after: false });
    expect(purse.balance(store.getState(), "gold").eq(5)).toBe(true);
  });

  test("the game's own actions sit beside credit and debit", () => {
    const store = storeOf();
    store.setState((s) => {
      s.purse.dust = D(9);
    });
    store.getState().purse.sweep();
    expect(store.getState().purse.gems.eq(9)).toBe(true);
    expect(store.getState().purse.dust.eq(0)).toBe(true);
  });

  test("balances and totals survive a reload", () => {
    const backend = createMemoryBackend();
    const a = storeOf(backend);
    a.getState().purse.credit("gold", 70);
    const s = storeOf(backend).getState().purse;
    expect(s.gold.eq(100)).toBe(true);
    expect(s.lifetimeGold.eq(70)).toBe(true);
  });

  test("it refuses a total for a word the vocabulary lacks, or a field taken twice", () => {
    // @ts-expect-error not a currency of the toy
    expect(() => currencies({ key: "p", vocab: TOY, earned: { keys: "lifetimeKeys" } })).toThrow(/keys/);
    expect(() => currencies({ key: "p", vocab: TOY, earned: { gold: "gems" } })).toThrow(/gems/);
    expect(() => currencies({ key: "p", vocab: TOY, earned: { gold: "debit" } })).toThrow(/debit/);
  });

  test("a name the wallet's own actions hold is refused at definition, wherever it is used", () => {
    const words = (c: string) => vocab({ currencies: ["gold", c], stats: [], rarities: ["common"] });
    for (const name of ["credit", "debit"])
      expect(() => currencies({ key: "p", vocab: words(name) })).toThrow(
        new RegExp(`currency "${name}" collides`),
      );
    expect(() => currencies({ key: "p", vocab: TOY, spent: { gems: "credit" } })).toThrow(
      /total "credit" collides/,
    );
    expect(() =>
      defineGame({
        id: "x",
        save: { key: "x", version: 1 },
        features: [currencies({ key: "p", vocab: TOY, extra: () => ({ gold: D(1) }) })],
        vocab: TOY,
      }),
    ).toThrow(/extra field "gold"/);
    const shadowing = currencies({ key: "p", vocab: TOY, actions: () => ({ gems: () => {} }) });
    const game = defineGame({ id: "x", save: { key: "x", version: 1 }, features: [shadowing], vocab: TOY });
    expect(() =>
      createIdleStore(game, {
        storage: createGameStorage(createMemoryBackend(), { debounceMs: 0, onError: () => {} }),
        now: () => T0,
      }),
    ).toThrow(/action "gems"/);
  });

  test("a game without the purse's vocabulary refuses it", () => {
    expect(() => defineGame({ id: "bare", save: { key: "b", version: 1 }, features: [purse] })).toThrow();
  });
});
