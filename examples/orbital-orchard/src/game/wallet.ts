import { currencies } from "watchpot/core";
import { START } from "../content/generators";
import { MAIN, PREMIUM, WORDS } from "../content/words";

/**
 * Every balance, under `wallet`. `earned` totals this run's main currency (what a prestige pays on); it resets with
 * the run, as the balances do.
 */
export const wallet = currencies({
  key: "wallet",
  vocab: WORDS,
  start: {
    [MAIN]: START.main,
    [PREMIUM]: START.premium,
  },
  earned: { [MAIN]: "earned" },
  // Pins the extra fields to none: without it the `reset` below would be read as declaring some.
  extra: () => ({}),
  // The premium currency outlives a prestige: it is the slow, account-level one.
  reset: { keep: [PREMIUM] },
});
