import { describe, expect, test } from "bun:test";
import {
  DAY_MS,
  type Decimal,
  defineCurrencies,
  defineGame,
  defineMarket,
  HOUR_MS,
  MINUTE_MS,
  priceAt,
  priceBand,
  priceSeries,
  type TickerDef,
  tickerLean,
  vocab,
} from "watchpot/core";
import { autoPlayer, createSimWorld, simStore } from "watchpot/sim";
import { freshStore, T0 } from "watchpot/test";

const OATS: TickerDef = { id: "oats", base: 10, swing: 0.7, periodMs: HOUR_MS, yield: 0.001 };
const TIN: TickerDef = { id: "tin", base: 400, swing: 0.3, periodMs: 6 * HOUR_MS };

describe("priceAt", () => {
  test("is a pure function of the seed, the ticker and the time, and never leaves its band", () => {
    const { low, high } = priceBand(OATS);
    let lowest = Number.POSITIVE_INFINITY;
    let highest = 0;
    for (let t = 0; t < 30 * DAY_MS; t += 7 * MINUTE_MS) {
      const p = priceAt(42, OATS, t);
      expect(p).toBe(priceAt(42, OATS, t));
      lowest = Math.min(lowest, p);
      highest = Math.max(highest, p);
    }
    expect(lowest).toBeGreaterThanOrEqual(low);
    expect(highest).toBeLessThanOrEqual(high);
    // A month of hourly swings uses most of the band.
    expect(lowest).toBeLessThan(OATS.base * 0.75);
    expect(highest).toBeGreaterThan(OATS.base * 1.35);
  });

  test("uses its band: a real share of the time is spent near each end", () => {
    let low = 0;
    let high = 0;
    let n = 0;
    for (let t = 0; t < 60 * DAY_MS; t += 5 * MINUTE_MS) {
      const lean = tickerLean(11, OATS, t);
      if (lean < -0.5) low++;
      if (lean > 0.5) high++;
      n++;
    }
    expect(low / n).toBeGreaterThan(0.12);
    expect(high / n).toBeGreaterThan(0.12);
  });

  test("moves smoothly: a minute changes an hourly ticker by a few percent at most", () => {
    for (let t = 0; t < DAY_MS; t += MINUTE_MS) {
      const ratio = priceAt(7, OATS, t + MINUTE_MS) / priceAt(7, OATS, t);
      expect(Math.abs(Math.log(ratio))).toBeLessThan(0.12);
    }
  });

  test("another seed or another ticker is another line", () => {
    const at = 5 * HOUR_MS + 1234;
    expect(tickerLean(1, OATS, at)).not.toBe(tickerLean(2, OATS, at));
    expect(tickerLean(1, OATS, at)).not.toBe(tickerLean(1, { ...OATS, id: "rye" }, at));
  });

  test("priceSeries samples both ends", () => {
    const line = priceSeries(3, TIN, 0, HOUR_MS, 5);
    expect(line).toHaveLength(5);
    expect(line[0]).toBe(priceAt(3, TIN, 0));
    expect(line[4]).toBe(priceAt(3, TIN, HOUR_MS));
  });
});

const WORDS = vocab({ currencies: ["cash"], stats: [], rarities: ["common"] } as const);
const wallet = defineCurrencies({ key: "wallet", vocab: WORDS, start: { cash: 1000 } });
type State = { wallet: { cash: Decimal }; flags: { tinOpen: boolean; fee: number } };
const exchange = defineMarket({
  key: "exchange",
  wallet,
  pays: "cash",
  tickers: [OATS, TIN],
  open: (s: State, t) => t.id !== "tin" || s.flags.tinOpen,
  fee: (s) => s.flags.fee,
});

import { feature } from "watchpot/core";

const flags = feature({ key: "flags", initial: () => ({ tinOpen: false, fee: 0 }), reset: "never" });
const game = defineGame({
  id: "exchange",
  save: { key: "exchange.save", version: 1 },
  features: [wallet, flags, exchange],
  vocab: WORDS,
});

