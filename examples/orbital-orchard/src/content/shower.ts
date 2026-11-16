import { DAY_MS, type EventDefinition, eventNodeRow, MINUTE_MS, type RewardOf } from "watchpot/core";
import type { WORDS } from "./words";

/**
 * The meteor shower: the game's one timed event. Two days of falling rock in every three. Nets come back on their
 * own (and from planting while it falls); a net cast at the sky catches what is there; shards buy better nets; the
 * shards caught pay out at the milestones.
 */

/** What a node of the shower's tree does: a bigger catch, nets back sooner, more nets held. */
export type ShowerEffect =
  | { kind: "catch"; mult: number }
  | { kind: "scope"; mult: number }
  | { kind: "spare"; add: number };

/** What a milestone pays: seeds, minutes of the orchard's sunlight, or a free graft kit. */
export type ShowerReward = RewardOf<
  typeof WORDS,
  { kind: "sunlight"; minutes: number } | { kind: "graft"; count: number }
>;

/** The game's actions that pay nets in while the shower falls. */
export type ShowerAction = "plant";

export const NETS = "nets";
export const SHARDS = "shards";

const row = eventNodeRow<ShowerEffect>(SHARDS);

export const SHOWER: EventDefinition<ShowerEffect, ShowerReward, ShowerAction> = {
  id: "meteor-shower",
  name: "Meteor shower",
  tagline: "Something is finally coming our way.",
  // Two days on, one day off, from a fixed instant: the same sky for everyone.
  schedule: { kind: "repeating", epoch: Date.UTC(2026, 0, 1), durationMs: 2 * DAY_MS, gapMs: DAY_MS },
  currencies: [
    { id: NETS, name: "Nets", glyph: "net", start: 3, cap: 5, regen: { amount: 1, everyMs: 30 * MINUTE_MS } },
    { id: SHARDS, name: "Shards", glyph: "shard", start: 0 },
  ],
  upgrades: [
    row(
      "wide-net",
      "Wider net",
      "Catches what the old one let through.",
      6,
      5,
      [],
      [{ kind: "catch", mult: 1.25 }],
    ),
    row(
      "spotting-scope",
      "Spotting scope",
      "See them before they arrive.",
      12,
      3,
      [],
      [{ kind: "scope", mult: 1.3 }],
    ),
    row(
      "spare-net",
      "Spare net",
      "Mended twice. Still holds.",
      18,
      3,
      ["wide-net"],
      [{ kind: "spare", add: 1 }],
    ),
  ],
  milestones: [
    {
      id: "first-light",
      name: "First light",
      stat: "caught",
      threshold: 10,
      rewards: [{ kind: "seeds", amount: 20 }],
    },
    {
      id: "steady-fall",
      name: "Steady fall",
      stat: "caught",
      threshold: 40,
      rewards: [{ kind: "sunlight", minutes: 30 }],
    },
    {
      id: "star-field",
      name: "Star field",
      stat: "caught",
      threshold: 100,
      rewards: [{ kind: "graft", count: 1 }],
    },
    {
      id: "long-night",
      name: "Long night",
      stat: "caught",
      threshold: 250,
      rewards: [{ kind: "seeds", amount: 60 }],
    },
  ],
  shop: [],
  stats: ["caught", "casts", "skies"],
  // The engine's definition requires a pass; the shower sells none, so its track has no tiers and is never drawn.
  pass: { name: "Shower log", line: "", priceCents: 0, stat: "caught", unit: ["shard", "shards"], tiers: [] },
  // Every fiftieth tree planted while the shower falls brings a net in: a nudge, not a source (the sim plants hundreds).
  fuel: [{ on: "plant", per: 0.02, currency: NETS }],
};

/** What can be up there: each sky holds these, in these counts, in an order nobody knows until the net comes back. */
export interface SkyToken {
  id: "glint" | "streak" | "fireball" | "pod" | "dark";
  name: string;
  line: string;
  count: number;
  shards: number;
  seeds?: number;
}

export type SkyTokenId = SkyToken["id"];

export const SKY: readonly SkyToken[] = [
  { id: "glint", name: "Glint", line: "A fleck. Still counts.", count: 6, shards: 1 },
  { id: "streak", name: "Streak", line: "A proper one.", count: 3, shards: 3 },
  { id: "fireball", name: "Fireball", line: "Lit the whole ring for a second.", count: 1, shards: 8 },
  { id: "pod", name: "Seed pod", line: "Something grew out there. Briefly.", count: 1, shards: 0, seeds: 10 },
  { id: "dark", name: "Nothing", line: "Just the dark.", count: 1, shards: 0 },
];

/** Cells in one sky: every token once per its count. */
export const SKY_CELLS = SKY.reduce((n, t) => n + t.count, 0);
/** The sky's grid: columns across. */
export const SKY_COLUMNS = 4;
