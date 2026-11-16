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
  earnedThisRun: { gold: "goldThisRun" },
  earnedEver: { gold: "goldEver" },
  spentEver: { gems: "gemsSpent" },
  extra: () => ({ dust: D(0) }),
  actions: ({ set }, { draft }) => ({
    sweep: () =>
      set((s) => {
        draft.credit(s, "gems", s.purse.dust);
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
    expect(s.goldThisRun.eq(0)).toBe(true);
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
    expect(s.goldThisRun.eq(12)).toBe(true);
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
    expect(s.goldThisRun.eq(0)).toBe(true);
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
      afford.before = purse.select.canAfford(s, "gold", 30);
      const p = purse.draft.purse(s);
      expect(p.debit("gold", 25)).toBe(true);
      expect(p.balance("gold").eq(5)).toBe(true);
      afford.after = purse.select.canAfford(s, "gold", 6);
    });
    expect(afford).toEqual({ before: true, after: false });
    expect(purse.select.balance(store.getState(), "gold").eq(5)).toBe(true);
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
    expect(s.goldThisRun.eq(70)).toBe(true);
  });

  test("it refuses a total for a word the vocabulary lacks, or a field taken twice", () => {
    // @ts-expect-error not a currency of the toy
    expect(() => currencies({ key: "p", vocab: TOY, earnedThisRun: { keys: "keysThisRun" } })).toThrow(
      /keys/,
    );
    expect(() => currencies({ key: "p", vocab: TOY, earnedEver: { gold: "gems" } })).toThrow(/gems/);
    expect(() => currencies({ key: "p", vocab: TOY, earnedThisRun: { gold: "debit" } })).toThrow(/debit/);
  });

  test("a name the wallet's own actions hold is refused at definition, wherever it is used", () => {
    const words = (c: string) => vocab({ currencies: ["gold", c], stats: [], rarities: ["common"] });
    for (const name of ["credit", "debit"])
      expect(() => currencies({ key: "p", vocab: words(name) })).toThrow(
        new RegExp(`currency "${name}" collides`),
      );
    expect(() => currencies({ key: "p", vocab: TOY, spentThisRun: { gems: "credit" } })).toThrow(
      /total "credit" collides/,
    );
    expect(() => currencies({ key: "p", vocab: TOY, extra: () => ({ gold: D(1) }) })).toThrow(
      /extra field "gold"/,
    );
    const shadowing = currencies({ key: "p", vocab: TOY, actions: () => ({ gems: () => {} }) });
    expect(() =>
      defineGame({ id: "x", save: { key: "x", version: 1 }, features: [shadowing], vocab: TOY }),
    ).toThrow(/action "gems"/);
  });

  test("a game without the purse's vocabulary refuses it", () => {
    expect(() => defineGame({ id: "bare", save: { key: "b", version: 1 }, features: [purse] })).toThrow();
  });
});

describe("reset depth and the two kinds of total", () => {
  const ledger = currencies({
    key: "ledger",
    vocab: TOY,
    start: { gold: 5 },
    depth: { gems: 2 },
    earnedThisRun: { gold: "goldThisRun", gems: "gemsThisRun" },
    earnedEver: { gold: "goldEver", gems: "gemsEver" },
    spentThisRun: { gold: "goldSpentThisRun" },
    spentEver: { gold: "goldSpentEver" },
    extra: () => ({ dust: D(0), marks: 0 }),
    reset: { keep: ["marks"] },
  });
  const deep = defineGame({ id: "deep", save: { key: "deep", version: 1 }, features: [ledger], vocab: TOY });
  const fill = () => {
    const store = createIdleStore(deep, {
      storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
      now: () => T0,
    });
    store.getState().ledger.credit("gold", 100);
    store.getState().ledger.debit("gold", 40);
    store.getState().ledger.credit("gems", 7);
    store.setState((s) => {
      s.ledger.dust = D(3);
      s.ledger.marks = 2;
    });
    return store;
  };

  test("a reset shallower than a currency's depth leaves it and its run totals alone; ever totals always stay", () => {
    const store = fill();
    store.getState().resetRun({ depth: 1 });
    const s = store.getState().ledger;
    // Gold (depth 1) is back at its start, its run totals at zero; its ever totals keep every unit.
    expect(s.gold.eq(5)).toBe(true);
    expect(s.goldThisRun.eq(0)).toBe(true);
    expect(s.goldSpentThisRun.eq(0)).toBe(true);
    expect(s.goldEver.eq(100)).toBe(true);
    expect(s.goldSpentEver.eq(40)).toBe(true);
    // Gems (depth 2) are untouched by a depth-1 reset, run total included.
    expect(s.gems.eq(7)).toBe(true);
    expect(s.gemsThisRun.eq(7)).toBe(true);
    // The extras follow `reset`.
    expect(s.dust.eq(0)).toBe(true);
    expect(s.marks).toBe(2);
  });

  test("a reset at a currency's depth wipes it and its run totals, and still keeps the ever totals", () => {
    const store = fill();
    store.getState().resetRun({ depth: 2 });
    const s = store.getState().ledger;
    expect(s.gems.eq(0)).toBe(true);
    expect(s.gemsThisRun.eq(0)).toBe(true);
    expect(s.gemsEver.eq(7)).toBe(true);
    expect(s.goldEver.eq(100)).toBe(true);
  });

  test("an ever total is never below its run total, and a profile reset clears both", () => {
    const store = fill();
    for (const depth of [1, 2, 1]) {
      store.getState().ledger.credit("gold", 10);
      store.getState().resetRun({ depth });
      const s = store.getState().ledger;
      expect(s.goldEver.gte(s.goldThisRun)).toBe(true);
      expect(s.gemsEver.gte(s.gemsThisRun)).toBe(true);
    }
    store.getState().resetProfile();
    expect(store.getState().ledger.goldEver.eq(0)).toBe(true);
  });

  test("a currency that never resets outlives every depth; def.depth states each one", () => {
    const keeper = currencies({ key: "k", vocab: TOY, depth: { gems: "never" } });
    expect(keeper.def.depth).toEqual({ gold: 1, gems: Number.POSITIVE_INFINITY });
    const g = defineGame({ id: "k", save: { key: "k", version: 1 }, features: [keeper], vocab: TOY });
    const store = createIdleStore(g, {
      storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
      now: () => T0,
    });
    store.getState().k.credit("gems", 4);
    store.getState().k.credit("gold", 4);
    store.getState().resetRun({ depth: 9 });
    expect(store.getState().k.gems.eq(4)).toBe(true);
    expect(store.getState().k.gold.eq(0)).toBe(true);
  });

  test("a depth under 1, or for a word the vocabulary lacks, is refused", () => {
    expect(() => currencies({ key: "p", vocab: TOY, depth: { gold: 0 } })).toThrow(/depth of "gold"/);
    // @ts-expect-error not a currency of the toy
    expect(() => currencies({ key: "p", vocab: TOY, depth: { keys: 2 } })).toThrow(/keys/);
  });
});
