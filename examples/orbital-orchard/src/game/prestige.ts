import { type Decimal, type Move, powerGain, prestige, withMoves } from "watchpot/core";
import { GAIN } from "../content/prestige";
import { collection } from "./gacha";
import { gainOf, type StatSources, statBus } from "./stats";
import { upgrades } from "./tree";
import { wallet } from "./wallet";

/** What the layer pays now: the run's earnings on the curve in `content/prestige.ts`, times the gain stat. */
export const prestigeGain = (s: StatSources & { readonly wallet: { readonly earned: Decimal } }) =>
  powerGain(s.wallet.earned, { ...GAIN, mult: gainOf(statBus(s)) });

/**
 * The run's earnings at which a burn pays one orbit more than it would now: the gain curve solved for
 * `floor(gain) + 1`. The orbit screen's bar fills toward it.
 */
export const nextOrbitAt = (s: StatSources & { readonly wallet: { readonly earned: Decimal } }) => {
  const next = prestigeGain(s).toNumber() + 1;
  const mult = GAIN.k * gainOf(statBus(s));
  return GAIN.per * (next / mult) ** (1 / GAIN.exp);
};

/** What a prestige move reads. */
type PrestigeMoveState = StatSources & {
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
    reach: [wallet, upgrades, collection],
    gain: (s) => prestigeGain(s),
  }),
  // The auto-player ascends once a reset would at least double what it holds (and pays at least one).
  (s: PrestigeMoveState): Move<PrestigeMoveState>[] => {
    const gain = prestigeGain(s);
    const worth = gain.gte(1) && gain.gte(s.prestige.currency) ? gain.toNumber() : 0;
    return [{ id: "ascend", value: () => worth, apply: (store) => store.getState().prestige.ascend() }];
  },
);
