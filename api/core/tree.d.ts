import type { CurrenciesFeature, Purse } from "./currencies";
import { type Decimal } from "./decimal";
import { type Feature, type Move, type NeedsOf, type ReachOf, type ReachShape, type ResetRule } from "./feature";
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
/** What `buyCheapest` may be told: which nodes are on offer (default all) and the most ranks to buy. */
export interface BuyCheapestOptions<N> {
    readonly open?: (node: N) => boolean;
    readonly limit?: number;
}
/** An upgrade tree's rules: `node`, `price`, `check`, `buy` and `contributions`. */
export interface Tree<N extends GraphNode<unknown, string>> {
    readonly id: string;
    readonly nodes: readonly N[];
    node(id: string): N | undefined;
    /**
     * The next rank's price, or null at the last rank. Every reader here (price, check, buy, affordable) reads the
     * node's `cost` lines fresh on each call, so a line that is a getter is priced as it stands now.
     */
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
    /**
     * Buys one rank at a time, always the cheapest next rank on offer, until none can be bought or `limit` ranks are
     * bought: the "buy everything" button. Cheapest is by the first line of each rank's price (ties keep the node
     * order), so a tree in one currency compares like for like. `open(node)` holds a node back. A free node with no
     * last rank is skipped unless `limit` is given. Returns how many ranks it bought.
     */
    buyCheapest(ranks: Record<string, number>, purse: Purse<CostOf<N>>, options?: BuyCheapestOptions<N>): number;
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
    /**
     * Buys everything the wallet covers, the cheapest open rank first, one rank at a time (`Tree.buyCheapest`), `limit`
     * ranks at most. Returns how many.
     */
    buyAll(limit?: number): number;
}
/**
 * An `upgradeTree` feature, carrying its rules as `.tree` and the open-aware readers over the whole game state:
 * `open`, `check` and `affordable` answer as the actions do, so a screen never offers a node `buy` then refuses as
 * `closed`. (`.tree`'s own `check` and `affordable` know nothing of `open`.)
 */
export type UpgradeTreeFeature<K extends string, N extends GraphNode<unknown, string>, G extends object = object> = Feature<K, TreeState, TreeActions<CostOf<N>>> & {
    readonly tree: Tree<N>;
    /** Whether the node is on offer now, by the feature's `open` (true without one; false for an unknown id). */
    open(state: G, id: string): boolean;
    /** Why the next rank of `id` cannot be bought now (`closed` first), or null when `buy(id)` would buy it. */
    check(state: G, id: string): BuyResult<CostOf<N>> | null;
    /** How many more ranks of `id` the wallet covers now, `limit` at most: 0 when it is closed. */
    affordable(state: G, id: string, limit?: number): number;
};
/**
 * A tree as a feature: it saves its ranks under `key` (the stat bus's source prefix too) and buys from `wallet`, a
 * currencies feature whose currencies price every node. `open(state, node)` may hold a node back until the game
 * says it is on offer; the feature's own `open`, `check` and `affordable` read it, `.tree`'s do not. A run reset
 * clears the ranks unless `reset` says not.
 *
 * It carries no auto-player moves: the sim's `autoPlayer` never buys a node until the game gives it some, and says
 * nothing about it. Wrap it as `withMoves(upgradeTree({ ... }), treeMoves(key, nodes, worth))`.
 */
export declare function upgradeTree<const K extends string, N extends GraphNode<unknown, string>, WK extends string, WS extends object, WA extends object, const R extends ReachShape = readonly [], G extends object = Record<K, TreeState> & Record<WK, WS> & ReachOf<R>>(def: {
    readonly key: K;
    /** The features `open` reads, as `feature`'s `reach`; the wallet is reached already. */
    readonly reach?: R | (() => R);
    readonly nodes: readonly N[];
    readonly wallet: CurrenciesFeature<WK, CostOf<N>, WS, WA>;
    readonly milestone?: RankMilestone<EffectOf<N>>;
    /** Whether a node is on offer now, read off the whole game state: a closed one refuses with `closed`. */
    readonly open?: (state: G, node: N) => boolean;
    readonly reset?: ResetRule<TreeState>;
}): UpgradeTreeFeature<K, N, G> & {
    readonly needs?: NeedsOf<R>;
};
/**
 * The auto-player's moves over an `upgradeTree` feature saved under `key`: one per node whose next rank can be bought
 * (not at its last rank, its requirements held), priced at the first currency of that rank's price. `worth(node,
 * owned)` is what the rank is worth to the sim, in the unit the game's other moves in that currency use. Hand it to
 * `withMoves(tree, treeMoves(...))`: `upgradeTree` has no moves of its own, and without these the auto-player never
 * buys a rank of it, silently.
 */
export declare function treeMoves<K extends string, C extends string = string>(key: K, nodes: readonly GraphNode<unknown, C>[], worth: (node: GraphNode<unknown, C>, owned: number) => number): (state: Record<K, TreeState & TreeActions<C>>) => Move<Record<K, TreeState & TreeActions<C>>>[];
