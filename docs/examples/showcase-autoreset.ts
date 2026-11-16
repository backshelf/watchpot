import {
  type Decimal,
  defineAutobuyers,
  defineGame,
  defineGenerators,
  definePrestige,
  powerGain,
} from "watchpot/core";
import { wallet } from "./add-a-currency";
import { TOY } from "./vocab";

const stalls = defineGenerators({
  key: "stalls",
  wallet,
  list: [{ id: "stall", cost: { base: 10, growth: 1.15 }, pays: "gold", makes: "gold", rate: 1, free: 1 }],
});

/** What a reset would pay now. */
const gainOf = (gold: Decimal) => powerGain(gold, { k: 1, exp: 0.5, per: 100 });

/** The layer keeps this run's best reset pace itself, and says when the run is past it (`pastPeak`). */
export const rebirth = definePrestige({
  key: "rebirth",
  action: "rebirth",
  reach: [wallet],
  gain: (s) => gainOf(s.wallet.gold),
  pace: { past: 0.8 },
});

type State = { rebirth: { currency: Decimal; pastPeak: boolean } };

export const auto = defineAutobuyers({
  key: "auto",
  list: [
    { id: "stall", unlocked: () => true, intervalMs: () => 1000, run: (d) => stalls.draft.buy(d, "stall") },
    {
      // An autobuyer that buys nothing: it presses the reset for the player once the run is past its best.
      id: "rebirth",
      unlocked: (s: State) => s.rebirth.currency.gte(10),
      intervalMs: () => 1000,
      priority: -1, // after every buy in the same tick, so the reset sees what they bought
      run: (d: State, ctx) => (d.rebirth.pastPeak && rebirth.draft.rebirth(d, ctx) ? 1 : 0),
    },
  ],
});

export const game = defineGame({
  id: "auto-rebirth",
  save: { key: "auto-rebirth.save", version: 1 },
  features: [wallet, stalls, rebirth, auto],
  vocab: TOY,
});
