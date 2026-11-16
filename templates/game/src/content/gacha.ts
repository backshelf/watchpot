// @feature gacha
// Written by /watchpot from .claude/specs/answers.json. It is the game's now: edit it freely.
import type { Effect, OddsTable, PityRule } from "watchpot/core";
import type { Rarity } from "./words";

export const GACHA_NAME = "The spore bank";
/** The one box the pulls open; its id is the gacha's box key. */
export const BOX = "seed-packet";
export const BOX_NAME = "Seed packet";
/** Premium per pull. */
export const PULL_PRICE = 10;
/** One premium drips in this often while the game runs (away, at the offline share). */
export const DRIP_MS = 6 * 60_000;

export const RARITY_NAME: Record<Rarity, string> = {
  "common": "Common",
  "rare": "Rare",
  "heirloom": "Heirloom",
};

/** Weights per rung, lowest first. */
export const ODDS: OddsTable<Rarity> = {
  "common": 80,
  "rare": 17,
  "heirloom": 3,
};

/** The guarantees: the second-best rung within 10 pulls, the best within 50 (its chance ramping from 41). */
export const PITY: PityRule<Rarity> = [
  { rarity: "rare", within: 10 },
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
  { id: "pillow-moss", name: "Pillow moss", rarity: "common", effect: { stat: "output", mult: 1.01 } },
  { id: "peacock-fern", name: "Peacock fern", rarity: "common", effect: { stat: "offline", add: 0.01 } },
  { id: "silver-lace", name: "Silver lace", rarity: "common", effect: { stat: "output", mult: 1.01 } },
  { id: "jewel-orchid", name: "Jewel orchid", rarity: "rare", effect: { stat: "output", mult: 1.06 } },
  { id: "sundew", name: "Sundew", rarity: "rare", effect: { stat: "gain", mult: 1.1 } },
  { id: "ghost-orchid", name: "Ghost orchid", rarity: "heirloom", effect: { stat: "output", mult: 1.25 } },
];
