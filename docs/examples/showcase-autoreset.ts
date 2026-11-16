import {
  autobuyers,
  type Decimal,
  defineGame,
  feature,
  generators,
  powerGain,
  prestige,
  resetPace,
} from "watchpot/core";
import { wallet } from "./add-a-currency";
import { TOY } from "./vocab";

const stalls = generators({
  key: "stalls",
  wallet,
  list: [{ id: "stall", cost: { base: 10, growth: 1.15 }, pays: "gold", makes: "gold", rate: 1, free: 1 }],
});

/** What a reset would pay now. */
const gainOf = (gold: Decimal) => powerGain(gold, { k: 1, exp: 0.5, per: 100 });

export const rebirth = prestige({
  key: "rebirth",
  action: "rebirth",
  reach: [wallet],
  gain: (s) => gainOf(s.wallet.gold),
});

/** When this run began and the best pace it has reached: a fresh slice every run, since it resets with it. */
export const pace = feature({
  key: "pace",
  initial: (ctx) => ({ since: ctx.now, peak: 0 }),
});

type State = {
  wallet: { gold: Decimal };
  rebirth: { currency: Decimal };
  pace: { since: number; peak: number };
};

export const auto = autobuyers({
  key: "auto",
  list: [
    { id: "stall", unlocked: () => true, intervalMs: () => 1000, run: (d) => stalls.buy(d, "stall") },
    {
      // An autobuyer that buys nothing: it presses the reset for the player once the run is past its best.
      id: "rebirth",
      unlocked: (s: State) => s.rebirth.currency.gte(10),
      intervalMs: () => 1000,
      priority: -1, // after every buy in the same tick, so the reset sees what they bought
      run: (d, ctx) => {
        const seconds = (ctx.now - d.pace.since) / 1000;
        const now = resetPace(gainOf(d.wallet.gold), d.rebirth.currency, seconds);
        if (now > d.pace.peak) d.pace.peak = now;
        else if (now < d.pace.peak * 0.8 && rebirth.resetDraft(d, ctx)) return 1;
        return 0;
      },
    },
  ],
});

export const game = defineGame({
  id: "auto-rebirth",
  save: { key: "auto-rebirth.save", version: 1 },
  features: [wallet, stalls, rebirth, pace, auto],
  vocab: TOY,
});
