import type { Draft } from "immer";
import { offlineCredit } from "./clock";
import { type CostCurve, costAt, costOfMany, maxAffordable, stepsOf, untilStep } from "./cost";
import type { CurrenciesFeature, CurrencyDraft } from "./currencies";
import { D, type Decimal, type DecimalSource, ONE, ZERO } from "./decimal";
import { type Feature, type FeatureApi, feature, type Move, type ResetRule } from "./feature";

/**
 * Dimensions: a chain of producers where each tier makes the tier below it and the lowest makes a currency. The
 * first tier bought earns the currency; the second earns more of the first; and so on up, so the currency grows as
 * a polynomial of the chain's height. Every `set.size` bought of a tier multiplies that tier's output by
 * `set.mult` (ten bought doubles it), and the game multiplies further through `mult` and `speed`.
 *
 * `advanceChain` is the pure kernel: the exact amounts after any stretch of time, in one step, so a tick of 50 ms
 * and an absence of a week follow the same curve. `dimensions({ key, tiers, wallet, makes })` is the feature.
 */

/** What `advanceChain` returns: the amounts after the stretch, and what the lowest tier made over it. */
export interface ChainStep {
  readonly amounts: Decimal[];
  readonly produced: Decimal;
}

/**
 * Advances a chain by `seconds`. `amounts[i]` is held of tier `i` (0 the lowest) and `rates[i]` what one of tier
 * `i` makes a second: of tier `i - 1`, or of the product for tier 0. With the rates fixed over the stretch each
 * amount is a polynomial in time, `a_i(t) = sum_k a_(i+k)(0) x r_(i+1)..r_(i+k) x t^k / k!`, and the product its
 * integral, so the result is exact for any `seconds`. Pure.
 */
export function advanceChain(
  amounts: readonly DecimalSource[],
  rates: readonly DecimalSource[],
  seconds: number,
): ChainStep {
  const held = amounts.map((a) => D(a));
  const t = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  if (t === 0 || held.length === 0) return { amounts: held, produced: ZERO };
  const rate = (i: number): Decimal => D(rates[i] ?? 0);
  const next: Decimal[] = [];
  for (let i = 0; i < held.length; i++) {
    let total = held[i] ?? ZERO;
    // term = r_(i+1)..r_(i+k) x t^k / k!, built up one tier at a time.
    let term = ONE;
    for (let k = 1; i + k < held.length; k++) {
      term = term.mul(rate(i + k)).mul(t / k);
      const above = held[i + k] ?? ZERO;
      if (above.gt(0)) total = total.add(above.mul(term));
    }
    next.push(total);
  }
  let produced = ZERO;
  let term = ONE;
  for (let k = 0; k < held.length; k++) {
    term = term.mul(rate(k)).mul(t / (k + 1));
    const from = held[k] ?? ZERO;
    if (from.gt(0)) produced = produced.add(from.mul(term));
  }
  return { amounts: next, produced };
}

/** One tier of a chain: its id and what the next one costs. The game's own fields (a name, a line) ride along. */
export interface DimensionTier<C extends string = string> {
  readonly id: string;
  readonly cost: CostCurve;
  /** The currency this tier is bought with, when it is not the chain's `pays`. */
  readonly pays?: C;
  /** How many one purchase adds to what is held (default 1). */
  readonly gives?: DecimalSource;
  /** Held at the start of a run, bought or not (default 0). */
  readonly start?: DecimalSource;
}

/** The set bonus: every `size` bought of a tier multiplies its output by `mult`. */
export interface DimensionSet {
  readonly size: number;
  readonly mult: DecimalSource;
}

/** The feature's saved state: what is held and what was bought, per tier id. */
export interface DimensionsState {
  /** Held per tier: what was bought plus what the tier above made. */
  amount: Record<string, Decimal>;
  /** Bought per tier: what the price and the set bonus read. */
  bought: Record<string, number>;
}

/** The feature's actions. */
export interface DimensionActions {
  /** Buys exactly `count` (default 1) of a tier, or nothing. */
  buy(id: string, count?: number): boolean;
  /** Buys what completes the tier's current set (ten bought at a size of ten), or nothing. */
  buySet(id: string): boolean;
  /** Buys as many of a tier as the balance covers, `limit` at most. Returns how many. */
  buyMax(id: string, limit?: number): number;
  /** `buyMax` on every open tier, highest first. Returns how many in all. */
  maxAll(): number;
}

