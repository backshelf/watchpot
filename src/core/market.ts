import type { Draft } from "immer";
import { offlineCredit } from "./clock";
import type { CurrenciesFeature, CurrencyDraft } from "./currencies";
import { D, type Decimal, type DecimalSource, ZERO } from "./decimal";
import { type Feature, type FeatureApi, feature, type Move, type ResetRule } from "./feature";

/**
 * Markets: things with a price that wanders on its own, to buy low and sell high. A ticker's price is a pure function
 * of game time and the market's saved seed (smooth noise around a base, never outside its band), so it needs no
 * simulation: the price after a week away is read, not replayed, a chart of any stretch is free, and a reload cannot
 * reroll it. `priceAt` is the kernel; `market({ key, wallet, pays, tickers })` is a feature that holds the positions,
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

const U32 = 4294967296;

/** A uint32 hashed from a string (FNV-1a). */
function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A value in [-1, 1] at lattice point `i` of stream `salt`. */
function lattice(salt: number, i: number): number {
  let h = (salt ^ Math.imul(i | 0, 374761393)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h / U32) * 2 - 1;
}

/** Smooth 1D value noise in [-1, 1]: the lattice values joined by a smoothstep. */
function smoothNoise(salt: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = lattice(salt, i);
  return a + (lattice(salt, i + 1) - a) * u;
}

/** The octaves of a price: a slow swing, and two quicker wobbles on it. Their weights sum to 1. */
const OCTAVES: readonly (readonly [speed: number, weight: number])[] = [
  [1, 0.62],
  [3.1, 0.26],
  [8.3, 0.12],
];

/** How hard the summed octaves are pushed out toward the ends of the band (through a tanh, so never past them). */
const SPREAD = 2.2;

/**
 * Where a ticker stands in its band at game time `at`, from -1 (the bottom) to 1 (the top): smooth noise in three
 * octaves, read from the market's seed and the ticker's id. Pure: the same seed, ticker and time give the same answer.
 */
export function tickerLean(seed: number, ticker: Pick<TickerDef, "id" | "periodMs">, at: number): number {
  const salt = (seed ^ hashText(ticker.id)) >>> 0;
  const x = at / Math.max(1, ticker.periodMs);
  let lean = 0;
  for (const [k, [speed, weight]] of OCTAVES.entries())
    lean += weight * smoothNoise((salt + k * 977) >>> 0, x * speed);
  // Summed octaves crowd the middle: spread them so a price spends real time near both ends of its band.
  return Math.tanh(SPREAD * lean) / Math.tanh(SPREAD);
}

/** A ticker's price at game time `at`: `base × e^(swing × lean)`. Pure, and always inside `priceBand`. */
export function priceAt(seed: number, ticker: TickerDef, at: number): number {
  return ticker.base * Math.exp(ticker.swing * tickerLean(seed, ticker, at));
}

/** The lowest and highest price a ticker can reach. */
export function priceBand(ticker: Pick<TickerDef, "base" | "swing">): { low: number; high: number } {
  return { low: ticker.base * Math.exp(-ticker.swing), high: ticker.base * Math.exp(ticker.swing) };
}

/** `points` prices evenly spaced from `from` to `to` (both ends included): a chart's line. */
export function priceSeries(
  seed: number,
  ticker: TickerDef,
  from: number,
  to: number,
  points: number,
): number[] {
  const n = Math.max(2, Math.floor(points));
  return Array.from({ length: n }, (_, i) => priceAt(seed, ticker, from + ((to - from) * i) / (n - 1)));
}

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

