import {
  busOf,
  type Contribution,
  type Decimal,
  type Ranks,
  rankContributions,
  type StatBus,
  statValue,
} from "watchpot/core";
import { ITEMS } from "../content/gacha";
import { OFFLINE_BASE } from "../content/generators";
import { BONUS_PER_UNIT } from "../content/prestige";
import { NODES } from "../content/tree";

/**
 * The stats: `output` (a multiplier on every generator), `offline` (the share paid while away) and `gain` (a
 * multiplier on what a prestige pays). Every feature that raises one adds contributions here; nothing else reads the
 * content's effects.
 */

/** What the stats are read from: each feature's part of the state, present when the game has that feature. */
export interface StatSources {
  /** Every caller holds the wallet; it keeps this type from being all-optional (a weak type). */
  readonly wallet: unknown;
  readonly upgrades?: { readonly ranks: Ranks };
  readonly collection?: { readonly owned: Readonly<Record<string, number>> };
  readonly prestige?: { readonly currency: Decimal };
}

/** Every contribution the game's features make to the stats, as one bus. */
export function statBus(src: StatSources): StatBus {
  const all: Contribution[] = [];
  if (src.upgrades) all.push(...rankContributions("upgrades", NODES, src.upgrades.ranks));
  if (src.collection)
    for (const item of ITEMS)
      for (let i = 0; i < (src.collection.owned[item.id] ?? 0); i++)
        all.push({ source: `collection:${item.id}`, effect: item.effect });
  if (src.prestige)
    all.push({
      source: "prestige",
      effect: { stat: "output", mult: 1 + BONUS_PER_UNIT * src.prestige.currency.toNumber() },
    });
  return busOf(all);
}

/** The production multiplier (1 with nothing bought). */
export const outputOf = (bus: StatBus) => statValue(bus, "output", 1);
/** The share of production paid while away, never above all of it. */
export const offlineOf = (bus: StatBus) => statValue(bus, "offline", OFFLINE_BASE, { hardcap: 1 });
/** The prestige gain multiplier. */
export const gainOf = (bus: StatBus) => statValue(bus, "gain", 1);
