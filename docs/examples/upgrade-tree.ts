import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  type Decimal,
  defineGame,
  defineStats,
  type Effect,
  type GraphNode,
  treeMoves,
  upgradeTree,
  withMoves,
} from "watchpot/core";
import { autoPlayer } from "watchpot/sim";
import { wallet } from "./add-a-currency";
import { TOY } from "./vocab";

type Node = GraphNode<Effect<"toy.speed">, "gold" | "gems">;

/** Each node: a price in currencies (growing per rank), a max rank, what it needs, and what it does to the stats. */
const NODES: readonly Node[] = [
  {
    id: "drill",
    name: "Drill",
    line: "Digs faster.",
    cost: [{ currency: "gold", amount: 10 }],
    costGrowth: 2,
    maxLevel: 3,
    requires: [],
    effects: [{ stat: "toy.speed", add: 1 }],
  },
  {
    id: "laser",
    name: "Laser",
    line: "Digs much faster.",
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

/**
 * A tree as a feature: it saves `{ ranks }` and buys through the wallet. `open` holds the laser back until the
 * player has swept up some dust: a closed node refuses with `closed`, and the feature's own readers say so too.
 */
const tree = upgradeTree({
  key: "mine",
  nodes: NODES,
  wallet,
  open: (s: { wallet: { goldEver: Decimal } }, node) => node.id !== "laser" || s.wallet.goldEver.gte(100),
});

/**
 * A tree carries no auto-player moves. These lines give it some: one move per node whose next rank can be bought,
 * worth what the function says. Without them the sim never buys a rank, and says nothing about it.
 */
export const mine = withMoves(
  tree,
  treeMoves("mine", NODES, (node) => (node.id === "laser" ? 3 : 1)),
);

/** The ranks held, on the engine's `stats`: `s.stats["toy.speed"]`. */
export const speed = defineStats({
  key: "stats",
  vocab: TOY,
  reach: () => [mine],
  stats: { "toy.speed": { base: 1 } },
  contributions: (s) => mine.tree.contributions(s.mine.ranks),
});

export const game = defineGame({
  id: "tree",
  save: { key: "tree.save", version: 1 },
  features: [wallet, mine, speed],
  vocab: TOY,
});

if (import.meta.main) {
  const store = createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
    now: () => Date.UTC(2026, 0, 1),
  });
  const s = store.getState();
  console.log("laser first:", s.mine.buy("laser")); // fails: closed until 100 gold has been earned
  console.log("laser open?", mine.open(store.getState(), "laser"), mine.check(store.getState(), "laser"));
  console.log("drill:", s.mine.buy("drill"));
  // The stats: the tree's contributions, folded into the summed adds and the multiplier of each stat.
  const b = speed.select.explain(store.getState(), "toy.speed");
  const totals = { add: b.add.toNumber(), mult: b.mult.toNumber() };
  console.log("speed:", totals); // { add, mult }
  // "Buy everything": the cheapest open rank first, one at a time, until the wallet runs out.
  s.wallet.credit("gold", 200);
  s.wallet.credit("gems", 2);
  console.log("buyAll bought:", store.getState().mine.buyAll(), store.getState().mine.ranks);
  // The auto-player buys from the tree through the moves above.
  s.wallet.credit("gems", 5);
  console.log("auto-player:", autoPlayer(game).look(store), store.getState().mine.ranks);
}
