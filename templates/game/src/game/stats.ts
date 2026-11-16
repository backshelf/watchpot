import { type Decimal, stats as statsFeature } from "watchpot/core";
import { OFFLINE_BASE } from "../content/economy";
import { WORDS } from "../content/words";
// @if tree
import { rankContributions } from "watchpot/core";
import { NODES } from "../content/tree";
import { upgrades } from "./tree";
// @end
// @if gacha
import { ITEMS } from "../content/gacha";
import { collection } from "./gacha";
// @end
// @if prestige
import { reach } from "watchpot/core";
import { BONUS_PER_UNIT } from "../content/prestige";
// @end
// @if achievements
import { POWER } from "../content/achievements";
import { wall } from "./achievements";
// @end
// @if visitor
import { boosts } from "./visitor";
// @end

/** The stats as a reader sees them: each a Decimal under its id (`s.stats.output`). */
export type Stats = { readonly [P in "output" | "offline" | "gain"]: Decimal };

/**
 * The stats, under `stats`: `output` (a multiplier on the core's income), `offline` (the share paid while away, never
 * above all of it) and `gain` (a multiplier on what a prestige pays). Each is worked out from the state whenever
 * something it reads changes, and never saved. Every feature that raises one feeds it here, and nothing else reads
 * the content's effects: a feature's own list of what it gives (a tree's ranks, a collection's copies, the running
 * buffs) as `contributions`, a number read off the state as a source. `stats.select.explain(state, "output")` is
 * the breakdown behind a number.
 */
export const stats = statsFeature({
  key: "stats",
  vocab: WORDS,
  reach: () => [
    // @if tree
    upgrades,
    // @end
    // @if gacha
    collection,
    // @end
    // @if achievements
    wall,
    // @end
    // @if visitor
    boosts,
    // @end
    // @if prestige
    // The layer reads `gain`, so it is reached by its state's type.
    reach<{ prestige: { currency: Decimal } }>(),
    // @end
  ],
  stats: {
    output: { base: 1 },
    offline: { base: OFFLINE_BASE, hardcap: 1 },
    gain: { base: 1 },
  },
  sources: [
    // @if prestige
    {
      label: "prestige",
      owner: "prestige",
      effects: [{ stat: "output", mul: (q) => 1 + BONUS_PER_UNIT * q.prestige.currency.toNumber() }],
    },
    // @end
    // @if achievements
    {
      label: "achievements",
      owner: "achievements",
      effects: [{ stat: "output", mul: (q) => wall.board.power(q.achievements.earned, POWER) }],
    },
    // @end
  ],
  // @if tree|gacha|visitor
  contributions: (s) => [
    // @if tree
    ...rankContributions("upgrades", NODES, s.upgrades.ranks),
    // @end
    // @if gacha
    ...ITEMS.flatMap((item) =>
      Array.from({ length: s.collection.owned[item.id] ?? 0 }, () => ({
        source: `collection:${item.id}`,
        effect: item.effect,
      })),
    ),
    // @end
    // @if visitor
    // Every buff still listed is running: the buffs' own step ends one whose time is up at the start of each pass.
    ...boosts.contributions(s.boosts, Number.NEGATIVE_INFINITY),
    // @end
  ],
  // @end
});
