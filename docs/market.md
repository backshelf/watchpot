# Markets

Things with a price that wanders on its own, to buy low and sell high: a stock exchange, a commodity board, a black
market. A ticker's price is a pure function of game time and the market's saved seed (smooth noise in three octaves
around a base, never outside its band), so nothing is simulated: the price after a week away is read, not replayed,
a chart of any stretch costs nothing to draw, and a reload cannot reroll it.

```ts
import { type Decimal, defineGame, HOUR_MS, market } from "watchpot/core";
import { wallet } from "./add-a-currency";
import { TOY } from "./vocab";

type State = { wallet: { gold: Decimal; gems: Decimal } };

export const exchange = market({
  key: "exchange",
  wallet,
  pays: "gold",
  tickers: [
    { id: "oats", base: 10, swing: 0.7, periodMs: HOUR_MS, yield: 0.0005 }, // half to double, about hourly
    { id: "tin", base: 400, swing: 0.3, periodMs: 6 * HOUR_MS },
  ],
  open: (s: State, t) => t.id !== "tin" || s.wallet.gems.gte(5),
  fee: () => 0.01,
});
// store.getState().exchange.buyMax("oats", 0.5) · .sell("oats", 3) · .sellAll("oats")
// exchange.select.price(state, "oats", now) · .level(state, "oats", now) · .position(state, "oats", now)
```

Example: [`examples/market.ts`](examples/market.ts).

- **`TickerDef`**: `id`, `base` (the price it wanders around), `swing` (the price stays within `base × e^±swing`:
  0.7 is roughly half to double), `periodMs` (one slow swing; two quicker wobbles ride on it) and `yield?` (what one
  unit held pays a second, as a share of `base`).
- **The kernel, pure:** `priceAt(seed, ticker, at)`, `tickerLean(seed, ticker, at)` (where it stands in its band,
  -1 to 1), `priceBand(ticker)` (`{ low, high }`) and `priceSeries(seed, ticker, from, to, points)` for a chart.
- **`market({ key, reach?, wallet, pays, tickers, open?, fee?, yieldMult?, away?, player?, trader?, reset? })`** saves `{ seed, held,
  paid, realised, yielded, trades }` under `key`. `fee(state)` is the share of every trade the market keeps (on the
  way in and on the way out), `yieldMult(state)` the game's multiplier on every yield, `open(state, ticker)` which
  tickers trade. The step `<key>.produce.yield` pays the holdings' yield over a tick and over an absence (`away`,
  default all of it). A run reset clears the holdings and draws a new seed unless `reset` says otherwise.
- **Actions**, in whole units, each returning the units traded: `buy(id, units)` (all or nothing), `buyMax(id,
  share = 1)` (what that share of the balance covers), `sell(id, units)` and `sellAll(id)`. A holding keeps what it
  cost (`paid`); a sale takes the basis out in proportion and books the difference in `realised`.
- **`select`** (questions over state): `price`, `level` (0 at the bottom of the band, 1 at the top), `rising`, `series`,
  `position(state, id, now)` → `{ held, worth, paid, average, profit }`, `worth(state, now)` (every holding),
  `yieldPerSecond(state)`, `affordable(state, id, now)`, `fee(state)`, `open(state, id)` and `trading(state)`. **`def`**
  holds `tickers` and `ticker(id)`. **`draft`** helpers, named like the actions, for a recipe or a step: `draft.buy(draft, id,
  units, now?)`, `draft.buyMax(draft, id, share?, now?)`, `draft.sell(draft, id, units, now?)` and
  `draft.sellAll(draft, id, now?)`. `reach` names the features the callbacks read, as on `feature`, so their state is typed
  with no annotation (the wallet is reached already).
- **The auto-player** buys `player.spend` of the balance (default half) while a ticker's level is under
  `player.buyBelow` (0.3), and sells the whole holding once it is over `player.sellAbove` (0.7).
- **The trader** (`trader: { active?, everyMs?, buyBelow, sellAbove, spend }`) works the market by itself in the step
  `<key>.automate.trade`, every tick or once per `everyMs` of game time (a trader on every tick takes every
  wobble and compounds the currency far past a person's pace): it sells a whole holding once its ticker is over `sellAbove`, and buys `spend`
  of the balance into a ticker it holds none of once that one is under `buyBelow` (so a share is always kept back for
  whatever the currency buys). An absence trades once, at its end. `spend` may be a function of the state, read at each buy: a share that falls as the balance grows compounds quickly from little and slowly from a fortune, so a fast trader does not run a geometric price list out in a day. `active(state)` switches it (an upgrade, a
  setting); `exchange.select.trading(state)` says whether it is on, and while it is the auto-player leaves the market alone.
- **Pacing.** A trader's pace is the page's pace: geometric prices turn its compounding into a steady number of buys an
  hour, so measure buys per played hour (a timid trader leaves hours between them; a bold one buys the whole list in
  an afternoon, so size the list to it). A currency that trading multiplies grows geometrically with every swing: spend it on things whose
  prices climb geometrically too (a `CostCurve`), so a day of good trades is a few more levels, not a broken game.
