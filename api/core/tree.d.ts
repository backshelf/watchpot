import type { CurrenciesFeature, Purse } from "./currencies";
import { type Decimal } from "./decimal";
import { type Feature, type Move, type NeedsOf, type ReachOf, type ReachShape, type ResetRule } from "./feature";
import { type GraphNode, type NodeFailure } from "./graph/nodes";
/**
 * Upgrade trees: ranks bought one at a time over `GraphNode`s, paid from a `Purse`, and every rank held as a
 * contribution (`{ source, effect }`) for the `stats` feature's `contributions`. `tree({ id, nodes })` is the pure
 * rules over a ranks record the game keeps wherever it saves it; `defineUpgradeTree({ key, nodes, wallet })` is a feature
 * that owns its ranks and pays from a currencies feature: its `select` answers questions over state, its `def`
 * holds the nodes and the `tree` kernel, and its `draft` buys inside a recipe.
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
    /** The source prefix of a contribution: a rank's is sourced `<id>:<node>`. */
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
/** Any state holding the tree's slice under its key. */
export type TreeSlice<K extends string> = {
    readonly [P in K]: TreeState;
};
/**
 * An upgrade tree's read-only questions over state. `open`, `check` and `affordable` answer as the actions do, so a
 * screen never offers a node `buy` then refuses as `closed`. (`def.tree`'s own `check` and `affordable` know nothing
 * of `open`.)
 */
export interface UpgradeTreeSelect<K extends string, N extends GraphNode<unknown, string>, G> {
    /** Whether the node is on offer now, by the feature's `open` (true without one; false for an unknown id). */
    open(state: G, id: string): boolean;
    /** Why the next rank of `id` cannot be bought now (`closed` first), or null when `buy(id)` would buy it. */
    check(state: G, id: string): BuyResult<CostOf<N>> | null;
    /** How many more ranks of `id` the wallet covers now, `limit` at most: 0 when it is closed. */
    affordable(state: G, id: string, limit?: number): number;
    /** Ranks held now, by node id. */
    ranks(state: TreeSlice<K>): Ranks;
    /** How many ranks of `id` are held (0 for a node never bought or unknown). */
    rank(state: TreeSlice<K>, id: string): number;
    /** Every rank held as contributions, sourced `<key>:<node>`, milestone ranks included: for the `stats` feature. */
    contributions(state: TreeSlice<K>): {
        source: string;
        effect: EffectOf<N>;
    }[];
}
/** The fixed configuration of an upgrade tree feature: its nodes, a node by id, and the pure rules kernel. */
export interface UpgradeTreeFixed<N extends GraphNode<unknown, string>> {
    readonly nodes: readonly N[];
    /** A node by id. */
    node(id: string): N | undefined;
    /** The pure rules over a ranks record (`tree({ id: key, nodes, milestone })`), for a screen or a sim to price a rank. */
    readonly tree: Tree<N>;
}
/**
 * The helpers that take a draft first and change it, named like the actions they mirror, for a recipe or a step
 * (a challenge that gives a rank, an autobuyer). They pay from the wallet and respect the feature's `open`.
 */
export interface UpgradeTreeDraftHelpers<N extends GraphNode<unknown, string>> {
    /** One rank of `id` inside a recipe, paid from the wallet. */
    buy(draft: object, id: string): BuyResult<CostOf<N>>;
    /** As many ranks of `id` as the wallet covers inside a recipe, `limit` at most. Returns how many. */
    buyMax(draft: object, id: string, limit?: number): number;
    /** Buys everything the wallet covers inside a recipe, the cheapest open rank first. Returns how many. */
    buyAll(draft: object, limit?: number): number;
}
/** The three namespaces of an upgrade tree feature. */
export interface UpgradeTreeHelpers<K extends string, N extends GraphNode<unknown, string>, G> {
    readonly select: UpgradeTreeSelect<K, N, G>;
    readonly def: UpgradeTreeFixed<N>;
    readonly draft: UpgradeTreeDraftHelpers<N>;
}
/** An `upgradeTree` feature: the feature plus `select`, `def` and `draft`. */
export type UpgradeTreeFeature<K extends string, N extends GraphNode<unknown, string>, G extends object = object> = Feature<K, TreeState, TreeActions<CostOf<N>>> & UpgradeTreeHelpers<K, N, G>;
/**
 * A tree as a feature: it saves its ranks under `key` (the contributions' source prefix too) and buys from `wallet`, a
 * currencies feature whose currencies price every node. `open(state, node)` may hold a node back until the game
 * says it is on offer; the feature's own `select.open`, `check` and `affordable` read it, `def.tree`'s do not. A run
 * reset clears the ranks unless `reset` says not.
 *
 * It declares auto-player moves of its own: one per node whose next rank can be bought (open, not at its last rank,
 * its requirements held), priced at the first currency of that rank's price (`treeMoves`). They carry no `worth`: the
 * auto-player works it out from its objective. State `worth(state, node)` for a node that does not move the
 * objective at once (an unlock, an offline cap), and it is used for every node (return a number for those that do).
 */
export declare function defineUpgradeTree<const K extends string, N extends GraphNode<unknown, string>, WK extends string, WS extends object, WA extends object, const R extends ReachShape = readonly [], G extends object = Record<K, TreeState> & Record<WK, WS> & ReachOf<R>>(def: {
    readonly key: K;
    /** The features `open` and `worth` read, as `feature`'s `reach`; the wallet is reached already. */
    readonly reach?: R | (() => R);
    readonly nodes: readonly N[];
    readonly wallet: CurrenciesFeature<WK, CostOf<N>, WS, WA>;
    readonly milestone?: RankMilestone<EffectOf<N>>;
    /** Whether a node is on offer now, read off the whole game state: a closed one refuses with `closed`. */
    readonly open?: (state: G, node: N) => boolean;
    /**
     * What the next rank of a node is worth to the sim's auto-player, in its objective's unit: only for the nodes that
     * do not move the objective at once, which would otherwise work out to nothing. Leave it out and the auto-player
     * works every node's worth out itself. Nothing asks for it outside the sim.
     */
    readonly worth?: (state: G, node: N) => number;
    readonly reset?: ResetRule<TreeState>;
}): UpgradeTreeFeature<K, N, G> & {
    readonly needs?: NeedsOf<R>;
};
/**
 * The auto-player's moves over an `upgradeTree` feature saved under `key`, for a hand-written feature that keeps
 * ranks as `TreeState` and has the tree's `buy` action (`upgradeTree` declares these itself): one per node whose next
 * rank can be bought (not at its last rank, its requirements held), priced at the first currency of that rank's
 * price. With no `worth` the auto-player works it out from its objective; `worth(state, node)` is for a node that
 * does not move it at once, in the unit the game's other moves use. Hand it to `withMoves(feature, treeMoves(...))`.
 */
export declare function treeMoves<K extends string, C extends string = string>(key: K, nodes: readonly GraphNode<unknown, C>[], worth?: (state: Record<K, TreeState & TreeActions<C>>, node: GraphNode<unknown, C>) => number): (state: Record<K, TreeState & TreeActions<C>>) => Move<Record<K, TreeState & TreeActions<C>>>[];
