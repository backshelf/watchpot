import { type CostCurve, costOfMany, maxAffordable } from "./cost";
import type { CurrenciesFeature, CurrencyDraft, Purse } from "./currencies";
import { D, type Decimal, ZERO } from "./decimal";
import {
  type Feature,
  type FeatureApi,
  feature,
  type Move,
  type NeedsOf,
  type ReachOf,
  type ReachShape,
  type ResetRule,
} from "./feature";
import {
  assertNodeGrowth,
  checkRank,
  type GraphNode,
  type NodeCost,
  type NodeFailure,
  rankCost,
} from "./graph/nodes";

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
export type BuyResult<C extends string = string> =
  | { ok: true; id: string; level: number }
  | ({ ok: false } & ({ code: "unknown" } | { code: "closed" } | NodeFailure<C>));

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
  price(node: N, owned: number): { currency: CostOf<N>; amount: Decimal }[] | null;
  /** Why the next rank of `id` cannot be bought, or null when it can. */
  check(
    id: string,
    ranks: Ranks,
    balance: (currency: CostOf<N>) => Decimal | undefined,
  ): BuyResult<CostOf<N>> | null;
  /** Buys one rank: checks it, debits every currency of its price from `purse`, and raises `ranks[id]`. */
  buy(ranks: Record<string, number>, id: string, purse: Purse<CostOf<N>>): BuyResult<CostOf<N>>;
  /**
   * How many more ranks of `id` the balances cover, `limit` and the node's last rank at most (0 when the next one
   * cannot be bought): the count buying one at a time would reach before a buy fails, worked out in one step. A node
   * that costs nothing and has no last rank is bounded by `limit` alone (0 without one).
   */
  affordable(
    id: string,
    ranks: Ranks,
    balance: (currency: CostOf<N>) => Decimal | undefined,
    limit?: number,
  ): number;
  /** Buys as many ranks of `id` as `purse` covers, `limit` at most, one debit per currency. Returns how many. */
  buyMax(ranks: Record<string, number>, id: string, purse: Purse<CostOf<N>>, limit?: number): number;
  /**
   * Buys one rank at a time, always the cheapest next rank on offer, until none can be bought or `limit` ranks are
   * bought: the "buy everything" button. Cheapest is by the first line of each rank's price (ties keep the node
   * order), so a tree in one currency compares like for like. `open(node)` holds a node back. A free node with no
   * last rank is skipped unless `limit` is given. Returns how many ranks it bought.
   */
  buyCheapest(
    ranks: Record<string, number>,
    purse: Purse<CostOf<N>>,
    options?: BuyCheapestOptions<N>,
  ): number;
  /** Every rank held as contributions, sourced `<id>:<node>`, milestone ranks included. */
  contributions(ranks: Ranks): { source: string; effect: EffectOf<N> }[];
}

/**
 * Every rank held in `nodes` as a contribution sourced `<source>:<node>`: per node, each rank's effects in turn,
 * then each milestone rank's extra effects.
 */
export function rankContributions<E>(
  source: string,
  nodes: readonly GraphNode<E, string>[],
  ranks: Ranks,
  milestone?: RankMilestone<E>,
): { source: string; effect: E }[] {
  const out: { source: string; effect: E }[] = [];
  for (const node of nodes) {
    const owned = ranks[node.id] ?? 0;
    const from = `${source}:${node.id}`;
    for (let i = 0; i < owned; i++) for (const effect of node.effects) out.push({ source: from, effect });
    if (!milestone) continue;
    for (let m = 0; m < Math.floor(owned / milestone.every); m++)
      for (const effect of node.effects) {
        const extra = milestone.effect(effect);
        if (extra !== null) out.push({ source: from, effect: extra });
      }
  }
  return out;
}

