import { defineGame, HOUR_MS, MINUTE_MS, market } from "watchpot/core";
import { wallet } from "./add-a-currency";
import { TOY } from "./vocab";

/** Two tickers priced in gold: a quick cheap one that pays a dividend, and a slow dear one that opens later. */
export const exchange = market({
  key: "exchange",
  wallet,
  pays: "gold",
  tickers: [
    { id: "oats", base: 10, swing: 0.7, periodMs: HOUR_MS, yield: 0.0005 }, // half to double, about hourly
    { id: "tin", base: 400, swing: 0.3, periodMs: 6 * HOUR_MS },
  ],
  open: (s, t) => t.id !== "tin" || s.wallet.gems.gte(5),
  fee: () => 0.01, // the market keeps a hundredth of every trade
});

export const game = defineGame({
  id: "exchange",
  save: { key: "exchange.save", version: 1 },
  features: [wallet, exchange],
  vocab: TOY,
});
// store.getState().exchange.buyMax("oats", 0.5) · .sell("oats", 3) · .sellAll("oats")
// exchange.select.price(state, "oats", now) · .level(state, "oats", now) · .position(state, "oats", now)

/** The last hour of a ticker as a chart's line: sixty prices, read, not recorded. */
export const lastHour = (s: { exchange: { seed: number } }, now: number) =>
  exchange.select.series(s as never, "oats", now - 60 * MINUTE_MS, now, 60);
