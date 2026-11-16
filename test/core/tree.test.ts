import { describe, expect, test } from "bun:test";
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  D,
  type Decimal,
  defineCurrencies,
  defineFeature,
  defineGame,
  defineUpgradeTree,
  type Effect,
  type GraphNode,
  type Purse,
  tree,
  treeMoves,
  vocab,
  withMoves,
} from "watchpot/core";
import { autoPlayer } from "watchpot/sim";
import { totals } from "./fold";

const T0 = Date.UTC(2026, 9, 29, 12);

const TOY = vocab({ currencies: ["gold", "gems"], stats: ["toy.speed"], rarities: ["common"] } as const);
type Node = GraphNode<Effect, "gold" | "gems">;

const NODES: readonly Node[] = [
  {
    id: "drill",
    name: "Drill",
    line: "",
    cost: [{ currency: "gold", amount: 10 }],
    costGrowth: 2,
    maxLevel: 3,
    requires: [],
    effects: [{ stat: "toy.speed", add: 1 }],
  },
  {
    id: "laser",
    name: "Laser",
    line: "",
    cost: [
      { currency: "gold", amount: 5 },
      { currency: "gems", amount: 1 },
    ],
    costGrowth: 1.5,
    maxLevel: 20,
    requires: ["drill"],
    effects: [{ stat: "toy.speed", mul: 1.5 }],
  },
];

/** A purse over plain numbers, for the rules on their own. */
function memoryPurse(
  start: Record<"gold" | "gems", number>,
): Purse<"gold" | "gems"> & { held: typeof start } {
  const held = { ...start };
  return {
    held,
    balance: (c): Decimal => D(held[c]),
    debit: (c, amount) => {
      if (held[c] < D(amount).toNumber()) return false;
      held[c] -= D(amount).toNumber();
      return true;
    },
  };
}

