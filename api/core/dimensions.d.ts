import { type CostCurve } from "./cost";
import type { CurrenciesFeature } from "./currencies";
import { type Decimal, type DecimalSource } from "./decimal";
import { type Feature, type ResetRule } from "./feature";
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
export declare function advanceChain(amounts: readonly DecimalSource[], rates: readonly DecimalSource[], seconds: number): ChainStep;
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
export type DimensionsFeature<K extends string, G, T extends DimensionTier> = Feature<K, DimensionsState, DimensionActions> & DimensionHelpers & {
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
export interface DimensionsDef<K extends string, T extends DimensionTier<C>, WK extends string, C extends string, WS extends object, WA extends object, G extends object> {
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
export declare function dimensions<const K extends string, T extends DimensionTier<C>, WK extends string, C extends string, WS extends object, WA extends object, G extends object = object>(def: DimensionsDef<K, T, WK, C, WS, WA, G>): DimensionsFeature<K, G, T>;
