// @feature tree
import { type Balances, type TreeActions, type TreeState, defineUpgradeTree } from "watchpot/core";
import { NODES } from "../content/tree";
import type { Currency } from "../content/words";
import { type IncomeSources, incomeOf } from "./income";
import { wallet } from "./wallet";

/** What the tree's worth reads: the ranks, the wallet, and the income the next rank would raise. */
interface TreeReads extends IncomeSources {
  upgrades: TreeState & TreeActions<Currency>;
  wallet: Balances<Currency>;
}

/**
 * The upgrade tree on the engine's `upgradeTree`: ranks bought with the main currency, saved under `upgrades`,
 * cleared by a prestige. Its effects reach the stats as contributions (`stats.ts`). It declares the auto-player's
 * moves itself, one per rank that can be bought; `worth` says what a rank adds in the sim's unit.
 */
export const upgrades = defineUpgradeTree({
  key: "upgrades",
  nodes: NODES,
  wallet,
  // Worth: the income a rank adds a second (offline counts at half, gain at a tenth).
  worth: (s: TreeReads, node) => {
    const rate = incomeOf(s).toNumber();
    return node.effects.reduce((sum, e) => {
      if (e.stat === "output") return sum + rate * (Number(e.mul ?? 1) - 1);
      if (e.stat === "offline") return sum + rate * Number(e.add ?? 0) * 0.5;
      return sum + rate * (Number(e.mul ?? 1) - 1) * 0.1;
    }, 0);
  },
});
