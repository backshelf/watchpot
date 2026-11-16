// @feature prestige
import { type Decimal, type Move, powerGain, prestige, withMoves } from "watchpot/core";
import { GAIN } from "../content/prestige";
import { gainOf, type StatSources, statBus } from "./bus";
import { wallet } from "./wallet";
// @if tree
import { upgrades } from "./tree";
// @end
// @if gacha
import { collection } from "./gacha";
// @end

/** What the layer pays now: the run's earnings on the curve in `content/prestige.ts`, times the gain stat. */
export const prestigeGain = (s: StatSources & { readonly wallet: { readonly earned: Decimal } }) =>
  powerGain(s.wallet.earned, { ...GAIN, mult: gainOf(statBus(s, 0)) });

/** What a prestige move reads. */
type PrestigeMoveState = StatSources & {
  wallet: { earned: Decimal };
  prestige: { currency: Decimal; ascend(): boolean };
};

/**
 * The prestige layer on the engine's `prestige`: `ascend()` pays the gain into `prestige.currency` and resets the run
 * (every feature by its own rule: the wallet, the core, the tree and the clicker's run counts go; the collection,
 * the premium and the achievements stay). Each unit held raises output for good.
 */
export const ascension = withMoves(
  prestige({
    key: "prestige",
    action: "ascend",
    reach: [
      wallet,
      // @if tree
      upgrades,
      // @end
      // @if gacha
      collection,
      // @end
    ],
    gain: (s) => prestigeGain(s),
  }),
  // The auto-player ascends once a reset would at least double what it holds (and pays at least one).
  (s: PrestigeMoveState): Move<PrestigeMoveState>[] => {
    const gain = prestigeGain(s);
    const worth = gain.gte(1) && gain.gte(s.prestige.currency) ? gain.toNumber() : 0;
    return [{ id: "ascend", value: () => worth, apply: (store) => store.getState().prestige.ascend() }];
  },
);