/** A chain's rules, read off the game state: prices, multipliers, rates and what is open. */
export interface DimensionRules<G, T extends DimensionTier> {
  readonly tiers: readonly T[];
  readonly set: DimensionSet | null;
  /** A tier by id. */
  tier(id: string): T | undefined;
  /** The tier's place in the chain, 0 the lowest; -1 for an unknown id. */
  indexOf(id: string): number;
  /** Whether the tier can be bought now. */
  open(state: G, id: string): boolean;
  /** The price of the next `count` (default 1) of a tier. */
  price(state: G, id: string, count?: number): Decimal;
  /** How many more of a tier the balance covers. */
  affordable(state: G, id: string): number;
  /** How many more complete the tier's current set (0 without a set bonus). */
  untilSet(state: G, id: string): number;
  /** The set bonus a tier holds: `mult ^ floor(bought / size)`. */
  setBonus(state: G, id: string): Decimal;
  /** What one of a tier makes a second: the set bonus, the game's `mult` and the game's `speed`. */
  rate(state: G, id: string): Decimal;
  /** What the whole of a tier makes a second: of the tier below, or of the currency for the lowest. */
  perSecond(state: G, id: string): Decimal;
}

/** The chain's draft helpers, for a recipe or a step (an autobuyer's `run`). Each returns how many it bought. */
export interface DimensionHelpers {
  /** Buys exactly `count` (default 1) of a tier inside a recipe, or nothing. */
  buy(draft: object, id: string, count?: number): number;
  /** Buys as many of a tier as the balance covers inside a recipe, `limit` at most. */
  buyMax(draft: object, id: string, limit?: number): number;
  /** `buyMax` on every open tier inside a recipe, highest first. */
  maxAll(draft: object): number;
  /**
   * Advances the chain by `seconds` at the rates the draft holds now, inside a recipe: the amounts move and the
   * lowest tier's product is credited. For a game that replays an absence in steps and buys between them (its
   * `away` then says `{ rate: 0 }`, so the chain's own step credits nothing over the gap).
   */
  produce(draft: object, seconds: number): void;
}

/** A `dimensions` feature, carrying its rules as `.chain` and the draft helpers `buy`, `buyMax` and `maxAll`. */
export type DimensionsFeature<K extends string, G, T extends DimensionTier> = Feature<
  K,
  DimensionsState,
  DimensionActions
> &
  DimensionHelpers & {
    readonly chain: DimensionRules<G, T>;
  };

/** The share of an absence a chain is credited, and the most of it that counts. */
export interface DimensionAway {
  /** 0 to 1: the share of the time away that counts. */
  readonly rate: number;
  /** The longest absence that counts (default: all of it). */
  readonly capMs?: number;
}

/** The definition `dimensions` takes. */
export interface DimensionsDef<
  K extends string,
  T extends DimensionTier<C>,
  WK extends string,
  C extends string,
  WS extends object,
  WA extends object,
  G extends object,
> {
  /** The saved key. */
  readonly key: K;
  /** The chain, lowest first: `tiers[0]` makes the currency, each other tier makes the one before it. */
  readonly tiers: readonly T[];
  /** The currencies feature the chain pays into and buys from. */
  readonly wallet: CurrenciesFeature<WK, C, WS, WA>;
  /** The currency the lowest tier makes. */
  readonly makes: C;
  /** The currency tiers are bought with (default: `makes`). */
  readonly pays?: C;
  /** The set bonus (ten bought doubles: `{ size: 10, mult: 2 }`). None without it. */
  readonly set?: DimensionSet;
  /** The game's own multiplier on one tier's output, read off the whole game state. */
  readonly mult?: (state: G, tier: T, index: number) => DecimalSource;
  /** The game's multiplier on every tier's output: a tick speed. */
  readonly speed?: (state: G) => DecimalSource;
  /** Whether a tier can be bought. Default: the lowest always, each other once the tier below was bought. */
  readonly open?: (state: G, tier: T, index: number) => boolean;
  /** How an absence counts. Default: all of it, at full rate. */
  readonly away?: (state: G) => DimensionAway;
  /** How far ahead the auto-player values a tier, in seconds (default 60). */
  readonly horizonS?: number;
  readonly reset?: ResetRule<DimensionsState>;
}

