import type { CurrenciesFeature, Purse } from "./currencies";
import { type Decimal } from "./decimal";
import { type Feature, type Move, type ResetRule } from "./feature";
import { type GraphNode, type NodeFailure } from "./graph/nodes";
/**
 * Upgrade trees: ranks bought one at a time over `GraphNode`s, paid from a `Purse`, and every rank held as a
 * contribution to the stat bus (`busOf`). `tree({ id, nodes })` is the rules over a ranks record the game keeps
 * wherever it saves it; `upgradeTree({ key, nodes, wallet })` is a feature that owns its ranks and pays from a
 * currencies feature.
 */
/** Ranks held per node id; a node absent is at rank zero. */
export type Ranks = Readonly<Record<string, number>>;
/** The effect type a node carries. */
export type EffectOf<N> = N extends GraphNode<infer E, string> ? E : never;
/** The currencies a node is priced in. */
export type CostOf<N> = N extends GraphNode<unknown, infer C> ? C : never;
/**
 * Every `every`th rank of a node is a milestone rank: on top of the rank's own effects, `effect(e)` of each of them
 * (null for none). The trees' "every ten ranks, a jump".
 */
export interface RankMilestone<E> {
    readonly every: number;
    readonly effect: (effect: E) => E | null;
}
/** One rank bought, or why not. */
export type BuyResult<C extends string = string> = {
    ok: true;
    id: string;
    level: number;
} | ({
    ok: false;
} & ({
    code: "unknown";
} | {
    code: "closed";
} | NodeFailure<C>));
/** The definition `tree` takes: an id, the nodes and an optional milestone. */
export interface TreeDef<N extends GraphNode<unknown, string>> {
    /** The source prefix on the stat bus: a rank's contribution is sourced `<id>:<node>`. */
    readonly id: string;
    readonly nodes: readonly N[];
    readonly milestone?: RankMilestone<EffectOf<N>>;
}
/** An upgrade tree's rules: `node`, `price`, `check`, `buy` and `contributions`. */
export interface Tree<N extends GraphNode<unknown, string>> {
    readonly id: string;
    readonly nodes: readonly N[];
    node(id: string): N | undefined;
    /** The next rank's price, or null at the last rank. */
    price(node: N, owned: number): {
        currency: CostOf<N>;
        amount: Decimal;
    }[] | null;
    /** Why the next rank of `id` cannot be bought, or null when it can. */
    check(id: string, ranks: Ranks, balance: (currency: CostOf<N>) => Decimal | undefined): BuyResult<CostOf<N>> | null;
    /** Buys one rank: checks it, debits every currency of its price from `purse`, and raises `ranks[id]`. */
    buy(ranks: Record<string, number>, id: string, purse: Purse<CostOf<N>>): BuyResult<CostOf<N>>;
    /**
     * How many more ranks of `id` the balances cover, `limit` and the node's last rank at most (0 when the next one
     * cannot be bought): the count buying one at a time would reach before a buy fails, worked out in one step. A node
     * that costs nothing and has no last rank is bounded by `limit` alone (0 without one).
     */
    affordable(id: string, ranks: Ranks, balance: (currency: CostOf<N>) => Decimal | undefined, limit?: number): number;
    /** Buys as many ranks of `id` as `purse` covers, `limit` at most, one debit per currency. Returns how many. */
    buyMax(ranks: Record<string, number>, id: string, purse: Purse<CostOf<N>>, limit?: number): number;
    /** Every rank held as contributions, sourced `<id>:<node>`, milestone ranks included. */
    contributions(ranks: Ranks): {
        source: string;
        effect: EffectOf<N>;
    }[];
}
/**
 * Every rank held in `nodes` as a contribution sourced `<source>:<node>`: per node, each rank's effects in turn,
 * then each milestone rank's extra effects.
 */
export declare function rankContributions<E>(source: string, nodes: readonly GraphNode<E, string>[], ranks: Ranks, milestone?: RankMilestone<E>): {
    source: string;
    effect: E;
}[];
/** A tree's rules over a ranks record the game keeps. Throws on a repeated node id or a missing requirement. */
export declare function tree<N extends GraphNode<unknown, string>>(def: TreeDef<N>): Tree<N>;
/** An upgrade tree feature's state: its ranks. */
export interface TreeState {
    ranks: Record<string, number>;
}
/** The tree feature's actions. */
export interface TreeActions<C extends string> {
    /** One rank of `id`, paid from the wallet. */
    buy(id: string): BuyResult<C>;
    /** As many ranks of `id` as the wallet covers, `limit` at most (0 when closed). Returns how many. */
    buyMax(id: string, limit?: number): number;
}
/** An `upgradeTree` feature, carrying its rules as `.tree`. */
export type UpgradeTreeFeature<K extends string, N extends GraphNode<unknown, string>> = Feature<K, TreeState, TreeActions<CostOf<N>>> & {
    readonly tree: Tree<N>;
};
/**
 * A tree as a feature: it saves its ranks under `key` (the stat bus's source prefix too) and buys from `wallet`, a
 * currencies feature whose currencies price every node. `open(state, node)` may hold a node back until the game
 * says it is on offer. A prestige reset clears the ranks unless `reset` says not.
 */
export declare function upgradeTree<const K extends string, N extends GraphNode<unknown, string>, WK extends string, WS extends object, WA extends object, G extends object = object>(def: {
    readonly key: K;
    readonly nodes: readonly N[];
    readonly wallet: CurrenciesFeature<WK, CostOf<N>, WS, WA>;
    readonly milestone?: RankMilestone<EffectOf<N>>;
    /** Whether a node is on offer now, read off the whole game state: a closed one refuses with `closed`. */
    readonly open?: (state: G, node: N) => boolean;
    readonly reset?: ResetRule<TreeState>;
}): UpgradeTreeFeature<K, N>;
/**
 * The auto-player's moves over an `upgradeTree` feature saved under `key`: one per node whose next rank can be bought
 * (not at its last rank, its requirements held), priced at the first currency of that rank's price. `worth(node,
 * owned)` is what the rank is worth to the sim, in the unit the game's other moves in that currency use. Hand it to
 * `withMoves(tree, treeMoves(...))`.
 */
export declare function treeMoves<K extends string, C extends string = string>(key: K, nodes: readonly GraphNode<unknown, C>[], worth: (node: GraphNode<unknown, C>, owned: number) => number): (state: Record<K, TreeState & TreeActions<C>>) => Move<Record<K, TreeState & TreeActions<C>>>[];