/** A tree's rules over a ranks record the game keeps. Throws on a repeated node id or a missing requirement. */
export function tree<N extends GraphNode<unknown, string>>(def: TreeDef<N>): Tree<N> {
  type C = CostOf<N>;
  // A node of `N` is a node priced in `C`; the compiler cannot see it through the conditional type.
  const priced = (n: N): GraphNode<unknown, C> => n as unknown as GraphNode<unknown, C>;
  const byId = new Map<string, N>();
  for (const n of def.nodes) {
    if (byId.has(n.id)) throw new Error(`tree "${def.id}": the node "${n.id}" appears twice`);
    byId.set(n.id, n);
  }
  for (const n of def.nodes) assertNodeGrowth(n);
  for (const n of def.nodes)
    for (const r of n.requires)
      if (!byId.has(r))
        throw new Error(`tree "${def.id}": "${n.id}" requires "${r}", which is not in the tree`);

  const check = (id: string, ranks: Ranks, balance: (c: C) => Decimal | undefined): BuyResult<C> | null => {
    const node = byId.get(id);
    if (!node) return { ok: false, code: "unknown" };
    const failure = checkRank(priced(node), ranks, balance);
    return failure ? { ok: false, ...failure } : null;
  };

  /**
   * A node's price per rank in each currency, as a cost curve, read now (a price line may be a getter). One line is
   * `rankCost`'s geometric price floored, which `maxAffordable` counts in closed form; several lines in one currency
   * sum their floors, which no one geometric curve is, so they are walked (`WALK_LIMIT` ranks at most a call).
   */
  const curvesOf = (node: N): [C, CostCurve][] => {
    const growth = priced(node).costGrowth ?? 1;
    const lines = new Map<C, NodeCost<C>[]>();
    for (const c of priced(node).cost) lines.set(c.currency, [...(lines.get(c.currency) ?? []), c]);
    return [...lines].map(([currency, list]): [C, CostCurve] => {
      const [only] = list;
      if (list.length === 1 && only) return [currency, { base: D(only.amount), growth, round: "floor" }];
      return [
        currency,
        (level: number) =>
          rankCost(priced(node), level)
            .filter((c) => c.currency === currency)
            .reduce((sum, c) => sum.add(c.amount), ZERO),
      ];
    });
  };

  const affordable = (
    id: string,
    ranks: Ranks,
    balance: (c: C) => Decimal | undefined,
    limit?: number,
  ): number => {
    const node = byId.get(id);
    if (!node || check(id, ranks, balance)) return 0;
    const level = ranks[id] ?? 0;
    let n = Math.max(0, Math.min(limit ?? Number.POSITIVE_INFINITY, node.maxLevel - level));
    for (const [currency, curve] of curvesOf(node))
      n = Math.min(n, maxAffordable(curve, level, balance(currency) ?? ZERO, n));
    return Number.isFinite(n) ? Math.floor(n) : 0;
  };

  const buy = (ranks: Record<string, number>, id: string, purse: Purse<C>): BuyResult<C> => {
    const failure = check(id, ranks, (c) => purse.balance(c));
    if (failure) return failure;
    const level = ranks[id] ?? 0;
    // The check summed each currency's lines, so every debit lands; a purse that refuses one anyway (its own rule)
    // still refuses the rank rather than granting it short.
    for (const c of rankCost(priced(byId.get(id) as N), level)) {
      if (!purse.debit(c.currency, c.amount))
        return {
          ok: false,
          code: "cannot-afford",
          currency: c.currency,
          balance: purse.balance(c.currency),
          price: c.amount,
        };
    }
    ranks[id] = level + 1;
    return { ok: true, id, level: level + 1 };
  };

  const buyCheapest = (
    ranks: Record<string, number>,
    purse: Purse<C>,
    options: BuyCheapestOptions<N> = {},
  ): number => {
    const limit = options.limit ?? Number.POSITIVE_INFINITY;
    let bought = 0;
    while (bought < limit) {
      let best: { node: N; price: Decimal } | null = null;
      for (const node of def.nodes) {
        if (options.open && !options.open(node)) continue;
        if (check(node.id, ranks, (c) => purse.balance(c))) continue;
        const price = rankCost(priced(node), ranks[node.id] ?? 0)[0]?.amount ?? ZERO;
        // Without a limit, a free rank with no last one would be bought for ever.
        if (options.limit === undefined && price.lte(0) && !Number.isFinite(node.maxLevel)) continue;
        if (!best || price.lt(best.price)) best = { node, price };
      }
      if (!best || !buy(ranks, best.node.id, purse).ok) break;
      bought++;
    }
    return bought;
  };

  return {
    id: def.id,
    nodes: def.nodes,
    node: (id) => byId.get(id),
    price: (node, owned) => (owned >= node.maxLevel ? null : rankCost(priced(node), owned)),
    check,
    buy,
    affordable,
    buyMax: (ranks, id, purse, limit) => {
      const n = affordable(id, ranks, (c) => purse.balance(c), limit);
      const node = byId.get(id);
      if (n <= 0 || !node) return 0;
      const level = ranks[id] ?? 0;
      // Each was checked against its balance, so every debit lands; a purse that refuses one anyway (its own rule)
      // still refuses the ranks rather than granting them short, as `buy` does.
      for (const [currency, curve] of curvesOf(node))
        if (!purse.debit(currency, costOfMany(curve, level, n))) return 0;
      ranks[id] = level + n;
      return n;
    },
    buyCheapest,
    contributions: (ranks) =>
      rankContributions(def.id, def.nodes as readonly GraphNode<EffectOf<N>, string>[], ranks, def.milestone),
  };
}

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
export type TreeSlice<K extends string> = { readonly [P in K]: TreeState };

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
  contributions(state: TreeSlice<K>): { source: string; effect: EffectOf<N> }[];
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
export type UpgradeTreeFeature<
  K extends string,
  N extends GraphNode<unknown, string>,
  G extends object = object,