/**
 * A chain of dimensions as a feature. It saves `{ amount, bought }` under `key`, produces in the step
 * `<key>.produce.chain` (exactly, through `advanceChain`, over a tick and over an absence), buys from `wallet`
 * and carries its rules as `.chain`. A prestige reset starts the chain over unless `reset` says otherwise. The
 * callbacks read the whole game state, so annotate one of them with the game's state type.
 */
export function dimensions<
  const K extends string,
  T extends DimensionTier<C>,
  WK extends string,
  C extends string,
  WS extends object,
  WA extends object,
  G extends object = object,
>(def: DimensionsDef<K, T, WK, C, WS, WA, G>): DimensionsFeature<K, G, T> {
  const { tiers, wallet } = def;
  const set = def.set ?? null;
  const index = new Map<string, number>();
  for (const [i, t] of tiers.entries()) {
    if (index.has(t.id)) throw new Error(`dimensions "${def.key}": the tier "${t.id}" appears twice`);
    index.set(t.id, i);
  }
  if (set && !(set.size > 0)) throw new Error(`dimensions "${def.key}": the set size must be above zero`);

  type Own = Record<K, DimensionsState> & CurrencyDraft<WK>;
  const own = (state: unknown): DimensionsState => (state as Record<K, DimensionsState>)[def.key];
  const paysOf = (t: T): C => t.pays ?? def.pays ?? def.makes;
  const boughtOf = (state: unknown, t: T): number => own(state).bought[t.id] ?? 0;
  const amountOf = (state: unknown, t: T): Decimal => own(state).amount[t.id] ?? ZERO;

  const open = (state: G, t: T, i: number): boolean => {
    if (def.open) return def.open(state, t, i);
    const below = tiers[i - 1];
    return i === 0 || (below !== undefined && boughtOf(state, below) > 0);
  };
  const setBonus = (state: unknown, t: T): Decimal =>
    set ? D(set.mult).pow(stepsOf(boughtOf(state, t), set.size)) : ONE;
  const rateOf = (state: G, t: T, i: number): Decimal =>
    setBonus(state, t)
      .mul(def.mult?.(state, t, i) ?? 1)
      .mul(def.speed?.(state) ?? 1);
  const find = (id: string): [T, number] | null => {
    const i = index.get(id);
    const t = i === undefined ? undefined : tiers[i];
    return t === undefined || i === undefined ? null : [t, i];
  };

  const chain: DimensionRules<G, T> = {
    tiers,
    set,
    tier: (id) => find(id)?.[0],
    indexOf: (id) => index.get(id) ?? -1,
    open: (state, id) => {
      const hit = find(id);
      return hit !== null && open(state, hit[0], hit[1]);
    },
    price: (state, id, count = 1) => {
      const hit = find(id);
      return hit ? costOfMany(hit[0].cost, boughtOf(state, hit[0]), count) : ZERO;
    },
    affordable: (state, id) => {
      const hit = find(id);
      if (!hit || !open(state, hit[0], hit[1])) return 0;
      const held = wallet.balance(state as unknown as CurrencyDraft<WK>, paysOf(hit[0]));
      return maxAffordable(hit[0].cost, boughtOf(state, hit[0]), held);
    },
    untilSet: (state, id) => {
      const hit = find(id);
      return hit && set ? untilStep(boughtOf(state, hit[0]), set.size) : 0;
    },
    setBonus: (state, id) => {
      const hit = find(id);
      return hit ? setBonus(state, hit[0]) : ONE;
    },
    rate: (state, id) => {
      const hit = find(id);
      return hit ? rateOf(state, hit[0], hit[1]) : ZERO;
    },
    perSecond: (state, id) => {
      const hit = find(id);
      return hit ? amountOf(state, hit[0]).mul(rateOf(state, hit[0], hit[1])) : ZERO;
    },
  };

  /** Buys up to `count` of a tier inside a recipe: all of them, or (`partial`) what the balance covers. */
  const buyDraft = (draft: Draft<Own>, id: string, count: number, partial: boolean): number => {
    const hit = find(id);
    const state = draft as unknown as G;
    if (!hit || !open(state, hit[0], hit[1])) return 0;
    const [t] = hit;
    const want = Math.max(0, Math.floor(count));
    const purse = draft as unknown as CurrencyDraft<WK>;
    const had = boughtOf(draft, t);
    const n = partial ? maxAffordable(t.cost, had, wallet.balance(purse, paysOf(t)), want) : want;
    if (n <= 0 || !wallet.debit(purse, paysOf(t), costOfMany(t.cost, had, n))) return 0;
    const s = own(draft);
    s.bought[t.id] = had + n;
    s.amount[t.id] = amountOf(draft, t).add(D(t.gives ?? 1).mul(n));
    return n;
  };

  /** `buyMax` on every open tier inside a recipe, highest first. */
  const maxAllDraft = (draft: Draft<Own>): number => {
    let n = 0;
    for (let i = tiers.length - 1; i >= 0; i--) {
      const t = tiers[i];
      if (t) n += buyDraft(draft, t.id, Number.POSITIVE_INFINITY, true);
    }
    return n;
  };

  const produce = (draft: Draft<Own>, seconds: number): void => {
    if (!(seconds > 0)) return;
    const state = draft as unknown as G;
    const step = advanceChain(
      tiers.map((t) => amountOf(draft, t)),
      tiers.map((t, i) => rateOf(state, t, i)),
      seconds,
    );
    const s = own(draft);
    for (const [i, t] of tiers.entries()) s.amount[t.id] = step.amounts[i] ?? ZERO;
    wallet.credit(draft as unknown as CurrencyDraft<WK>, def.makes, step.produced);
  };

  const horizon = def.horizonS ?? 60;
  /** What one more of tier `i` adds to the currency's rate once it has run for the horizon. */
  const worth = (state: G, i: number): number => {
    let value = ONE;
    for (let k = 0; k <= i; k++) {
      const t = tiers[k];
      if (t) value = value.mul(rateOf(state, t, k)).mul(k === 0 ? 1 : horizon / k);
    }
    const n = value.toNumber();
    return Number.isFinite(n) ? n : Number.MAX_VALUE;
  };

  const made = feature<K, DimensionsState, DimensionActions, readonly [], Own>({
    key: def.key,
    initial: (): DimensionsState => ({
      amount: Object.fromEntries(tiers.map((t) => [t.id, D(t.start ?? 0)])),
      bought: Object.fromEntries(tiers.map((t) => [t.id, 0])),
    }),
    reset: def.reset ?? "run",
    actions: (api: FeatureApi<Own>): DimensionActions => {
      const run = (id: string, count: number, partial: boolean): number => {
        let n = 0;
        api.set((d) => {
          n = buyDraft(d, id, count, partial);
        });
        return n;
      };
      return {
        buy: (id, count = 1) => run(id, count, false) > 0,
        buySet: (id) => {
          const hit = find(id);
          if (!hit || !set) return false;
          return run(id, untilStep(boughtOf(api.get(), hit[0]), set.size), false) > 0;
        },
        buyMax: (id, limit = Number.POSITIVE_INFINITY) => run(id, limit, true),
        maxAll: () => {
          let n = 0;
          api.set((d) => {
            n = maxAllDraft(d);
          });
          return n;
        },
      };
    },
    steps: {
      produce: {
        chain: (d: Draft<Own>, ctx) => {
          if (ctx.pass === "tick") return produce(d, ctx.dtMs / 1000);
          const away = def.away?.(d as unknown as G) ?? { rate: 1 };
          const span = offlineCredit(ctx.dtMs, away.rate, away.capMs ?? Number.POSITIVE_INFINITY);
          produce(d, span.creditedMs / 1000);
        },
      },
    },
    moves: (s) =>
      tiers
        .map((t, i) => ({ t, i }))
        .filter(({ t, i }) => open(s as unknown as G, t, i))
        .map(
          ({ t, i }): Move<typeof s> => ({
            id: `${def.key}:${t.id}`,
            cost: { currency: paysOf(t), amount: costAt(t.cost, boughtOf(s, t)) },
            value: (st) => worth(st as unknown as G, i),
            apply: (store) => (store.getState() as Record<K, DimensionActions>)[def.key].buy(t.id),
          }),
        ),
  });
  const helpers: DimensionHelpers = {
    buy: (draft, id, count = 1) => buyDraft(draft as Draft<Own>, id, count, false),
    buyMax: (draft, id, limit = Number.POSITIVE_INFINITY) => buyDraft(draft as Draft<Own>, id, limit, true),
    maxAll: (draft) => maxAllDraft(draft as Draft<Own>),
    produce: (draft, seconds) => produce(draft as Draft<Own>, seconds),
  };
  return Object.assign(made, helpers, { chain });
}
