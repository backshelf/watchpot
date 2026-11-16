import {
  type Balances,
  type Decimal,
  type Move,
  rankCost,
  type TreeActions,
  type TreeState,
  upgradeTree,
  withMoves,
} from "watchpot/core";
import { NODES } from "../content/tree";
import type { Currency } from "../content/words";
import { wallet } from "./wallet";

/** What a tree move reads: the ranks, the wallet, and the production the next rank would raise. */
interface TreeMoveState {
  upgrades: TreeState & TreeActions<Currency>;
  wallet: Balances<Currency>;
  generators: { perSecond: Decimal; output: number };
}

/**
 * The upgrade tree: ranks bought with the main currency, saved under `upgrades`, cleared by a prestige. Its effects
 * reach the stats as contributions (`stats.ts`).
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
          // Worth: the production a rank adds a second (offline counts at half, gain at a tenth).
          worth: (st) => {
            const rate = st.generators.perSecond.toNumber();
            return node.effects.reduce((sum, e) => {
              if (e.stat === "output") return sum + (rate * (Number(e.mul ?? 1) - 1)) / 1;
              if (e.stat === "offline") return sum + rate * Number(e.add ?? 0) * 0.5;
              return sum + rate * (Number(e.mul ?? 1) - 1) * 0.1;
            }, 0);
          },
          apply: (store) => store.getState().upgrades.buy(node.id).ok,
        },
      ];
    }),
);
