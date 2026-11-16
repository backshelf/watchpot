import {
  busOf,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineGame,
  type Effect,
  type GraphNode,
  statTotals,
  upgradeTree,
} from "watchpot/core";
import { wallet } from "./add-a-currency";
import { TOY } from "./vocab";

type Node = GraphNode<Effect, "gold" | "gems">;

/** Each node: a price in currencies (growing per rank), a max rank, what it needs, and what it does to the stat bus. */
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
    maxLevel: 20,
    requires: ["drill"],
    effects: [{ stat: "toy.speed", mult: 1.5 }],
  },
];

/** A tree as a feature: it saves `{ ranks }` and buys through the wallet. */
export const mine = upgradeTree({ key: "mine", nodes: NODES, wallet });

export const game = defineGame({
  id: "tree",
  save: { key: "tree.save", version: 1 },
  features: [wallet, mine],
  vocab: TOY,
});

if (import.meta.main) {
  const store = createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
    now: () => Date.UTC(2026, 0, 1),
  });
  const s = store.getState();
  console.log("laser first:", s.mine.buy("laser")); // fails: requires the drill
  console.log("drill:", s.mine.buy("drill"));
  // The bus: the tree's contributions, folded into totals per stat.
  const totals = statTotals(busOf(mine.tree.contributions(store.getState().mine.ranks)), "toy.speed");
  console.log("speed:", totals); // { add, mult }
}