describe("tree", () => {
  const rules = tree({ id: "mine", nodes: NODES });

  test("a rank checks its requirements, pays every currency of its price, and raises the next price", () => {
    const ranks: Record<string, number> = {};
    const purse = memoryPurse({ gold: 100, gems: 5 });
    expect(rules.buy(ranks, "laser", purse)).toEqual({ ok: false, code: "requires", node: "drill" });
    expect(rules.buy(ranks, "drill", purse)).toEqual({ ok: true, id: "drill", level: 1 });
    expect(rules.buy(ranks, "laser", purse)).toEqual({ ok: true, id: "laser", level: 1 });
    expect(purse.held).toEqual({ gold: 85, gems: 4 });
    const next = rules.price(NODES[0] as Node, 1)?.[0]?.amount;
    expect(next?.gt(10)).toBe(true);
  });

  test("it refuses an unknown node, a maxed one and one the purse cannot cover, and pays nothing for them", () => {
    const purse = memoryPurse({ gold: 100, gems: 0 });
    expect(rules.buy({}, "nope", purse)).toEqual({ ok: false, code: "unknown" });
    expect(rules.buy({ drill: 3 }, "drill", purse)).toEqual({ ok: false, code: "maxed" });
    expect(rules.price(NODES[0] as Node, 3)).toBeNull();
    const short = rules.buy({ drill: 1 }, "laser", purse);
    expect(short.ok === false && short.code).toBe("cannot-afford");
    expect(purse.held).toEqual({ gold: 100, gems: 0 });
  });

  test("two price lines in one currency are summed: a purse short of the sum gets no rank and pays nothing", () => {
    const twice = tree({
      id: "twice",
      nodes: [
        {
          ...(NODES[0] as Node),
          id: "twin",
          cost: [
            { currency: "gold", amount: 60 },
            { currency: "gold", amount: 60 },
          ],
        },
      ],
    });
    const ranks: Record<string, number> = {};
    const purse = memoryPurse({ gold: 100, gems: 0 });
    const short = twice.buy(ranks, "twin", purse);
    expect(short.ok === false && short.code).toBe("cannot-afford");
    expect(ranks.twin).toBeUndefined();
    expect(purse.held.gold).toBe(100);
  });

  test("buying max is buying one at a time until a buy fails, on any price, and stops at the last rank", () => {
    const base = NODES[0] as Node;
    const shop = tree<Node>({
      id: "shop",
      nodes: [
        ...NODES,
        { ...base, id: "steep", cost: [{ currency: "gold", amount: 7 }], costGrowth: 1.37, maxLevel: 400 },
        {
          ...base,
          id: "pair",
          cost: [
            { currency: "gold", amount: 3 },
            { currency: "gold", amount: 4.5 },
          ],
          costGrowth: 1.2,
          maxLevel: 400,
        },
        { ...base, id: "flat", cost: [{ currency: "gold", amount: 2 }], costGrowth: 1, maxLevel: 25 },
      ],
    });
    for (const id of ["steep", "pair", "flat", "laser"])
      for (const gold of [0, 9, 250, 1e4, 3e6]) {
        const start = { gold, gems: 7 };
        const one = memoryPurse(start);
        const many = memoryPurse(start);
        const ranksOne: Record<string, number> = { drill: 1, [id]: 2 };
        const ranksMany: Record<string, number> = { drill: 1, [id]: 2 };
        let bought = 0;
        while (bought < 500 && shop.buy(ranksOne, id, one).ok) bought += 1;
        expect(shop.affordable(id, ranksMany, (c) => many.balance(c))).toBe(bought);
        expect(shop.buyMax(ranksMany, id, many)).toBe(bought);
        expect(ranksMany).toEqual(ranksOne);
        expect(many.held).toEqual(one.held);
      }
    const rich = memoryPurse({ gold: 1e9, gems: 0 });
    const ranks: Record<string, number> = {};
    expect(shop.buyMax(ranks, "flat", rich, 10)).toBe(10);
    expect(shop.buyMax(ranks, "flat", rich)).toBe(15);
    expect(shop.buyMax(ranks, "flat", rich)).toBe(0);
    expect(shop.buyMax(ranks, "laser", rich)).toBe(0); // its requirement is not held
  });

  test("every rank held lands on the stats, sourced by the tree and node", () => {
    const c = rules.contributions({ drill: 2, laser: 1 });
    expect(c.every((x) => x.source.startsWith("mine:"))).toBe(true);
    const speed = totals(c, "toy.speed");
    expect(speed.add).toBe(2);
    expect(speed.mult).toBeCloseTo(1.5);
  });

  test("a milestone rank adds its extra effects on top, and only at every nth rank", () => {
    const jumpy = tree({
      id: "mine",
      nodes: NODES,
      milestone: {
        every: 2,
        effect: (e) => (typeof e.add === "number" ? { stat: e.stat, add: e.add * 10 } : null),
      },
    });
    const add = (n: number) => totals(jumpy.contributions({ drill: n }), "toy.speed").add;
    expect(add(1)).toBe(1);
    expect(add(2) - add(1)).toBeGreaterThan(add(1));
    expect(add(3) - add(2)).toBe(1);
  });

  test("buying the cheapest buys in rising price order, leaves no rank it could have bought, and holds back closed", () => {
    const base = NODES[0] as Node;
    const shop = tree<Node>({
      id: "shop",
      nodes: [
        { ...base, id: "a", cost: [{ currency: "gold", amount: 3 }], costGrowth: 2, maxLevel: 10 },
        { ...base, id: "b", cost: [{ currency: "gold", amount: 5 }], costGrowth: 1.5, maxLevel: 10 },
        { ...base, id: "c", cost: [{ currency: "gold", amount: 1 }], costGrowth: 1, maxLevel: 10 },
        { ...base, id: "free", cost: [], costGrowth: 1, maxLevel: Number.POSITIVE_INFINITY },
      ],
    });
    const purse = memoryPurse({ gold: 200, gems: 0 });
    const ranks: Record<string, number> = {};
    const paid: number[] = [];
    const watched: Purse<"gold" | "gems"> = {
      balance: purse.balance,
      debit: (c, amount) => {
        paid.push(D(amount).toNumber());
        return purse.debit(c, amount);
      },
    };
    const n = shop.buyCheapest(ranks, watched, { open: (node) => node.id !== "b" });
    expect(n).toBe(paid.length);
    expect(paid).toEqual([...paid].sort((x, y) => x - y));
    expect(ranks.b).toBeUndefined();
    expect(ranks.free).toBeUndefined(); // free and endless: skipped without a limit
    for (const id of ["a", "c"]) expect(shop.affordable(id, ranks, (c) => purse.balance(c))).toBe(0);
    expect(shop.buyCheapest(ranks, memoryPurse({ gold: 0, gems: 0 }), { limit: 4 })).toBe(4); // the free one, now
    expect(ranks.free).toBe(4);
  });

  test("it refuses a repeated node or a requirement outside the tree", () => {
    expect(() => tree({ id: "t", nodes: [NODES[0] as Node, NODES[0] as Node] })).toThrow(/drill/);
    expect(() => tree({ id: "t", nodes: [NODES[1] as Node] })).toThrow(/drill/);
  });
});