describe("market", () => {
  test("a buy is all or nothing, in whole units, and keeps what it cost", () => {
    const { store } = freshStore(game);
    const now = store.getState().gameNow();
    const price = exchange.select.price(store.getState(), "oats", now);
    expect(store.getState().exchange.buy("oats", 1e9).toNumber()).toBe(0);
    expect(store.getState().exchange.buy("tin", 1).toNumber()).toBe(0); // closed
    expect(store.getState().exchange.buy("oats", 10.9).toNumber()).toBe(10);
    const s = store.getState();
    expect(s.wallet.cash.toNumber()).toBeCloseTo(1000 - 10 * price, 6);
    const pos = exchange.select.position(s, "oats", now);
    expect(pos.held.toNumber()).toBe(10);
    expect(pos.average).toBeCloseTo(price, 6);
    expect(pos.profit.toNumber()).toBeCloseTo(0, 6);
    expect(s.exchange.trades).toBe(1);
  });

  test("buyMax spends a share of the balance; a sale takes the basis out in proportion and books the profit", () => {
    const { store, clock } = freshStore(game);
    const bought = store.getState().exchange.buyMax("oats", 0.5);
    const start = clock.now();
    const paid = store.getState().exchange.paid.oats?.toNumber() ?? 0;
    expect(paid).toBeLessThanOrEqual(500);
    expect(paid).toBeGreaterThan(500 - exchange.select.price(store.getState(), "oats", start));
    // Find a later minute with a different price, and sell half there.
    let at = start;
    const first = priceAt(store.getState().exchange.seed, OATS, start);
    while (Math.abs(priceAt(store.getState().exchange.seed, OATS, at) / first - 1) < 0.1) at += MINUTE_MS;
    clock.set(at);
    const then = priceAt(store.getState().exchange.seed, OATS, at);
    const half = bought.div(2).floor();
    expect(store.getState().exchange.sell("oats", half).eq(half)).toBe(true);
    const s = store.getState();
    const basis = (paid * half.toNumber()) / bought.toNumber();
    expect(s.exchange.realised.toNumber()).toBeCloseTo(half.toNumber() * then - basis, 4);
    expect(s.exchange.paid.oats?.toNumber()).toBeCloseTo(paid - basis, 4);
    expect(store.getState().exchange.sellAll("oats").eq(bought.sub(half))).toBe(true);
    expect(store.getState().exchange.held.oats?.toNumber()).toBe(0);
    expect(store.getState().exchange.paid.oats?.toNumber()).toBeCloseTo(0, 6);
  });

  test("the fee is taken on the way in and on the way out", () => {
    const { store } = freshStore(game);
    store.setState((s) => {
      s.flags.fee = 0.1;
    });
    const now = store.getState().gameNow();
    const price = exchange.select.price(store.getState(), "oats", now);
    store.getState().exchange.buy("oats", 10);
    expect(store.getState().wallet.cash.toNumber()).toBeCloseTo(1000 - 11 * price, 6);
    store.getState().exchange.sellAll("oats");
    expect(store.getState().wallet.cash.toNumber()).toBeCloseTo(1000 - 2 * price, 6);
    expect(store.getState().exchange.realised.toNumber()).toBeCloseTo(-2 * price, 6);
  });

  test("a holding pays its yield over a tick and over an absence alike", () => {
    const { store, clock } = freshStore(game);
    store.getState().exchange.buy("oats", 50);
    const cash = store.getState().wallet.cash.toNumber();
    const perSecond = exchange.select.yieldPerSecond(store.getState()).toNumber();
    expect(perSecond).toBeCloseTo(50 * 10 * 0.001, 9);
    clock.advance(1000);
    store.getState().tick(1000, clock.now());
    expect(store.getState().wallet.cash.toNumber()).toBeCloseTo(cash + perSecond, 6);
    clock.advance(HOUR_MS);
    store.getState().catchUp(clock.now());
    expect(store.getState().wallet.cash.toNumber()).toBeCloseTo(cash + perSecond * 3601, 4);
    expect(store.getState().exchange.yielded.toNumber()).toBeCloseTo(perSecond * 3601, 4);
  });

  test("a run reset clears the holdings and draws a new seed", () => {
    const { store } = freshStore(game, { seed: "m" });
    const seed = store.getState().exchange.seed;
    store.getState().exchange.buy("oats", 5);
    store.getState().resetRun({ now: T0 + 5000 });
    expect(store.getState().exchange.held).toEqual({});
    expect(store.getState().exchange.seed).not.toBe(seed);
  });

  test("the auto-player buys low and sells high, and ends a week ahead", () => {
    const world = createSimWorld((now) => simStore(game, now, "trader"), T0);
    const player = autoPlayer(game, { balance: (s, c) => (s as unknown as State).wallet[c as "cash"] });
    let trades = 0;
    for (let i = 0; i < 7 * 24 * 12; i++) {
      world.play(5 * MINUTE_MS);
      const look = player.look(world.store as never);
      trades += look.bought + look.free;
    }
    const s = world.store.getState() as unknown as State & { exchange: { realised: Decimal } };
    expect(trades).toBeGreaterThan(10);
    expect(s.exchange.realised.toNumber()).toBeGreaterThan(0);
    expect(s.wallet.cash.add(exchange.select.worth(s as never, world.gameNow())).toNumber()).toBeGreaterThan(
      1000,
    );
  });
});

