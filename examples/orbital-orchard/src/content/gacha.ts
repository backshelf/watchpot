// Written by /watchpot from .claude/specs/answers.json. It is the game's now: edit it freely.
import type { Effect, OddsTable, PityRule } from "watchpot/core";
import type { Rarity } from "./words";

export const GACHA_NAME = "Graft bench";
/** The one box the pulls open; its id is the gacha's box key. */
export const BOX = "graft-kit";
export const BOX_NAME = "Graft kit";
/** Premium per pull. */
export const PULL_PRICE = 10;
/** One premium drips in this often while the game runs (away, at the offline share). */
export const DRIP_MS = 6 * 60_000;

export const RARITY_NAME: Record<Rarity, string> = {
  common: "Common",
  rare: "Rare",
  exotic: "Exotic",
  heirloom: "Heirloom",
};

/** Weights per rung, lowest first. */
export const ODDS: OddsTable<Rarity> = {
  common: 70,
  rare: 22,
  exotic: 6.5,
  heirloom: 1.5,
};

/** The guarantees: the second-best rung within 10 pulls, the best within 50 (its chance ramping from 41). */
export const PITY: PityRule<Rarity> = [
  { rarity: "exotic", within: 10 },
  { rarity: "heirloom", within: 50, softFrom: 40 },
];

export interface ItemDef {
  id: string;
  name: string;
  rarity: Rarity;
  /** What each copy owned adds. */
  effect: Effect;
}

export const ITEMS: readonly ItemDef[] = [
  {
    id: "crab-apple-scion",
    name: "Crab apple scion",
    rarity: "common",
    effect: { stat: "output", mult: 1.01 },
  },
  { id: "quince-bud", name: "Quince bud", rarity: "common", effect: { stat: "offline", add: 0.01 } },
  { id: "damson-twig", name: "Damson twig", rarity: "common", effect: { stat: "output", mult: 1.01 } },
  {
    id: "blood-orange-scion",
    name: "Blood orange scion",
    rarity: "rare",
    effect: { stat: "output", mult: 1.03 },
  },
  { id: "medlar-bud", name: "Medlar bud", rarity: "rare", effect: { stat: "offline", add: 0.02 } },
  { id: "moon-peach", name: "Moon peach", rarity: "exotic", effect: { stat: "output", mult: 1.12 } },
  { id: "glass-persimmon", name: "Glass persimmon", rarity: "exotic", effect: { stat: "gain", mult: 1.2 } },
  {
    id: "old-earth-bramley",
    name: "Old Earth Bramley",
    rarity: "heirloom",
    effect: { stat: "output", mult: 1.25 },
  },
];