/** The market's rules, read off the game state at a game time. */
export interface MarketRules<G, T extends TickerDef> {
  readonly tickers: readonly T[];
  ticker(id: string): T | undefined;
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

/** A `market` feature, carrying its rules as `.market`. */
export type MarketFeature<K extends string, G, T extends TickerDef> = Feature<
  K,
  MarketState,
  MarketActions
> & {
  readonly market: MarketRules<G, T>;
};

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
 * tickers trade, `trader` a trader that works the market by itself (`MarketTrader`). A prestige reset clears the holdings and draws a new seed unless `reset` says otherwise. The
 * callbacks read the whole game state, so annotate one of them with the game's state type.
 */
export function market<
  const K extends string,
  T extends TickerDef,
  WK extends string,
  C extends string,
  WS extends object,
  WA extends object,
  G extends object = object,
>(def: {
  readonly key: K;
  readonly tickers: readonly T[];
  /** The currencies feature trades are paid from and into. */
  readonly wallet: CurrenciesFeature<WK, C, WS, WA>;
  /** The currency a price is in. */
  readonly pays: C;
  readonly open?: (state: G, ticker: T) => boolean;
  readonly fee?: (state: G) => number;
  readonly yieldMult?: (state: G) => DecimalSource;
  /** How an absence counts for the yield. Default: all of it, at full rate. */
  readonly away?: (state: G) => { readonly rate: number; readonly capMs?: number };
  readonly player?: MarketPlayer;
  readonly trader?: MarketTrader<G>;
  readonly reset?: ResetRule<MarketState>;
}): MarketFeature<K, G, T> {
  const { tickers, wallet } = def;
  const byId = new Map<string, T>();
  for (const t of tickers) {
    if (byId.has(t.id)) throw new Error(`market "${def.key}": the ticker "${t.id}" appears twice`);
    if (!(t.base > 0) || !(t.periodMs > 0) || !(t.swing >= 0))
      throw new Error(`market "${def.key}": the ticker "${t.id}" needs a base and a period above zero`);
    byId.set(t.id, t);
  }

  type Own = Record<K, MarketState> & CurrencyDraft<WK>;
  const own = (state: unknown): MarketState => (state as Record<K, MarketState>)[def.key];
  const purse = (state: unknown) => state as CurrencyDraft<WK>;
  const heldOf = (state: unknown, id: string): Decimal => own(state).held[id] ?? ZERO;
  const paidOf = (state: unknown, id: string): Decimal => own(state).paid[id] ?? ZERO;
  const isOpen = (state: G, t: T): boolean => def.open?.(state, t) ?? true;
  const feeOf = (state: G): number => Math.min(0.99, Math.max(0, def.fee?.(state) ?? 0));
  const priceOf = (state: unknown, t: T, now: number): number => priceAt(own(state).seed, t, now);
  const levelOf = (state: unknown, t: T, now: number): number =>
    (tickerLean(own(state).seed, t, now) + 1) / 2;

  const affordable = (state: G, t: T, now: number): Decimal => {
    const each = priceOf(state, t, now) * (1 + feeOf(state));
    return wallet.select.balance(purse(state), def.pays).div(each).floor();
  };
  const yieldPerSecond = (state: G): Decimal => {
    let total = ZERO;
    for (const t of tickers) if (t.yield) total = total.add(heldOf(state, t.id).mul(t.base * t.yield));
    return total.mul(def.yieldMult?.(state) ?? 1);
  };

  const rules: MarketRules<G, T> = {
    tickers,
    ticker: (id) => byId.get(id),
    open: (state, id) => {
      const t = byId.get(id);
      return t !== undefined && isOpen(state, t);
    },
    price: (state, id, now) => {
      const t = byId.get(id);
      return t ? priceOf(state, t, now) : 0;
    },
    level: (state, id, now) => {
      const t = byId.get(id);
      return t ? levelOf(state, t, now) : 0;
    },
    rising: (state, id, now, overMs) => {
      const t = byId.get(id);
      return t ? priceOf(state, t, now) > priceOf(state, t, now - (overMs ?? t.periodMs / 50)) : false;
    },
    series: (state, id, from, to, points) => {
      const t = byId.get(id);
      return t ? priceSeries(own(state).seed, t, from, to, points) : [];
    },
    position: (state, id, now) => {
      const t = byId.get(id);
      const held = heldOf(state, id);
      const paid = paidOf(state, id);
      const worth = t ? held.mul(priceOf(state, t, now)) : ZERO;
      return {
        held,
        worth,
        paid,
        average: held.gt(0) ? paid.div(held).toNumber() : 0,
        profit: worth.sub(paid),
      };
    },
    worth: (state, now) => {
      let total = ZERO;
      for (const t of tickers) total = total.add(heldOf(state, t.id).mul(priceOf(state, t, now)));
      return total;
    },
    yieldPerSecond,
    affordable: (state, id, now) => {
      const t = byId.get(id);
      return t && isOpen(state, t) ? affordable(state, t, now) : ZERO;
    },
    fee: feeOf,
    trading: (state) => isTrading(state),
  };

  /** Buys `units` inside a recipe: all of them or nothing. */
  const buyDraft = (draft: Draft<Own>, id: string, units: Decimal, now: number): Decimal => {
    const t = byId.get(id);
    const state = draft as unknown as G;
    const n = units.floor();
    if (!t || !isOpen(state, t) || !n.gt(0)) return ZERO;
    const cost = n.mul(priceOf(draft, t, now) * (1 + feeOf(state)));
    if (!wallet.draft.debit(purse(draft), def.pays, cost)) return ZERO;
    const s = own(draft);
    s.held[id] = heldOf(draft, id).add(n);
    s.paid[id] = paidOf(draft, id).add(cost);
    s.trades += 1;
    return n;
  };

  /** Sells up to `units` inside a recipe. */
  const sellDraft = (draft: Draft<Own>, id: string, units: Decimal, now: number): Decimal => {
    const t = byId.get(id);
    const state = draft as unknown as G;
    const held = heldOf(draft, id);
    const n = lesser(units.floor(), held);
    if (!t || !n.gt(0)) return ZERO;
    const takes = n.mul(priceOf(draft, t, now) * (1 - feeOf(state)));
    // The basis leaves with the units, in proportion: selling half a holding takes half of what it cost.
    const basis = n.gte(held) ? paidOf(draft, id) : paidOf(draft, id).mul(n.div(held));
    const s = own(draft);
    s.held[id] = held.sub(n);
    s.paid[id] = paidOf(draft, id).sub(basis);
    s.realised = s.realised.add(takes.sub(basis));
    s.trades += 1;
    wallet.draft.credit(purse(draft), def.pays, takes);
    return n;
  };

  const pay = (draft: Draft<Own>, seconds: number): void => {
    if (!(seconds > 0)) return;
    const due = yieldPerSecond(draft as unknown as G).mul(seconds);
    if (!due.gt(0)) return;
    const s = own(draft);
    s.yielded = s.yielded.add(due);
    wallet.draft.credit(purse(draft), def.pays, due);
  };

  const trader = def.trader;
  const isTrading = (state: G): boolean => trader !== undefined && (trader.active?.(state) ?? true);
  const traderBuyBelow = trader?.buyBelow ?? 0.3;
  const traderSellAbove = trader?.sellAbove ?? 0.7;
  const traderSpend = (state: G): number => {
    const share = trader?.spend;
    const raw = typeof share === "function" ? share(state) : (share ?? 0.5);
    return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
  };
  /** One look by the trader inside a recipe: the sales first, so their takings can fund the buys. */
  const trade = (draft: Draft<Own>, now: number): void => {
    const state = draft as unknown as G;
    if (!isTrading(state)) return;
    for (const t of tickers)
      if (levelOf(draft, t, now) > traderSellAbove && heldOf(draft, t.id).gt(0))
        sellDraft(draft, t.id, heldOf(draft, t.id), now);
    for (const t of tickers) {
      if (!isOpen(state, t) || heldOf(draft, t.id).gt(0) || !(levelOf(draft, t, now) < traderBuyBelow))
        continue;
      buyDraft(draft, t.id, affordable(state, t, now).mul(traderSpend(state)), now);
    }
  };

  const buyBelow = def.player?.buyBelow ?? 0.3;
  const sellAbove = def.player?.sellAbove ?? 0.7;
  const spend = Math.min(1, Math.max(0, def.player?.spend ?? 0.5));

  const made = feature<K, MarketState, MarketActions, readonly [], Record<never, never>, Own>({
    key: def.key,
    initial: (ctx): MarketState => ({
      seed: hashText(`${ctx.rng.join(".")}:${def.key}`),
      held: {},
      paid: {},
      realised: ZERO,
      yielded: ZERO,
      trades: 0,
    }),
    reset: def.reset ?? "run",
    actions: (api: FeatureApi<Own>): MarketActions => {
      const act = (run: (d: Draft<Own>, now: number) => Decimal): Decimal => {
        let n = ZERO;
        const now = api.now();
        api.set((d) => {
          n = run(d, now);
        });
        return n;
      };
      return {
        buy: (id, units) => act((d, now) => buyDraft(d, id, D(units), now)),
        buyMax: (id, share = 1) =>
          act((d, now) => {
            const t = byId.get(id);
            if (!t) return ZERO;
            const most = affordable(d as unknown as G, t, now);
            return buyDraft(d, id, most.mul(Math.min(1, Math.max(0, share))), now);
          }),
        sell: (id, units) => act((d, now) => sellDraft(d, id, D(units), now)),
        sellAll: (id) => act((d, now) => sellDraft(d, id, heldOf(d, id), now)),
      };
    },
    steps: {
      produce: {
        yield: {
          pass: "both",
          run: (d: Draft<Own>, ctx) => {
            if (ctx.pass === "tick") return pay(d, ctx.dtMs / 1000);
            const away = def.away?.(d as unknown as G) ?? { rate: 1 };
            pay(
              d,
              offlineCredit(ctx.dtMs, away.rate, away.capMs ?? Number.POSITIVE_INFINITY).creditedMs / 1000,
            );
          },
        },
      },
      automate: {
        trade: (d: Draft<Own>, ctx) => {
          // On the interval's phase in game time, so it needs no saved clock: a pass that crosses a mark trades.
          const every = trader?.everyMs ?? 0;
          if (
            ctx.pass === "tick" &&
            every > 0 &&
            Math.floor(ctx.now / every) === Math.floor((ctx.now - ctx.dtMs) / every)
          )
            return;
          trade(d, ctx.now);
        },
      },
    },
    // The auto-player buys low and sells high: a buy of `spend` of the balance while a ticker sits low in its band,
    // and a free sale of the whole holding once it sits high. It reads the game clock off the store's root.
    moves: (s) => {
      const state = s as unknown as G & { gameNow?: () => number };
      const now = state.gameNow?.() ?? 0;
      const out: Move<typeof s>[] = [];
      // A market with its own trader trading needs no hand from the auto-player.
      if (isTrading(state)) return out;
      for (const t of tickers) {
        if (!isOpen(state, t)) continue;
        const level = levelOf(s, t, now);
        const actions = (store: { getState(): unknown }) =>
          (store.getState() as Record<K, MarketActions>)[def.key];
        if (level < buyBelow) {
          const units = affordable(state, t, now).mul(spend).floor();
          if (units.gt(0))
            out.push({
              id: `${def.key}:buy:${t.id}`,
              cost: { currency: def.pays, amount: units.mul(priceOf(s, t, now) * (1 + feeOf(state))) },
              value: () => 1 - level,
              apply: (store) => actions(store).buy(t.id, units).gt(0),
            });
        }
        if (level > sellAbove && heldOf(s, t.id).gt(0))
          out.push({
            id: `${def.key}:sell:${t.id}`,
            value: () => level,
            apply: (store) => actions(store).sellAll(t.id).gt(0),
          });
      }
      return out;
    },
  });
  return Object.assign(made, { market: rules });
}

/** The smaller of two Decimals. */
function lesser(a: Decimal, b: Decimal): Decimal {
  return a.lt(b) ? a : b;
}
