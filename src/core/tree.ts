import { type CostCurve, costOfMany, maxAffordable } from "./cost";
import type { CurrenciesFeature, CurrencyDraft, Purse } from "./currencies";
import { D, type Decimal, ZERO } from "./decimal";
import { type Feature, type FeatureApi, feature, type Move, type ResetRule } from "./feature";
import {
  checkRank,
  DEFAULT_COST_GROWTH,
  type GraphNode,
  type NodeCost,
  type NodeFailure,
  rankCost,
} from "./graph/nodes";

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
export type BuyResult<C extends string = string> =
  | { ok: true; id: string; level: number }
  | ({ ok: false } & ({ code: "unknown" } | { code: "closed" } | NodeFailure<C>));

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
    const growth = priced(node).costGrowth ?? DEFAULT_COST_GROWTH;
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
  return {
    id: def.id,
    nodes: def.nodes,
    node: (id) => byId.get(id),
    price: (node, owned) => (owned >= node.maxLevel ? null : rankCost(priced(node), owned)),
    check,
    buy: (ranks, id, purse) => {
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
    },
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
}

/** An `upgradeTree` feature, carrying its rules as `.tree`. */
export type UpgradeTreeFeature<K extends string, N extends GraphNode<unknown, string>> = Feature<
  K,
  TreeState,
  TreeActions<CostOf<N>>
> & { readonly tree: Tree<N> };

/**
 * A tree as a feature: it saves its ranks under `key` (the stat bus's source prefix too) and buys from `wallet`, a
 * currencies feature whose currencies price every node. `open(state, node)` may hold a node back until the game
 * says it is on offer. A prestige reset clears the ranks unless `reset` says not.
 */
export function upgradeTree<
  const K extends string,
  N extends GraphNode<unknown, string>,
  WK extends string,
  WS extends object,
  WA extends object,
  G extends object = object,
>(def: {
  readonly key: K;
  readonly nodes: readonly N[];
  readonly wallet: CurrenciesFeature<WK, CostOf<N>, WS, WA>;
  readonly milestone?: RankMilestone<EffectOf<N>>;
  /** Whether a node is on offer now, read off the whole game state: a closed one refuses with `closed`. */
  readonly open?: (state: G, node: N) => boolean;
  readonly reset?: ResetRule<TreeState>;
}): UpgradeTreeFeature<K, N> {
  const rules = tree({ id: def.key, nodes: def.nodes, milestone: def.milestone });
  const wallet = def.wallet;
  type Draft = CurrencyDraft<WK> & Record<K, TreeState>;
  const made = feature<K, TreeState, TreeActions<CostOf<N>>, readonly [], Draft>({
    key: def.key,
    reach: [],
    initial: () => ({ ranks: {} }),
    reset: def.reset,
    actions: (api: FeatureApi<Draft>) => ({
      buy: (id) => {
        let result: BuyResult<CostOf<N>> = { ok: false, code: "unknown" };
        api.set((s) => {
          const d = s as Draft;
          const node = rules.node(id);
          if (node && def.open && !def.open(d as unknown as G, node)) {
            result = { ok: false, code: "closed" };
            return;
          }
          result = rules.buy(d[def.key].ranks, id, wallet.purse(d));
        });
        return result;
      },
      buyMax: (id, limit) => {
        let n = 0;
        api.set((s) => {
          const d = s as Draft;
          const node = rules.node(id);
          if (!node || (def.open && !def.open(d as unknown as G, node))) return;
          n = rules.buyMax(d[def.key].ranks, id, wallet.purse(d), limit);
        });
        return n;
      },
    }),
  });
  return Object.assign(made, { tree: rules });
}

/**
 * The auto-player's moves over an `upgradeTree` feature saved under `key`: one per node whose next rank can be bought
 * (not at its last rank, its requirements held), priced at the first currency of that rank's price. `worth(node,
 * owned)` is what the rank is worth to the sim, in the unit the game's other moves in that currency use. Hand it to
 * `withMoves(tree, treeMoves(...))`.
 */
export function treeMoves<K extends string, C extends string = string>(
  key: K,
  nodes: readonly GraphNode<unknown, C>[],
  worth: (node: GraphNode<unknown, C>, owned: number) => number,
): (state: Record<K, TreeState & TreeActions<C>>) => Move<Record<K, TreeState & TreeActions<C>>>[] {
  type S = Record<K, TreeState & TreeActions<C>>;
  return (s) =>
    nodes.flatMap((node): Move<S>[] => {
      const ranks = s[key].ranks;
      const owned = ranks[node.id] ?? 0;
      if (owned >= node.maxLevel || node.requires.some((r) => !(ranks[r] ?? 0))) return [];
      const [price] = rankCost(node, owned);
      if (!price) return [];
      return [
        {
          id: `${key}:${node.id}`,
          cost: price,
          value: () => worth(node, owned),
          apply: (store) => store.getState()[key].buy(node.id).ok,
        },
      ];
    });
}
