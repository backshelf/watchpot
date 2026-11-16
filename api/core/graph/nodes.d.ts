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
export type GraphNode<E, C extends string = string> = NodeBase<E, C> & ({
    maxLevel: 1;
    costGrowth?: number;
} | {
    maxLevel: number;
    costGrowth: number;
});
/** Throws, naming the node, when it has more than one rank and no `costGrowth`: for callers who escape the types. */
export declare function assertNodeGrowth(node: {
    id: string;
    maxLevel: number;
    costGrowth?: number;
}): void;
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
export {};
