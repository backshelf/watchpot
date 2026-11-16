// Written by /watchpot from .claude/specs/answers.json. It is the game's now: edit it freely.
import { type CurrencyOf, type RarityOf, vocab } from "watchpot/core";
import type { GlyphId } from "../app/icons";

export const NAME = "Orbital Orchard";
/** The save key's and the game id's stem. */
export const SLUG = "orbital-orchard";
export const PREMISE =
  "A lone caretaker on a derelict space station grows fruit trees in orbit for a planet that stopped answering. The fruit keeps coming. Somebody should be there to pick it.";

/** The currency every generator makes and every upgrade costs. */
export const MAIN = "sunlight";
/** The currency the pulls cost: it drips in slowly, online and away. */
export const PREMIUM = "seeds";

/** The game's words: its currencies, the stats its upgrades raise, its rarity ladder (lowest first). */
export const WORDS = vocab({
  currencies: [MAIN, PREMIUM],
  stats: ["output", "offline", "gain"],
  rarities: ["common", "rare", "exotic", "heirloom"],
} as const);

export type Currency = CurrencyOf<typeof WORDS>;
export type Rarity = RarityOf<typeof WORDS>;
export type StatId = "output" | "offline" | "gain";

export interface CurrencyWords {
  name: string;
  plural: string;
  glyph: GlyphId;
}

export const CURRENCY: Record<Currency, CurrencyWords> = {
  sunlight: { name: "Sunlight", plural: "Sunlight", glyph: "sun" },
  seeds: { name: "Seed", plural: "Seeds", glyph: "seed" },
};

/** What each stat is called in the fiction. */
export const STAT: Record<StatId, string> = {
  output: "Yield",
  offline: "Night shift",
  gain: "Delta-v",
};

/** The tabs' names, one per screen. */
export const TAB_NAMES = {
  make: "Orchard",
  tree: "Modules",
  gacha: "Grafts",
  event: "Shower",
  prestige: "Orbit",
};
