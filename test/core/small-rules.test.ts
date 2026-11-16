import { describe, expect, test } from "bun:test";
import {
  D,
  defineChallenges,
  defineCurrencies,
  defineGame,
  defineSpawns,
  defineUpgradeTree,
  feature,
  type GraphNode,
  powerGain,
  vocab,
} from "watchpot/core";
import { freshStore, T0 } from "watchpot/test";

const WORDS = vocab({ currencies: ["gold"], stats: [], rarities: ["common"] } as const);
const wallet = defineCurrencies({ key: "wallet", vocab: WORDS, start: { gold: 100 } });

describe("an upgrade tree with an open rule", () => {
  type State = { door: { open: boolean } };
  const door = feature({ key: "door", initial: () => ({ open: false }) });
  const NODES: GraphNode<never, "gold">[] = [
    {
      id: "a",
      name: "A",
      line: "",
      cost: [{ currency: "gold", amount: 10 }],
      maxLevel: 1,
      requires: [],
      effects: [],
    },
  ];
  const shop = defineUpgradeTree({ key: "shop", nodes: NODES, wallet, open: (s: State) => s.door.open });
  const game = defineGame({
    id: "open",
    save: { key: "open.save", version: 1 },
    vocab: WORDS,
    features: [wallet, door, shop],
  });

  test("a closed node refuses and charges nothing; an open one sells", () => {
    const { store } = freshStore(game);
    expect(store.getState().shop.buy("a")).toEqual({ ok: false, code: "closed" });
    expect(store.getState().wallet.gold.toNumber()).toBe(100);
    store.setState((s) => {
      s.door.open = true;
    });
    expect(store.getState().shop.buy("a")).toMatchObject({ ok: true, level: 1 });
  });
});

describe("powerGain", () => {
  test("holds past what a number can", () => {
    expect(powerGain(D("1e600"), { k: 1, exp: 0.5, per: "1e400" }).eq(D("1e100"))).toBe(true);
    expect(powerGain(D(900), { k: 2, exp: 0.5, per: 100, mult: 1.5 }).toNumber()).toBe(9);
    expect(powerGain(D(-5), { k: 1, exp: 0.5, per: 1 }).toNumber()).toBe(0);
  });
});

describe("challenges at a depth", () => {
  const shallow = feature({ key: "shallow", initial: () => ({ n: 0 }) });
  const deep = feature({ key: "deep", initial: () => ({ n: 0 }), reset: { depth: 2 } });
  const trials = defineChallenges({ key: "trials", depth: 2, list: [{ id: "t", goal: () => false }] });
  const game = defineGame({
    id: "depth",
    save: { key: "depth.save", version: 1 },
    features: [shallow, deep, trials],
  });

  test("entering resets what its depth reaches", () => {
    const { store } = freshStore(game);
    store.setState((s) => {
      s.shallow.n = 3;
      s.deep.n = 4;
    });
    expect(store.getState().trials.enter("t")).toBeNull();
    expect(store.getState()).toMatchObject({ shallow: { n: 0 }, deep: { n: 0 } });
  });
});

describe("a spawn taken inside a recipe", () => {
  const tally = feature({ key: "tally", initial: () => ({ caught: [] as string[] }) });
  const birds = defineSpawns({
    key: "birds",
    reach: [tally],
    kinds: [
      { id: "bird", wait: { minMs: 1000, maxMs: 1000 }, lifeMs: 5000, outcomes: [{ id: "seed", weight: 1 }] },
    ],
    onCatch: (d, outcome) => void d.tally.caught.push(outcome),
  });
  const net = feature({
    key: "net",
    reach: [birds],
    initial: () => ({}),
    steps: {
      automate: {
        // An automatic catcher: whatever is live is taken in the pass that sees it.
        sweep: (d, ctx) => void birds.draft.catch(d, "bird", ctx.now),
      },
    },
  });
  const game = defineGame({
    id: "take",
    save: { key: "take.save", version: 1 },
    features: [tally, birds, net],
  });

  test("the catch runs in the step's own recipe", () => {
    const { store } = freshStore(game, { at: T0 });
    store.getState().tick(100, T0 + 100);
    store.getState().tick(1500, T0 + 1600);
    expect(store.getState().tally.caught).toEqual(["seed"]);
    expect(store.getState().birds.kinds.bird?.caught).toBe(1);
  });
});
