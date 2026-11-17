// The heavy bench's content: a synthetic game shaped like a long, content-heavy idle game. Every row is generated in a
// loop from the scale constants below; tune those (and the costs and rates in the loops), not the engine.
import { type CurrencyOf, type Effect, type GraphNode, vocab } from "watchpot/core";

/** Tiers of generators: tier 0 makes the main currency, each higher tier makes the generators of the tier below. */
export const TIERS = 8;
/** Generators in each tier. Generator `t<tier>g<n>` is the n-th of its tier. */
export const PER_TIER = 5;
/** Upgrades in the tree. Each multiplies one generator's output, or (every fifth) one whole tier's. */
export const UPGRADES = 80;

export const SLUG = "heavy-bench";
/** The currency every generator makes and every upgrade costs. */
export const MAIN = "coins";
/** Each generator owned multiplies its price by this. */
export const COST_GROWTH = 1.15;
/** What a new profile starts with. */
export const START = 15;
/** Away, generators make this share of their rate, for at most `OFFLINE_CAP_MS`. */
export const OFFLINE_BASE = 0.5;
export const OFFLINE_CAP_MS = 8 * 3_600_000;

export interface GeneratorDef {
  id: string;
  name: string;
  tier: number;
  /** Its place in its tier; a generator makes the one with the same place in the tier below. */
  index: number;
  /** The first one's price; each one owned multiplies it by `COST_GROWTH`. */
  cost: number;
  /**
   * What one makes a second, before the stats: coins for tier 0, units of the tier below for the rest (each of those
   * then makes its own coins).
   */
  rate: number;
}

/** Cheapest first: tier by tier, then by place in the tier. */
export const GENERATORS: readonly GeneratorDef[] = Array.from({ length: TIERS * PER_TIER }, (_, i) => {
  const tier = Math.floor(i / PER_TIER);
  const index = i % PER_TIER;
  return {
    id: `t${tier}g${index}`,
    name: `Tier ${tier} unit ${index + 1}`,
    tier,
    index,
    cost: Math.round(START * 8 ** tier * 2 ** index),
    rate: tier === 0 ? 1 + 0.25 * index : 0.005 + 0.005 * index,
  };
});

/** The stat a generator's output is raised through (one per generator). */
export const genStat = (id: string): string => `g-${id}`;
/** The stat a whole tier's output is raised through. */
export const tierStat = (tier: number): string => `tier-${tier}`;

/** Every stat the upgrades raise: a generator's or a tier's output, each a multiplier from 1. */
export const STAT_IDS: readonly string[] = [
  ...GENERATORS.map((g) => genStat(g.id)),
  ...Array.from({ length: TIERS }, (_, t) => tierStat(t)),
];

/** The game's words: its currency, the stats its upgrades raise, its rarity ladder (lowest first). */
export const WORDS = vocab({
  currencies: [MAIN],
  stats: STAT_IDS,
  rarities: ["common", "rare", "epic"],
} as const);

export type Currency = CurrencyOf<typeof WORDS>;

/** A node of the upgrade tree, with its effect on a stat. */
export type UpgradeNode = GraphNode<Effect<string>, Currency>;

/** Each upgrade multiplies one stat by `UPGRADE_MUL` a rank, up to ten ranks; a tier upgrade every fifth one. */
export const UPGRADE_MUL = 1.2;

export const NODES: readonly UpgradeNode[] = Array.from({ length: UPGRADES }, (_, i) => {
  const onTier = i % 5 === 4;
  const tier = Math.floor(i / 5) % TIERS;
  const gen = GENERATORS[(i * 7) % GENERATORS.length];
  const stat = onTier ? tierStat(tier) : genStat(gen?.id ?? "");
  return {
    id: `up-${i}`,
    name: `Upgrade ${i + 1}`,
    line: `Raises ${stat} by a fifth.`,
    cost: [{ currency: MAIN, amount: Math.round(100 * 3 ** Math.floor(i / 10)) }],
    costGrowth: 2.5,
    maxLevel: 10,
    // Every fourth upgrade waits on the one four before it, so the tree has rows, not just a pile.
    requires: i >= 4 && i % 4 === 0 ? [`up-${i - 4}`] : [],
    effects: [{ stat, mul: UPGRADE_MUL }],
  };
});