describe("market trader", () => {
  const botFlags = feature({
    key: "flags",
    initial: () => ({ tinOpen: false, fee: 0, bot: true }),
    reset: "never",
  });
  type BotState = State & {
    flags: { bot: boolean };
    bot: { held: Record<string, Decimal>; realised: Decimal };
  };
  const bot = defineMarket({
    key: "bot",
    wallet,
    pays: "cash",
    tickers: [OATS],
    trader: { active: (s: BotState) => s.flags.bot, buyBelow: 0.3, sellAbove: 0.7, spend: 0.8 },
  });
  const botGame = defineGame({
    id: "bot",
    save: { key: "bot.save", version: 1 },
    features: [wallet, botFlags, bot],
    vocab: WORDS,
  });

  test("buys under its mark and sells over it by itself, ending a week ahead with no player", () => {
    const { store, clock } = freshStore(botGame, { seed: "bot" });
    let boughtLow = 0;
    let soldHigh = 0;
    let lastTrades = 0;
    for (let i = 0; i < 7 * 24 * 12; i++) {
      clock.advance(5 * MINUTE_MS);
      store.getState().tick(5 * MINUTE_MS, clock.now());
      const s = store.getState() as unknown as BotState & { bot: { trades: number } };
      if (s.bot.trades > lastTrades) {
        const level = bot.select.level(s as never, "oats", store.getState().gameNow());
        if (s.bot.held.oats?.gt(0)) {
          expect(level).toBeLessThan(0.3);
          boughtLow++;
        } else {
          expect(level).toBeGreaterThan(0.7);
          soldHigh++;
        }
        lastTrades = s.bot.trades;
      }
    }
    const s = store.getState() as unknown as BotState;
    expect(boughtLow).toBeGreaterThan(3);
    expect(soldHigh).toBeGreaterThan(3);
    expect(s.bot.realised.toNumber()).toBeGreaterThan(0);
    expect(bot.select.trading(s as never)).toBe(true);
  });

  test("keeps a share of the balance back, and trades nothing while switched off", () => {
    const { store, clock } = freshStore(botGame, { seed: "bot" });
    store.setState((s: BotState) => ({ ...s, flags: { ...s.flags, bot: false } }) as never);
    for (let i = 0; i < 24 * 60; i++) {
      clock.advance(MINUTE_MS);
      store.getState().tick(MINUTE_MS, clock.now());
    }
    const off = store.getState() as unknown as BotState & { bot: { trades: number } };
    expect(off.bot.trades).toBe(0);
    expect(bot.select.trading(off as never)).toBe(false);
    store.setState((s: BotState) => ({ ...s, flags: { ...s.flags, bot: true } }) as never);
    for (
      let i = 0;
      i < 24 * 60 && (store.getState() as unknown as BotState).bot.held.oats === undefined;
      i++
    ) {
      clock.advance(MINUTE_MS);
      store.getState().tick(MINUTE_MS, clock.now());
    }
    const on = store.getState() as unknown as BotState;
    expect(on.bot.held.oats?.toNumber() ?? 0).toBeGreaterThan(0);
    expect(on.wallet.cash.toNumber()).toBeGreaterThan(150);
  });

  test("a spend read from the state is clamped to 0..1, and a zero share buys nothing", () => {
    const share = { v: 0 };
    const fn = defineMarket({
      key: "bot",
      wallet,
      pays: "cash",
      tickers: [OATS],
      trader: { buyBelow: 0.99, sellAbove: 1, spend: () => share.v },
    });
    const fnGame = defineGame({
      id: "fn",
      save: { key: "fn.save", version: 1 },
      features: [wallet, fn],
      vocab: WORDS,
    });
    const run = (v: number) => {
      share.v = v;
      const { store, clock } = freshStore(fnGame, { seed: "fn" });
      const before = (store.getState() as unknown as State).wallet.cash.toNumber();
      for (let i = 0; i < 60; i++) {
        clock.advance(MINUTE_MS);
        store.getState().tick(MINUTE_MS, clock.now());
      }
      const s = store.getState() as unknown as State & { bot: { held: Record<string, Decimal> } };
      return { before, cash: s.wallet.cash.toNumber(), held: s.bot.held.oats?.toNumber() ?? 0 };
    };
    const none = run(0);
    expect(none.held).toBe(0);
    expect(none.cash).toBe(none.before);
    const all = run(5);
    expect(all.held).toBeGreaterThan(0);
    expect(all.cash).toBeGreaterThanOrEqual(0);
  });

  test("with everyMs it looks once an interval, however short the ticks", () => {
    const paced = defineMarket({
      key: "bot",
      wallet,
      pays: "cash",
      tickers: [OATS],
      trader: { everyMs: 10 * MINUTE_MS },
    });
    const pacedGame = defineGame({
      id: "paced",
      save: { key: "paced.save", version: 1 },
      features: [wallet, paced],
      vocab: WORDS,
    });
    const fast = defineMarket({ key: "bot", wallet, pays: "cash", tickers: [OATS], trader: {} });
    const fastGame = defineGame({
      id: "fast",
      save: { key: "fast.save", version: 1 },
      features: [wallet, fast],
      vocab: WORDS,
    });
    const trades = (g: typeof pacedGame | typeof fastGame) => {
      const { store, clock } = freshStore(g, { seed: "pace" });
      for (let i = 0; i < 2 * 24 * 360; i++) {
        clock.advance(10_000);
        store.getState().tick(10_000, clock.now());
      }
      return (store.getState() as unknown as { bot: { trades: number } }).bot.trades;
    };
    const slow = trades(pacedGame);
    expect(slow).toBeGreaterThan(0);
    expect(slow).toBeLessThanOrEqual(2 * 24 * 6 * 2);
    expect(trades(fastGame)).toBeGreaterThanOrEqual(slow);
  });
});

