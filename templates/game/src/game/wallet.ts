import { currencies } from "watchpot/core";
import { START } from "../content/economy";
import { MAIN, WORDS } from "../content/words";
// @if gacha
import { PREMIUM } from "../content/words";
// @end

/**
 * Every balance, under `wallet`. `earned` totals this run's main currency (what a prestige pays on); it resets with
 * the run, as the balances do.
 */
export const wallet = currencies({
  key: "wallet",
  vocab: WORDS,
  start: {
    [MAIN]: START.main,
    // @if gacha
    [PREMIUM]: START.premium,
    // @end
  },
  earned: { [MAIN]: "earned" },
  // Pins the extra fields to none: without it the `reset` below would be read as declaring some.
  extra: () => ({}),
  // @if gacha
  // The premium currency outlives a prestige: it is the slow, account-level one.
  reset: { keep: [PREMIUM] },
  // @end
});
