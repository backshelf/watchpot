import { type Decimal, type Move, powerGain, prestige, withMoves } from "watchpot/core";
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
 * The run's earnings at which a burn pays one orbit more than it would now: the gain curve solved for
 * `floor(gain) + 1`. The orbit screen's bar fills toward it.
 */
export const nextOrbitAt = (s: GainReads) => {
  const next = prestigeGain(s).toNumber() + 1;
  const mult = GAIN.k * s.stats.gain.toNumber();
  return GAIN.per * (next / mult) ** (1 / GAIN.exp);
};

/** What a prestige move reads. */
type PrestigeMoveState = GainReads & {
  wallet: { earned: Decimal };
  prestige: { currency: Decimal; ascend(): boolean };
};

/**
 * The prestige layer: `ascend()` pays the gain into `prestige.currency` and resets the run (the wallet, the
 * generators and the upgrade tree; the collection and the premium stay). Each unit held raises output for good.
 */
export const ascension = withMoves(
  prestige({
    key: "prestige",
    action: "ascend",
    reach: [wallet, stats],
    gain: (s) => prestigeGain(s),
  }),
  // The auto-player ascends once a reset would at least double what it holds (and pays at least one).
  (s: PrestigeMoveState): Move<PrestigeMoveState>[] => {
    const gain = prestigeGain(s);
    const worth = gain.gte(1) && gain.gte(s.prestige.currency) ? gain.toNumber() : 0;
    return [{ id: "ascend", worth: () => worth, apply: (store) => store.getState().prestige.ascend() }];
  },
);
