import { D, type Decimal, type DecimalSource, ZERO } from "../decimal";

/**
 * A node of a tree: ranks bought one at a time, each priced `cost x costGrowth^owned` in one or more currencies,
 * after the nodes it requires. Its effects apply once per rank; what an effect is belongs to the tree that holds
 * the node (an event's modifiers, a stat's effect).
 */
/** One currency of a rank's price; `C` is the tree's currencies (a vocabulary's `CurrencyOf`, or any string). */
export interface NodeCost<C extends string = string> {
  currency: C;
  amount: DecimalSource;
}

/** One node of an upgrade graph: id, name, price, max rank, requirements and effects. */
export interface GraphNode<E, C extends string = string> {
  id: string;
  name: string;
  /** What it does, in the voice of its world. */
  line: string;
  /** The price of rank one; each further rank multiplies by `costGrowth`. */
  cost: readonly NodeCost<C>[];
  costGrowth?: number;
  maxLevel: number;
  /** Node ids that must be at rank one or more first. */
  requires: readonly string[];
  /** Applied once per rank owned. */
  effects: readonly E[];
}

/** The default growth of a node's price per rank. */
export const DEFAULT_COST_GROWTH = 1.5;

/** The price of the next rank when `level` are owned, floored. */
export function rankCost<C extends string = string>(
  node: GraphNode<unknown, C>,
  level: number,
): { currency: C; amount: Decimal }[] {
  const growth = node.costGrowth ?? DEFAULT_COST_GROWTH;
  return node.cost.map((c) => ({
    currency: c.currency,
    amount: D(c.amount)
      .mul(D(growth).pow(Math.max(0, level)))
      .floor(),
  }));
}

/** Why a node could not be bought: unknown, maxed, a missing requirement or cannot afford. */
export type NodeFailure<C extends string = string> =
  | { code: "maxed" }
  | { code: "requires"; node: string }
  | { code: "cannot-afford"; currency: C; balance: Decimal; price: Decimal };

/** Why the next rank cannot be bought, or null when it can. */
export function checkRank<C extends string = string>(
  node: GraphNode<unknown, C>,
  levels: Readonly<Record<string, number>>,
  balance: (currency: C) => Decimal | undefined,
): NodeFailure<C> | null {
  const level = levels[node.id] ?? 0;
  if (level >= node.maxLevel) return { code: "maxed" };
  for (const req of node.requires) if ((levels[req] ?? 0) < 1) return { code: "requires", node: req };
  // Lines in one currency are summed first: two lines of 60 gold need 120, not 60 twice.
  const due = new Map<C, Decimal>();
  for (const c of rankCost(node, level)) due.set(c.currency, (due.get(c.currency) ?? ZERO).add(c.amount));
  for (const [currency, price] of due) {
    const held = balance(currency) ?? ZERO;
    if (held.lt(price)) return { code: "cannot-afford", currency, balance: held, price };
  }
  return null;
}
