// @feature prestige
import { type Decimal, powerGain, prestige } from "watchpot/core";
import { GAIN } from "../content/prestige";
import { stats } from "./stats";
import { wallet } from "./wallet";

/** What the prestige gain is read from: the run's earnings and the gain stat. */
interface GainReads {
  readonly wallet: { readonly earned: Decimal };
  readonly stats: { readonly gain: Decimal };
}

/** What the layer pays now: the run's earnings on the curve in `content/prestige.ts`, times the gain stat. */
export const prestigeGain = (s: GainReads) => powerGain(s.wallet.earned, { ...GAIN, mult: s.stats.gain });

/**
 * The prestige layer on the engine's `prestige`: `ascend()` pays the gain into `prestige.currency` and resets the run
 * (every feature by its own rule: the wallet, the core, the tree and the clicker's run counts go; the collection,
 * the premium and the achievements stay). Each unit held raises output for good. Its slice also says when a run is
 * past its best (`s.prestige.pastPeak`), for a light on the page.
 */
export const ascension = prestige({
  key: "prestige",
  action: "ascend",
  reach: [wallet, stats],
  gain: (s) => prestigeGain(s),
  // The auto-player ascends once a reset would at least double what it holds (and pays at least one).
  worth: (s) => {
    const gain = prestigeGain(s);
    return gain.gte(1) && gain.gte(s.prestige.currency) ? gain.toNumber() : 0;
  },
});