> = Feature<K, TreeState, TreeActions<CostOf<N>>> & UpgradeTreeHelpers<K, N, G>;

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
export function defineUpgradeTree<
  const K extends string,
  N extends GraphNode<unknown, string>,
  WK extends string,
  WS extends object,
  WA extends object,
  const R extends ReachShape = readonly [],
  G extends object = Record<K, TreeState> & Record<WK, WS> & ReachOf<R>,
>(def: {
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
}): UpgradeTreeFeature<K, N, G> & { readonly needs?: NeedsOf<R> } {
  const rules = tree({ id: def.key, nodes: def.nodes, milestone: def.milestone });
  const wallet = def.wallet;
  type Draft = CurrencyDraft<WK> & Record<K, TreeState>;
  const isOpen = (state: G, node: N): boolean => !def.open || def.open(state, node);
  const ranksOf = (state: G): Ranks => (state as unknown as Draft)[def.key].ranks;
  const balanceOf =
    (state: G) =>
    (c: CostOf<N>): Decimal =>
      wallet.select.balance(state as unknown as Draft, c);
  const select: UpgradeTreeSelect<K, N, G> = {
    open: (state, id) => {
      const node = rules.node(id);
      return node !== undefined && isOpen(state, node);
    },
    check: (state, id) => {
      const node = rules.node(id);
      if (node && !isOpen(state, node)) return { ok: false, code: "closed" };
      return rules.check(id, ranksOf(state), balanceOf(state));
    },
    affordable: (state, id, limit) => {
      const node = rules.node(id);
      if (!node || !isOpen(state, node)) return 0;
      return rules.affordable(id, ranksOf(state), balanceOf(state), limit);
    },
    ranks: (state) => state[def.key].ranks,
    rank: (state, id) => state[def.key].ranks[id] ?? 0,
    contributions: (state) => rules.contributions(state[def.key].ranks),
  };

  /** One rank inside a recipe. */
  const buyDraft = (d: Draft, id: string): BuyResult<CostOf<N>> => {
    const node = rules.node(id);
    if (node && def.open && !def.open(d as unknown as G, node)) return { ok: false, code: "closed" };
    return rules.buy(d[def.key].ranks, id, wallet.draft.purse(d));
  };
  const buyMaxDraft = (d: Draft, id: string, limit?: number): number => {
    const node = rules.node(id);
    if (!node || (def.open && !def.open(d as unknown as G, node))) return 0;
    return rules.buyMax(d[def.key].ranks, id, wallet.draft.purse(d), limit);
  };
  const buyAllDraft = (d: Draft, limit?: number): number =>
    rules.buyCheapest(d[def.key].ranks, wallet.draft.purse(d), {
      open: (node) => isOpen(d as unknown as G, node),
      limit,
    });

  const made = feature<K, TreeState, TreeActions<CostOf<N>>, ReachShape, Record<never, never>, Draft>({
    reach: def.reach,
    key: def.key,
    initial: () => ({ ranks: {} }),
    reset: def.reset,
    actions: (api: FeatureApi<Draft>) => ({
      buy: (id) => {
        let result: BuyResult<CostOf<N>> = { ok: false, code: "unknown" };
        api.set((s) => {
          result = buyDraft(s as Draft, id);
        });
        return result;
      },
      buyMax: (id, limit) => {
        let n = 0;
        api.set((s) => {
          n = buyMaxDraft(s as Draft, id, limit);
        });
        return n;
      },
      buyAll: (limit) => {
        let n = 0;
        api.set((s) => {
          n = buyAllDraft(s as Draft, limit);
        });
        return n;
      },
    }),
    moves: (s) =>
      nodeMoves<K, N, typeof s>(
        def.key,
        def.nodes,
        ranksOf(s as unknown as G),
        def.worth as ((state: typeof s, node: N) => number) | undefined,
        (node) => isOpen(s as unknown as G, node),
      ),
  });
  const helpers: UpgradeTreeHelpers<K, N, G> = {
    select,
    def: { nodes: def.nodes, node: rules.node, tree: rules },
    draft: {
      buy: (draft, id) => buyDraft(draft as Draft, id),
      buyMax: (draft, id, limit) => buyMaxDraft(draft as Draft, id, limit),
      buyAll: (draft, limit) => buyAllDraft(draft as Draft, limit),
    },
  };
  return Object.assign(made, helpers) as UpgradeTreeFeature<K, N, G> & { readonly needs?: NeedsOf<R> };
}