describe("upgradeTree", () => {
  const wallet = defineCurrencies({ key: "wallet", vocab: TOY, start: { gold: 12 } });
  const mine = defineUpgradeTree({ key: "mine", nodes: NODES, wallet });
  const game = defineGame({
    id: "toy",
    save: { key: "toy.save", version: 1 },
    features: [wallet, mine],
    vocab: TOY,
  });
  const storeOf = (backend = createMemoryBackend()) =>
    createIdleStore(game, { storage: createGameStorage(backend, { debounceMs: 0 }), now: () => T0 });

  test("buys from its wallet, saves its ranks, and a run reset clears them", () => {
    const backend = createMemoryBackend();
    const store = storeOf(backend);
    expect(store.getState().mine.buy("drill")).toEqual({ ok: true, id: "drill", level: 1 });
    expect(store.getState().mine.buy("drill").ok).toBe(false);
    expect(store.getState().wallet.gold.eq(2)).toBe(true);
    expect(storeOf(backend).getState().mine.ranks).toEqual({ drill: 1 });
    expect(mine.def.tree.contributions(store.getState().mine.ranks)).toHaveLength(1);
    expect(mine.select.contributions(store.getState())).toEqual(mine.def.tree.contributions({ drill: 1 }));
    store.getState().resetRun();
    expect(store.getState().mine.ranks).toEqual({});
  });

  test("buys max from its wallet, and a closed node buys none", () => {
    const store = storeOf();
    store.getState().wallet.credit("gold", 100); // 112: ranks of 10, 20 and 40 cost 70, and the last rank is 3
    expect(store.getState().mine.buyMax("drill")).toBe(3);
    expect(store.getState().wallet.gold.eq(42)).toBe(true);
    const shut = defineUpgradeTree({ key: "mine", nodes: NODES, wallet, open: () => false });
    const closed = createIdleStore(
      defineGame({ id: "toy", save: { key: "toy.save", version: 1 }, features: [wallet, shut], vocab: TOY }),
      { storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }), now: () => T0 },
    );
    expect(closed.getState().mine.buyMax("drill")).toBe(0);
    expect(closed.getState().wallet.gold.eq(12)).toBe(true);
  });

  test("its readers answer as its actions do: a closed node is neither offered nor bought", () => {
    const gated = defineUpgradeTree({
      key: "mine",
      nodes: NODES,
      wallet,
      open: (s: { wallet: { gold: Decimal } }, node) => node.id !== "laser" || s.wallet.gold.gte(50),
    });
    const store = createIdleStore(
      defineGame({ id: "toy", save: { key: "toy.save", version: 1 }, features: [wallet, gated], vocab: TOY }),
      { storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }), now: () => T0 },
    );
    store.getState().mine.buy("drill");
    store.getState().wallet.credit("gems", 5);
    const st = store.getState();
    for (const id of ["drill", "laser", "nope"]) {
      const offered = gated.select.check(st, id) === null;
      expect(gated.select.affordable(st, id) > 0).toBe(offered);
      expect(store.getState().mine.buy(id).ok).toBe(offered);
    }
    expect(gated.select.open(st, "laser")).toBe(false);
    expect(gated.select.check(st, "laser")).toEqual({ ok: false, code: "closed" });
    expect(gated.select.open(st, "nope")).toBe(false);
  });

  test("buys everything the wallet covers, cheapest first, and only what is open", () => {
    const store = storeOf();
    store.getState().wallet.credit("gold", 100);
    store.getState().wallet.credit("gems", 2);
    const n = store.getState().mine.buyAll();
    const st = store.getState();
    expect(n).toBe((st.mine.ranks.drill ?? 0) + (st.mine.ranks.laser ?? 0));
    for (const id of ["drill", "laser"]) expect(mine.select.affordable(st, id)).toBe(0);
    expect(store.getState().mine.buyAll()).toBe(0);
  });
});

