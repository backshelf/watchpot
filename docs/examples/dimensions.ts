import { currencies, D, type Decimal, defineGame, dimensions, HOUR_MS, prestige } from "watchpot/core";
import { TOY } from "./vocab";

/** What the chain's callbacks read: the wallet, and the boosts the layer above has paid. */
type State = { wallet: { gold: Decimal }; boost: { runs: number } };

export const wallet = currencies({ key: "wallet", vocab: TOY, start: { gold: 10 } });

/**
 * Four tiers: the first makes gold, each other makes the tier below it. Ten of a tier are bought at one price, then
 * the price steps; every ten bought double that tier.
 */
export const chain = dimensions({
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

/** The reset above the chain: it needs twenty of the highest open tier, pays one boost and starts the chain over. */
export const boost = prestige({
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