/** One move per node of `nodes` whose next rank can be bought: not at its last rank, requirements held, open. */
function nodeMoves<K extends string, N extends GraphNode<unknown, string>, S extends object>(
  key: K,
  nodes: readonly N[],
  ranks: Ranks,
  worth: ((state: S, node: N) => number) | undefined,
  isOpen: (node: N) => boolean,
): Move<S>[] {
  return nodes.flatMap((node): Move<S>[] => {
    const owned = ranks[node.id] ?? 0;
    if (owned >= node.maxLevel || node.requires.some((r) => !(ranks[r] ?? 0)) || !isOpen(node)) return [];
    const [price] = rankCost(node, owned);
    if (!price) return [];
    return [
      {
        id: `${key}:${node.id}`,
        cost: price,
        ...(worth && { worth: (st: S) => worth(st, node) }),
        apply: (store) =>
          (store.getState() as unknown as Record<K, TreeActions<string>>)[key].buy(node.id).ok,
      },
    ];
  });
}

/**
 * The auto-player's moves over an `upgradeTree` feature saved under `key`, for a hand-written feature that keeps
 * ranks as `TreeState` and has the tree's `buy` action (`upgradeTree` declares these itself): one per node whose next
 * rank can be bought (not at its last rank, its requirements held), priced at the first currency of that rank's
 * price. With no `worth` the auto-player works it out from its objective; `worth(state, node)` is for a node that
 * does not move it at once, in the unit the game's other moves use. Hand it to `withMoves(feature, treeMoves(...))`.
 */
export function treeMoves<K extends string, C extends string = string>(
  key: K,
  nodes: readonly GraphNode<unknown, C>[],
  worth?: (state: Record<K, TreeState & TreeActions<C>>, node: GraphNode<unknown, C>) => number,
): (state: Record<K, TreeState & TreeActions<C>>) => Move<Record<K, TreeState & TreeActions<C>>>[] {
  type S = Record<K, TreeState & TreeActions<C>>;
  return (s) => nodeMoves<K, GraphNode<unknown, C>, S>(key, nodes, s[key].ranks, worth, () => true);
}
