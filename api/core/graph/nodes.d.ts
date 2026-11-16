import { type Decimal, type DecimalSource } from "../decimal";
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
export declare const DEFAULT_COST_GROWTH = 1.5;
/** The price of the next rank when `level` are owned, floored. */
export declare function rankCost<C extends string = string>(node: GraphNode<unknown, C>, level: number): {
    currency: C;
    amount: Decimal;
}[];
/** Why a node could not be bought: unknown, maxed, a missing requirement or cannot afford. */
export type NodeFailure<C extends string = string> = {
    code: "maxed";
} | {
    code: "requires";
    node: string;
} | {
    code: "cannot-afford";
    currency: C;
    balance: Decimal;
    price: Decimal;
};
/** Why the next rank cannot be bought, or null when it can. */
export declare function checkRank<C extends string = string>(node: GraphNode<unknown, C>, levels: Readonly<Record<string, number>>, balance: (currency: C) => Decimal | undefined): NodeFailure<C> | null;
