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

/** What every node has: id, name, price, requirements and effects. */
interface NodeBase<E, C extends string> {
  id: string;
  name: string;
  /** What it does, in the voice of its world. */
  line: string;
  /**
   * The price of rank one; each further rank multiplies by `costGrowth`. Read fresh on every price, check and buy, so
   * a line may be a getter (a price the game fits or tunes at run time) and the next read sees the new amount.
   * Each rank's price is floored to a whole number.
   */
  cost: readonly NodeCost<C>[];
  /** Node ids that must be at rank one or more first. */
  requires: readonly string[];
  /** Applied once per rank owned. */
  effects: readonly E[];
}

/**
 * One node of an upgrade graph: id, name, price, max rank, requirements and effects. A node of one rank
 * (`maxLevel: 1`) has no growth to state; a node of more than one rank must say `costGrowth`, what each further
 * rank's price is multiplied by (1 for a flat price): leaving it out is a type error, and `tree` throws for a node
 * that escapes the types.
 */
export type GraphNode<E, C extends string = string> = NodeBase<E, C> &
  ({ maxLevel: 1; costGrowth?: number } | { maxLevel: number; costGrowth: number });

/** Throws, naming the node, when it has more than one rank and no `costGrowth`: for callers who escape the types. */
export function assertNodeGrowth(node: { id: string; maxLevel: number; costGrowth?: number }): void {
  if (node.maxLevel > 1 && !(typeof node.costGrowth === "number" && Number.isFinite(node.costGrowth)))
    throw new Error(
      `node "${node.id}" has ${node.maxLevel} ranks and no costGrowth: state what each rank's price is multiplied by (1 for a flat price)`,
    );
}

/** The price of the next rank when `level` are owned, floored. */
export function rankCost<C extends string = string>(
  node: GraphNode<unknown, C>,
  level: number,
): { currency: C; amount: Decimal }[] {
  const growth = node.costGrowth ?? 1;
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