describe("reach", () => {
  test("a callback reads a reached feature with no annotation, and not one that was not reached", () => {
    const door = feature({ key: "door", initial: () => ({ open: true }) });
    const gated = defineMarket({
      key: "gated",
      wallet,
      pays: "cash",
      reach: [door],
      tickers: [OATS],
      open: (s) => s.door.open && s.wallet.cash.gte(0),
      fee: (s) => {
        // @ts-expect-error `lid` was never reached
        s.lid;
        return 0;
      },
    });
    expect(gated.def.tickers).toHaveLength(1);
    expect(gated.needs).toBeUndefined();
  });
});

describe("market draft helpers", () => {
  test("buy, buyMax, sell and sellAll inside a recipe trade as the actions do", () => {
    const { store } = freshStore(game);
    const traded: number[] = [];
    store.setState((d) => {
      traded.push(exchange.draft.buy(d, "oats", 3, T0).toNumber());
      traded.push(exchange.draft.sell(d, "oats", 1, T0).toNumber());
      traded.push(exchange.draft.sellAll(d, "oats", T0).toNumber());
      traded.push(exchange.draft.buyMax(d, "oats", 0.5, T0).toNumber() > 0 ? 1 : 0);
    });
    expect(traded).toEqual([3, 1, 2, 1]);
    expect(store.getState().exchange.trades).toBe(4);
    expect(exchange.def.ticker("oats")?.id).toBe("oats");
  });
});