describe("upgradeTree moves", () => {
  const balanceOf = (s: unknown, c: string): Decimal =>
    (s as { wallet: Record<string, Decimal> }).wallet[c] ?? D(0);
  const mineRanks = (s: unknown): Record<string, number> =>
    (s as { mine: { ranks: Record<string, number> } }).mine.ranks;
  const storage = () => createGameStorage(createMemoryBackend(), { debounceMs: 0 });

  test("it declares one move per buyable node, with a cost and no worth, and the auto-player works it out", () => {
    const wallet = defineCurrencies({ key: "wallet", vocab: TOY, start: { gold: 40, gems: 3 } });
    const mine = defineUpgradeTree({ key: "mine", nodes: NODES, wallet });
    const game = defineGame({
      id: "moves",
      save: { key: "moves", version: 1 },
      features: [wallet, mine],
      vocab: TOY,
    });
    const store = createIdleStore(game, { storage: storage(), now: () => T0 });
    const moves = mine.moves?.(store.getState() as never) ?? [];
    // The laser needs the drill first, so only the drill is on offer.
    expect(moves.map((m) => m.id)).toEqual(["mine:drill"]);
    expect(moves[0]?.cost?.currency).toBe("gold");
    expect(moves[0]?.worth).toBeUndefined();
    // The drill raises the objective, so the auto-player buys it with no worth stated.
    const player = autoPlayer(game, {
      balance: balanceOf,
      objective: (s) => mineRanks(s).drill ?? 0,
    });
    const look = player.look(store as never);
    expect(look.bought).toBeGreaterThan(0);
    expect(store.getState().mine.ranks.drill).toBeGreaterThan(0);
  });

  test("a stated worth stands in for a node that does not move the objective, and a closed node has no move", () => {
    const wallet = defineCurrencies({ key: "wallet", vocab: TOY, start: { gold: 40, gems: 3 } });
    const mine = defineUpgradeTree({
      key: "mine",
      nodes: NODES,
      wallet,
      worth: (_s, node) => (node.id === "drill" ? 2 : 1),
      open: (_s, node) => node.id !== "laser",
    });
    const game = defineGame({
      id: "moves",
      save: { key: "moves", version: 1 },
      features: [wallet, mine],
      vocab: TOY,
    });
    const store = createIdleStore(game, { storage: storage(), now: () => T0 });
    const [move] = mine.moves?.(store.getState() as never) ?? [];
    expect(move?.worth?.(store.getState() as never)).toBe(2);
    store.getState().mine.buy("drill");
    expect((mine.moves?.(store.getState() as never) ?? []).map((m) => m.id)).not.toContain("mine:laser");
    // With the worth stated, the auto-player needs no objective.
    const player = autoPlayer(game, { balance: balanceOf });
    expect(() => player.look(store as never)).not.toThrow();
  });
});

