import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineGame,
  type Effect,
  type GraphNode,
  stats,
  upgradeTree,
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
export const mine = upgradeTree({
  key: "mine",
  nodes: NODES,
  wallet,
  open: (s, node) => node.id !== "laser" || s.wallet.lifetimeGold.gte(100),
  // The sim's auto-player gets a move per buyable node for free. Say a worth only for a node that does not raise
  // its objective at once; the rest are worked out.
  worth: (_s, node) => (node.id === "laser" ? 3 : 1),
});

/** The ranks held, on the engine's `stats`: `s.stats["toy.speed"]`. */
export const speed = stats({
  key: "stats",
  vocab: TOY,
  reach: () => [mine],
  stats: { "toy.speed": { base: 1 } },
  contributions: (s) => mine.select.contributions(s),
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
  console.log(
    "laser open?",
    mine.select.open(store.getState(), "laser"),
    mine.select.check(store.getState(), "laser"),
  );
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
  const objective = (st: typeof s) => speed.select.value(st, "toy.speed").toNumber();
  console.log("auto-player:", autoPlayer(game, { objective }).look(store), store.getState().mine.ranks);
}
