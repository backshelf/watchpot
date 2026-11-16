import { busOf, type Contribution, type StatBus, statValue } from "watchpot/core";
import { OFFLINE_BASE } from "../content/economy";
// @if tree
import { type Ranks, rankContributions } from "watchpot/core";
import { NODES } from "../content/tree";
// @end
// @if gacha
import { ITEMS } from "../content/gacha";
// @end
// @if prestige
import type { Decimal } from "watchpot/core";
import { BONUS_PER_UNIT } from "../content/prestige";
// @end
// @if achievements
import { POWER } from "../content/achievements";
import { wall } from "./achievements";
// @end
// @if visitor
import type { BuffsState } from "watchpot/core";
import { boosts } from "./visitor";
// @end

/**
 * The stats: `output` (a multiplier on the core's income), `offline` (the share paid while away) and `gain` (a
 * multiplier on what a prestige pays). Every feature that raises one adds its contributions here; nothing else reads
 * the content's effects. The `stats` feature (`stats.ts`) works them out each pass for the core to read.
 */

/** What the stats are read from: each feature's part of the state. */
export interface StatSources {
  /** Every caller holds the wallet; it keeps this type from being all-optional (a weak type). */
  readonly wallet: unknown;
  // @if tree
  readonly upgrades?: { readonly ranks: Ranks };
  // @end
  // @if gacha
  readonly collection?: { readonly owned: Readonly<Record<string, number>> };
  // @end
  // @if prestige
  readonly prestige?: { readonly currency: Decimal };
  // @end
  // @if achievements
  readonly achievements?: { readonly earned: Readonly<Record<string, number>> };
  // @end
  // @if visitor
  readonly boosts?: BuffsState;
  // @end
}

/** Every contribution the game's features make to the stats at game time `now`, as one bus. */
// @if !visitor
// biome-ignore lint/correctness/noUnusedFunctionParameters: a timed bonus (a buff) reads `now`; this game has none yet
// @end
export function statBus(src: StatSources, now: number): StatBus {
  const all: Contribution[] = [];
  // @if tree
  if (src.upgrades) all.push(...rankContributions("upgrades", NODES, src.upgrades.ranks));
  // @end
  // @if gacha
  if (src.collection)
    for (const item of ITEMS)
      for (let i = 0; i < (src.collection.owned[item.id] ?? 0); i++)
        all.push({ source: `collection:${item.id}`, effect: item.effect });
  // @end
  // @if prestige
  if (src.prestige)
    all.push({
      source: "prestige",
      effect: { stat: "output", mult: 1 + BONUS_PER_UNIT * src.prestige.currency.toNumber() },
    });
  // @end
  // @if achievements
  if (src.achievements)
    all.push({
      source: "achievements",
      effect: { stat: "output", mult: wall.board.power(src.achievements.earned, POWER).toNumber() },
    });
  // @end
  // @if visitor
  if (src.boosts) all.push(...boosts.contributions(src.boosts, now));
  // @end
  return busOf(all);
}

/** The income multiplier (1 with nothing bought). */
export const outputOf = (bus: StatBus) => statValue(bus, "output", 1);
/** The share of income paid while away, never above all of it. */
export const offlineOf = (bus: StatBus) => statValue(bus, "offline", OFFLINE_BASE, { hardcap: 1 });
/** The prestige gain multiplier. */
export const gainOf = (bus: StatBus) => statValue(bus, "gain", 1);
