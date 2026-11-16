import { defineCurrencies } from "watchpot/core";
import { START } from "../content/generators";
import { MAIN, PREMIUM, WORDS } from "../content/words";

/**
 * Every balance, under `wallet`. `earned` totals this run's main currency (what a prestige pays on); it goes back to
 * zero with the main currency at every reset.
 */
export const wallet = defineCurrencies({
  key: "wallet",
  vocab: WORDS,
  start: {
    [MAIN]: START.main,
    [PREMIUM]: START.premium,
  },
  // The premium currency outlives a prestige: it is the slow, account-level one.
  depth: { [PREMIUM]: "never" },
  earnedThisRun: { [MAIN]: "earned" },
});
