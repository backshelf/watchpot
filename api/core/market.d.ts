import type { CurrenciesFeature } from "./currencies";
import { type Decimal, type DecimalSource } from "./decimal";
import { type Feature, type NeedsOf, type ReachOf, type ReachShape, type ResetRule } from "./feature";
/**
 * Markets: things with a price that wanders on its own, to buy low and sell high. A ticker's price is a pure function
 * of game time and the market's saved seed (smooth noise around a base, never outside its band), so it needs no
 * simulation: the price after a week away is read, not replayed, a chart of any stretch is free, and a reload cannot
 * reroll it. `priceAt` is the kernel; `defineMarket({ key, wallet, pays, tickers })` is a feature that holds the positions,
 * trades through a currencies feature and pays each holding's yield over a tick and over an absence.
 */
/** One thing the market trades. */
export interface TickerDef {
    readonly id: string;
    /** The price it wanders around (its geometric middle). */
    readonly base: number;
    /** How far it strays: the price stays within `base × e^±swing` (0.7 is roughly half to double). */
    readonly swing: number;
    /** The length of one slow swing; quicker wobbles ride on it. */
    readonly periodMs: number;
    /** What one unit held pays a second, as a share of `base` (a dividend). None without it. */
    readonly yield?: number;
}
/** A market's saved state: its seed, what is held, what the holdings cost, and the record. */
export interface MarketState {
    /** The seed every price is read from, drawn once per profile (and again by a reset that clears the market). */
    seed: number;
    /** Units held, by ticker. */
    held: Record<string, Decimal>;
    /** What the units still held cost in all, by ticker: the cost basis. */
    paid: Record<string, Decimal>;
    /** Profit taken by selling, less losses. */
    realised: Decimal;
    /** Everything the holdings' yield has paid. */
    yielded: Decimal;
    /** Buys and sells so far. */
    trades: number;
}
/**
 * Where a ticker stands in its band at game time `at`, from -1 (the bottom) to 1 (the top): smooth noise in three
 * octaves, read from the market's seed and the ticker's id. Pure: the same seed, ticker and time give the same answer.
 */
export declare function tickerLean(seed: number, ticker: Pick<TickerDef, "id" | "periodMs">, at: number): number;
/** A ticker's price at game time `at`: `base × e^(swing × lean)`. Pure, and always inside `priceBand`. */
export declare function priceAt(seed: number, ticker: TickerDef, at: number): number;
/** The lowest and highest price a ticker can reach. */
export declare function priceBand(ticker: Pick<TickerDef, "base" | "swing">): {
    low: number;
    high: number;
};
/** `points` prices evenly spaced from `from` to `to` (both ends included): a chart's line. */
export declare function priceSeries(seed: number, ticker: TickerDef, from: number, to: number, points: number): number[];
/** One holding as a screen prints it. */
export interface MarketPosition {
    /** Units held. */
    readonly held: Decimal;
    /** What they are worth at the price now. */
    readonly worth: Decimal;
    /** What they cost. */
    readonly paid: Decimal;
    /** The average price paid a unit (0 with nothing held). */
    readonly average: number;
    /** `worth - paid`: the profit a sale now would take (negative for a loss). */
    readonly profit: Decimal;
}
/** The market's read-only questions over state, at a game time. */
export interface MarketSelect<G> {
    /** Whether the ticker trades now. */
    open(state: G, id: string): boolean;
    /** The price now, before any fee. */
    price(state: G, id: string, now: number): number;
    /** Where the price stands in its band, 0 (the bottom) to 1 (the top). */
    level(state: G, id: string, now: number): number;
    /** Whether the price is higher than it was `overMs` ago (default a fiftieth of the ticker's period). */
    rising(state: G, id: string, now: number, overMs?: number): boolean;
    /** A chart's line: `points` prices from `from` to `to`. */
    series(state: G, id: string, from: number, to: number, points: number): number[];
    /** The holding in one ticker. */
    position(state: G, id: string, now: number): MarketPosition;
    /** What every holding is worth at the prices now. */
    worth(state: G, now: number): Decimal;
    /** What the holdings pay a second in all. */
    yieldPerSecond(state: G): Decimal;
    /** The most units the balance covers now, the fee counted. */
    affordable(state: G, id: string, now: number): Decimal;
    /** The share of a trade the market keeps now (0 to 1). */
    fee(state: G): number;
    /** Whether the market's `trader` is trading now (false without one). */
    trading(state: G): boolean;
}
/** The market feature's actions. Units are whole; each returns the units traded (zero when it refused). */
export interface MarketActions {
    /** Buys exactly `units`, or nothing when the balance does not cover them. */
    buy(id: string, units: DecimalSource): Decimal;
    /** Buys what `share` of the balance covers (default all of it). */
    buyMax(id: string, share?: number): Decimal;
    /** Sells `units`, or all that is held when fewer are. */
    sell(id: string, units: DecimalSource): Decimal;
    /** Sells the whole holding. */
    sellAll(id: string): Decimal;
}
/** The fixed configuration of a market feature: the tickers as given, and a ticker by id. */
export interface MarketFixed<T extends TickerDef> {
    readonly tickers: readonly T[];
    /** A ticker by id. */
    ticker(id: string): T | undefined;
}
/**
 * The helpers that take a draft first and change it, named like the actions they mirror, for a recipe or a step. A
 * price is read at game time, so each takes `now` last (default the state's `gameNow()` when it carries one, else
 * 0; a step passes its `ctx.now`). Each returns the units traded (zero when it refused).
 */
