import { feature } from "watchpot/core";
import { OFFLINE_BASE } from "../content/economy";
import { gainOf, offlineOf, outputOf, statBus } from "./bus";
import { wallet } from "./wallet";
// @if tree
import { upgrades } from "./tree";
// @end
// @if gacha
import { collection } from "./gacha";
// @end
// @if prestige
import { ascension } from "./prestige";
// @end
// @if achievements
import { wall } from "./achievements";
// @end
// @if visitor
import { boosts } from "./visitor";
// @end

/** The stats as the core reads them: worked out every pass, never saved. */
export interface StatsState {
  output: number;
  offline: number;
  gain: number;
}

/**
 * The stats, under `stats`: each pass's `rates` step reads every feature's contributions (`bus.ts`) at the pass's
 * game time, so a timed bonus counts while it runs. Listed before the core, which reads `output` and `offline`.
 */
export const stats = feature({
  key: "stats",
  reach: [
    wallet,
    // @if tree
    upgrades,
    // @end
    // @if gacha
    collection,
    // @end
    // @if prestige
    ascension,
    // @end
    // @if achievements
    wall,
    // @end
    // @if visitor
    boosts,
    // @end
  ],
  initial: (): StatsState => ({ output: 1, offline: OFFLINE_BASE, gain: 1 }),
  transient: ["output", "offline", "gain"],
  steps: {
    rates: {
      stats: (d, ctx) => {
        const bus = statBus(d, ctx.now);
        d.stats.output = outputOf(bus);
        d.stats.offline = offlineOf(bus);
        d.stats.gain = gainOf(bus);
      },
    },
  },
});