describe("treeMoves", () => {
  test("serves a hand-written feature that keeps ranks: one move per buyable node, the worth only if given", () => {
    const wallet = defineCurrencies({ key: "wallet", vocab: TOY, start: { gold: 40, gems: 3 } });
    const mine = withMoves(
      defineUpgradeTree({ key: "mine", nodes: NODES, wallet }),
      treeMoves("mine", NODES, (_s, node) => (node.id === "drill" ? 2 : 1)),
    );
    const game = defineGame({
      id: "moves",
      save: { key: "moves", version: 1 },
      features: [wallet, mine],
      vocab: TOY,
    });
    const store = createIdleStore(game, {
      storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
      now: () => T0,
    });
    const offered = mine.moves?.(store.getState() as never) ?? [];
    expect(offered.map((m) => m.id)).toEqual(["mine:drill"]);
    expect(offered[0]?.worth?.(store.getState() as never)).toBe(2);
    const bare = treeMoves("mine", NODES)(store.getState() as never);
    expect(bare[0]?.worth).toBeUndefined();
    const player = autoPlayer(game, {
      balance: (s, c) => (s as unknown as { wallet: Record<string, Decimal> }).wallet[c] ?? D(0),
    });
    const look = player.look(store as never);
    expect(look.bought).toBeGreaterThan(0);
    expect(store.getState().mine.ranks.drill).toBeGreaterThan(0);
    expect(store.getState().mine.ranks.laser).toBeGreaterThan(0);
  });
});

describe("upgradeTree reach", () => {
  test("a callback reads a reached feature with no annotation, and not one that was not reached", () => {
    const wallet = defineCurrencies({ key: "wallet", vocab: TOY });
    const door = defineFeature({ key: "door", initial: () => ({ open: true }) });
    const gated = defineUpgradeTree({
      key: "gated",
      nodes: NODES,
      wallet,
      reach: [door],
      open: (s, node) => s.door.open && s.wallet.gold.gte(0) && node.id.length > 0,
      worth: (s) => {
        // @ts-expect-error `lid` was never reached
        s.lid;
        return 1;
      },
    });
    expect(gated.def.nodes).toHaveLength(NODES.length);
    expect(gated.needs).toBeUndefined();
  });
});

describe("upgradeTree draft helpers and select", () => {
  const wallet = defineCurrencies({ key: "wallet", vocab: TOY, start: { gold: 100, gems: 5 } });
  const mine = defineUpgradeTree({ key: "mine", nodes: NODES, wallet });
  const game = defineGame({
    id: "toy",
    save: { key: "toy.save", version: 1 },
    features: [wallet, mine],
    vocab: TOY,
  });
  const storeOf = () =>
    createIdleStore(game, {
      storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
      now: () => T0,
    });

  test("buy, buyMax and buyAll inside a recipe do what the actions do", () => {
    const store = storeOf();
    let result: ReturnType<typeof mine.draft.buy> | undefined;
    store.setState((d) => {
      result = mine.draft.buy(d, "drill");
    });
    expect(result).toEqual({ ok: true, id: "drill", level: 1 });
    let n = 0;
    store.setState((d) => {
      n = mine.draft.buyMax(d, "drill");
    });
    expect(n).toBe(2);
    store.setState((d) => {
      n = mine.draft.buyAll(d);
    });
    expect(n).toBeGreaterThan(0);
    const st = store.getState();
    expect(mine.select.rank(st, "drill")).toBe(3);
    expect(mine.select.ranks(st)).toBe(st.mine.ranks);
  });
});