export interface MarketDraftHelpers {
    /** Buys exactly `units` inside a recipe, or nothing when the balance does not cover them. */
    buy(draft: object, id: string, units: DecimalSource, now?: number): Decimal;
    /** Buys what `share` of the balance covers (default all of it) inside a recipe. */
    buyMax(draft: object, id: string, share?: number, now?: number): Decimal;
    /** Sells `units` inside a recipe, or all that is held when fewer are. */
    sell(draft: object, id: string, units: DecimalSource, now?: number): Decimal;
    /** Sells the whole holding inside a recipe. */
    sellAll(draft: object, id: string, now?: number): Decimal;
}
/** The three namespaces of a market feature. */
export interface MarketHelpers<G, T extends TickerDef> {
    readonly select: MarketSelect<G>;
    readonly def: MarketFixed<T>;
    readonly draft: MarketDraftHelpers;
}
/** A `market` feature: the feature plus `select`, `def` and `draft`. */
export type MarketFeature<K extends string, G, T extends TickerDef> = Feature<K, MarketState, MarketActions> & MarketHelpers<G, T>;
/** How the auto-player trades: it buys in the lower part of the band and sells in the upper. */
export interface MarketPlayer {
    /** Buy while the level is under this (default 0.3). */
    readonly buyBelow?: number;
    /** Sell while the level is over this (default 0.7). */
    readonly sellAbove?: number;
    /** The share of the balance one buy spends (default 0.5). */
    readonly spend?: number;
}
/**
 * A trader that works the market by itself in the step `<key>.automate.trade`: it sells a whole holding once its
 * ticker sits over `sellAbove`, and buys `spend` of the balance into a ticker it holds none of once that one sits
 * under `buyBelow`. An absence trades once, at its end (a price is read, not replayed).
 */
export interface MarketTrader<G> extends Omit<MarketPlayer, "spend"> {
    /**
     * The share of the balance one buy spends (default 0.5), or that share read from the state at each buy: a share that
     * falls as the balance grows lets a trader compound quickly from little and slowly from a fortune.
     */
    readonly spend?: number | ((state: G) => number);
    /** Whether it trades now (default: always). */
    readonly active?: (state: G) => boolean;
    /**
     * How often it looks, in game time (default: every pass). A trader that looks every tick takes every wobble, which
     * compounds the currency far past what a person checking in now and then would make; this keeps it to their pace.
     */
    readonly everyMs?: number;
}
/**
 * A market as a feature. It saves `MarketState` under `key`, trades in the currency `pays` through `wallet`, and pays
 * every holding's `yield` in the step `<key>.produce.yield` (over an absence too: `away`, default all of it). `fee`
 * is the share of each trade the market keeps, `yieldMult` the game's multiplier on every yield, `open` which
 * tickers trade, `trader` a trader that works the market by itself (`MarketTrader`). A prestige reset clears the
 * holdings and draws a new seed unless `reset` says otherwise. The callbacks read the whole game state (the
 * feature's own slice, the wallet's and what `reach` names), typed with no annotation.
 */
export declare function defineMarket<const K extends string, T extends TickerDef, WK extends string, C extends string, WS extends object, WA extends object, const R extends ReachShape = readonly [], G extends object = Record<K, MarketState> & Record<WK, WS> & ReachOf<R>>(def: {
    readonly key: K;
    /** The features the callbacks read, as `feature`'s `reach`; the wallet is reached already. */
    readonly reach?: R | (() => R);
    readonly tickers: readonly T[];
    /** The currencies feature trades are paid from and into. */
    readonly wallet: CurrenciesFeature<WK, C, WS, WA>;
    /** The currency a price is in. */
    readonly pays: C;
    readonly open?: (state: G, ticker: T) => boolean;
    readonly fee?: (state: G) => number;
    readonly yieldMult?: (state: G) => DecimalSource;
    /** How an absence counts for the yield. Default: all of it, at full rate. */
    readonly away?: (state: G) => {
        readonly rate: number;
        readonly capMs?: number;
    };
    readonly player?: MarketPlayer;
    readonly trader?: MarketTrader<G>;
    readonly reset?: ResetRule<MarketState>;
}): MarketFeature<K, G, T> & {
    readonly needs?: NeedsOf<R>;
};
