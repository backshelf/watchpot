// @feature dimensions
import { dimensions } from "watchpot/core";
import { SET, TIERS } from "../content/dimensions";
import { OFFLINE_CAP_MS } from "../content/economy";
import { MAIN } from "../content/words";
import type { StatsState } from "./stats";
import { wallet } from "./wallet";

/** What the chain's callbacks read: the stats, worked out earlier in the same pass. */
interface Reads {
  stats: StatsState;
}

/**
 * The chain on the engine's `dimensions`: the lowest tier makes the main currency, each other tier makes the one
 * below it, every ten bought of a tier doubles it, and each opens once the tier below was bought. `output`
 * multiplies the lowest tier (an income multiplier, as with generators); away, the chain runs at the `offline` share
 * for at most `OFFLINE_CAP_MS`. Buy with `buy`, `buySet`, `buyMax` and `maxAll`; read prices and rates off
 * `chain.chain`.
 */
export const chain = dimensions({
  key: "dimensions",
  wallet,
  makes: MAIN,
  set: SET,
  tiers: TIERS,
  mult: (s: Reads, _tier, index) => (index === 0 ? s.stats.output : 1),
  away: (s: Reads) => ({ rate: s.stats.offline, capMs: OFFLINE_CAP_MS }),
});
