// @feature generators
import { type GeneratorDef as Generator, generators } from "watchpot/core";
import { OFFLINE_CAP_MS } from "../content/economy";
import { GENERATORS, type GeneratorDef } from "../content/generators";
import { type Currency, MAIN } from "../content/words";
import type { Stats } from "./stats";
import { wallet } from "./wallet";

/** What the list's callbacks read: the stats, current as of the pass. */
interface Reads {
  stats: Stats;
}

/**
 * The generators on the engine's `generators`: each makes the main currency a second and is bought with it, the
 * first one owned from the start of every run. `output` multiplies them all; away, they pay the `offline` share for
 * at most `OFFLINE_CAP_MS`. Buy with `buy(id, count)` and `buyMax(id)`; read prices and rates off `producers.select`.
 */
export const producers = generators({
  key: "generators",
  wallet,
  list: GENERATORS.map(
    (g, i): Generator<Currency> & GeneratorDef => ({ ...g, pays: MAIN, makes: MAIN, free: i === 0 ? 1 : 0 }),
  ),
  mult: (s: Reads) => s.stats.output,
  away: (s: Reads) => ({ rate: s.stats.offline.toNumber(), capMs: OFFLINE_CAP_MS }),
});
