# Dimensions

A chain of producers where each tier makes the tier below it and the lowest makes a currency. Buy the first tier and
it earns the currency; buy the second and it earns more of the first; and so on up, so the currency grows as a
polynomial of the chain's height. Every `set.size` bought of a tier multiplies that tier by `set.mult` (ten bought
doubles it), and the layers a game stacks above (a boost that opens the next tier, a tick speed, a sacrifice) are
multipliers and resets it hands the chain through `mult`, `speed` and `open`.

The complete example is [`examples/dimensions.ts`](examples/dimensions.ts): four tiers bought ten at a price, and a
`prestige` layer above that opens the next tier and doubles them all.

<!-- example-code: dimensions.ts -->

```ts
import {
  D,
  type Decimal,
  defineCurrencies,
  defineDimensions,
  defineGame,
  definePrestige,
  HOUR_MS,
} from "watchpot/core";
import { TOY } from "./vocab";

/** What the chain's callbacks read: the wallet, and the boosts the layer above has paid. */
type State = { wallet: { gold: Decimal }; boost: { runs: number } };

export const wallet = defineCurrencies({ key: "wallet", vocab: TOY, start: { gold: 10 } });

/**
 * Four tiers: the first makes gold, each other makes the tier below it. Ten of a tier are bought at one price, then
 * the price steps; every ten bought double that tier.
 */
export const chain = defineDimensions({
  key: "chain",
  wallet,
  makes: "gold",
  set: { size: 10, mult: 2 },
  tiers: [
    { id: "first", cost: { base: 10, growth: 1e3, every: 10 } },
    { id: "second", cost: { base: 100, growth: 1e4, every: 10 } },
    { id: "third", cost: { base: 1e4, growth: 1e5, every: 10 } },
    { id: "fourth", cost: { base: 1e6, growth: 1e6, every: 10 } },
  ],
  // A boost doubles every tier and opens the next one: tiers past the second wait for one.
  mult: (s: State) => 2 ** s.boost.runs,
  open: (s: State, _tier, index) => index < 2 + s.boost.runs,
  away: () => ({ rate: 1, capMs: 8 * HOUR_MS }),
});
// store.getState().chain.buy("first"), .buySet("first"), .buyMax("second"), .maxAll()
// chain.select.perSecond(state, "first"), .price(state, "second", 10), .untilSet(state, "first")

/** The reset above the chain: it needs twenty of the highest open tier, pays one boost and starts the chain over. */
export const boost = definePrestige({
  key: "boost",
  reach: [chain],
  gain: (s) => {
    const top = chain.def.tiers[Math.min(1 + s.boost.runs, chain.def.tiers.length - 1)];
    return D(s.chain.amount[top?.id ?? ""]?.gte(20) ? 1 : 0);
  },
});

export const game = defineGame({
  id: "chains",
  save: { key: "chains.save", version: 1 },
  features: [wallet, chain, boost],
  vocab: TOY,
});
```

- **Held and bought are two numbers.** `amount` is what a tier holds: what was bought plus what the tier above made,
  and it is what produces. `bought` counts purchases only: the price and the set bonus read it. A tier's `gives`
  makes one purchase add more than one to what is held.
- **Production is exact.** `advanceChain(amounts, rates, seconds)` is the kernel: with the rates fixed over the
  stretch, each amount is a polynomial in time and the currency its integral, so one step of a week and a week of
  50 ms ticks land on the same numbers. The feature's step is `<key>.produce.chain`, for a tick and for an absence
  (`away(state)` gives the share of the time away that counts and its cap; default all of it).
- **Prices** are a `CostCurve` (`src/core/cost.ts`): geometric, with `every` to hold one price for a set, or the
  game's own function of how many are bought. `buy(id, count)` buys exactly that many or nothing, `buySet(id)` what
  completes the current set, `buyMax(id, limit?)` what the balance covers, `maxAll()` every open tier, highest first.
  A tier may be priced in another currency (`pays`).
- **What opens a tier** is `open(state, tier, index)`; without it the lowest is always open and each other opens once
  the tier below was bought.
- **The layers above are the game's.** A reset that starts the chain over and multiplies it (a boost, a galaxy) is a
  `prestige` feature whose count `mult` or `speed` reads; a sacrifice is an action that zeroes the lower amounts and
  raises a multiplier. A run reset starts the chain over unless `reset` says otherwise.
- **`select`** answers questions over state: `open`, `price`, `affordable`, `untilSet`, `setBonus`, `rate` and
  `perSecond` (`chain.select.price(state, id, count?)`). **`def`** holds what the chain was given: `tiers`, `set`,
  `tier(id)` and `indexOf(id)`. `reach` names the features `mult`, `speed`, `open` and `away` read, as on `feature`, so
  their state is typed with no annotation (the wallet is reached already).
- **`draft`** helpers for a recipe or a step (an autobuyer's `run`), named like the actions: `chain.draft.buy(draft,
  id, count?)`, `chain.draft.buySet(draft, id)`, `chain.draft.buyMax(draft, id, limit?)` and `chain.draft.maxAll(draft)`,
  each returning how many it bought, and `chain.draft.produce(draft, seconds)`, which advances the chain at the rates
  the draft holds. A game whose autobuyers
  should keep working while the tab is closed gives the chain `away: () => ({ rate: 0 })` and replays the absence in
  its own catch-up step (`offlineSteps`): produce a stretch, buy, produce the next.
- **The auto-player** buys through the chain's `moves`, one per open tier, each worth what one more of that tier adds
  to the currency's rate after `horizonS` seconds (default 60).

## Cost curves

`costAt(curve, bought)`, `costOfMany(curve, bought, count)` and `maxAffordable(curve, bought, balance, limit?)` answer
"what does the next one cost", "what do the next N cost" and "how many can I afford" for any curve, in closed form for
a geometric one (`{ base, growth, every?, round? }`) however large the numbers, and by walking a function curve
(`WALK_LIMIT` at most). Every price is a whole number, rounded up by default (`round: "floor"`, `"nearest"` or `"none"` change that;
`"none"` keeps the fractions), and the sums stay exact: a bulk price is the single prices added, the small ones one
by one, the rest in closed form. `stepsOf(value, every)` and `untilStep(value, every)` count whole sets and what completes the current one;
`reached(thresholds, value)` and `nextThreshold(thresholds, value)` read a ladder of `{ at, gives }` marks on a count
(a rate doubling at 25, 50 and 100 owned).
