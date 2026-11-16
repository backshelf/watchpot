// @feature clicker
import { defineClicker, clickShare } from "watchpot/core";
import { BASE, COMBO, CRIT, MAX_PER_SECOND, SHARE } from "../content/clicker";
import { MAIN } from "../content/words";
import { type IncomeSources, incomeOf } from "./income";
import { wallet } from "./wallet";

/**
 * The thing pressed, on the engine's `clicker`: a press pays `BASE` plus a share of the income a second, may crit
 * (rolled on its own saved stream) and rides a combo while presses land close together. `click()` returns what it
 * paid, or null past the rate cap. Lifetime totals survive a prestige; the run's counts do not.
 */
export const press = defineClicker({
  key: "clicker",
  wallet,
  currency: MAIN,
  power: (s: IncomeSources) => clickShare(BASE, incomeOf(s), SHARE),
  crit: () => CRIT,
  combo: COMBO,
  maxPerSecond: MAX_PER_SECOND,
});
