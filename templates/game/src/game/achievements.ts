// @feature achievements
import { type Achievement, achievements, type Decimal, type Effect } from "watchpot/core";
import { ACHIEVEMENTS, COLUMNS, type When } from "../content/achievements";

/** What a condition reads: the part of each feature's state the wall can ask about. */
export interface WallReads {
  wallet: { earned: Decimal };
  // @if generators
  generators: { owned: Record<string, number> };
  // @end
  // @if dimensions
  dimensions: { bought: Record<string, number> };
  // @end
  // @if clicker
  clicker: { clicks: number };
  // @end
  // @if prestige
  prestige: { runs: number };
  // @end
  // @if tree
  upgrades: { ranks: Record<string, number> };
  // @end
  // @if gacha
  summon: { opened: Record<string, number> };
  // @end
}

/** Whether the state meets a condition from `content/achievements.ts`. */
export function met(w: When, s: WallReads): boolean {
  if ("own" in w) {
    let owned = 0;
    // @if generators
    owned = Math.max(owned, s.generators.owned[w.own] ?? 0);
    // @end
    // @if dimensions
    owned = Math.max(owned, s.dimensions.bought[w.own] ?? 0);
    // @end
    return owned >= w.count;
  }
  if ("earned" in w) return s.wallet.earned.gte(w.earned);
  // @if clicker
  if ("clicks" in w) return s.clicker.clicks >= w.clicks;
  // @end
  // @if prestige
  if ("runs" in w) return s.prestige.runs >= w.runs;
  // @end
  // @if tree
  if ("nodes" in w) return Object.values(s.upgrades.ranks).filter((r) => r > 0).length >= w.nodes;
  // @end
  // @if gacha
  if ("pulls" in w) return Object.values(s.summon.opened).reduce((a, b) => a + b, 0) >= w.pulls;
  // @end
  return false;
}

/** The wall's list: each content entry, checked by `met`. */
const LIST: readonly Achievement<WallReads, Effect>[] = ACHIEVEMENTS.map((a) => ({
  id: a.id,
  name: a.name,
  line: a.line,
  secret: a.secret,
  when: (s: WallReads) => met(a.when, s),
}));

/**
 * The wall on the engine's `achievements`: rows of `COLUMNS`, each earned once and kept through a prestige, checked
 * after every pass's production. What it gives (output, from the count and the full rows) is read in `stats.ts`;
 * `fresh` is the queue the page toasts.
 */
export const wall = achievements({ key: "achievements", columns: COLUMNS, list: LIST });
