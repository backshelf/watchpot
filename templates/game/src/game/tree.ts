// @feature tree
import {
  type Balances,
  type Move,
  rankCost,
  type TreeActions,
  type TreeState,
  upgradeTree,
  withMoves,
} from "watchpot/core";
import { NODES } from "../content/tree";
import type { Currency } from "../content/words";
import { type IncomeSources, incomeOf } from "./income";
import { wallet } from "./wallet";

/** What a tree move reads: the ranks, the wallet, and the income the next rank would raise. */
interface TreeMoveState extends IncomeSources {
  upgrades: TreeState & TreeActions<Currency>;
  wallet: Balances<Currency>;
}

/**
 * The upgrade tree on the engine's `upgradeTree`: ranks bought with the main currency, saved under `upgrades`,
 * cleared by a prestige. Its effects reach the stats as contributions (`stats.ts`).
 */
export const upgrades = withMoves(
  upgradeTree({ key: "upgrades", nodes: NODES, wallet }),
  (s: TreeMoveState): Move<TreeMoveState>[] =>
    NODES.flatMap((node) => {
      const owned = s.upgrades.ranks[node.id] ?? 0;
      if (owned >= node.maxLevel || node.requires.some((r) => !(s.upgrades.ranks[r] ?? 0))) return [];
      const [price] = rankCost(node, owned);
      if (!price) return [];
      return [
        {
          id: `upgrade:${node.id}`,
          cost: price,
          // Worth: the income a rank adds a second (offline counts at half, gain at a tenth).
          worth: (st) => {
            const rate = incomeOf(st).toNumber();
            return node.effects.reduce((sum, e) => {
              if (e.stat === "output") return sum + rate * (Number(e.mul ?? 1) - 1);
              if (e.stat === "offline") return sum + rate * Number(e.add ?? 0) * 0.5;
              return sum + rate * (Number(e.mul ?? 1) - 1) * 0.1;
            }, 0);
          },
          apply: (store) => store.getState().upgrades.buy(node.id).ok,
        },
      ];
    }),
);
