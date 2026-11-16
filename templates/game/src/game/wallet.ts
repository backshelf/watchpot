import { defineCurrencies } from "watchpot/core";
import { START } from "../content/economy";
import { MAIN, WORDS } from "../content/words";
// @if gacha
import { PREMIUM } from "../content/words";
// @end

/**
 * Every balance, under `wallet`. `earned` totals this run's main currency (what a prestige pays on); it goes back to
 * zero with the main currency at every reset.
 */
export const wallet = defineCurrencies({
  key: "wallet",
  vocab: WORDS,
  start: {
    [MAIN]: START.main,
    // @if gacha
    [PREMIUM]: START.premium,
    // @end
  },
  // @if gacha
  // The premium currency outlives a prestige: it is the slow, account-level one.
  depth: { [PREMIUM]: "never" },
  // @end
  earnedThisRun: { [MAIN]: "earned" },
});
