// Written by /watchpot from .claude/specs/answers.json. It is the game's now: edit it freely.
import { type CurrencyOf, type RarityOf, vocab } from "watchpot/core";
import type { GlyphId } from "../app/icons";

export const NAME = "Moss Garden";
/** The save key's and the game id's stem. */
export const SLUG = "moss-garden";
export const PREMISE = "You keep a terrarium on a windowsill. Moss spreads, ferns unfurl, and somewhere under the gravel a spore bank waits.";

/** The currency the core makes and every upgrade costs. */
export const MAIN = "spores";
/** The currency the pulls cost: it drips in slowly, online and away. */
export const PREMIUM = "dewdrops";

/** The game's words: its currencies, the stats its upgrades raise, its rarity ladder (lowest first). */
export const WORDS = vocab({
  currencies: [MAIN, PREMIUM],
  stats: ["output", "offline", "gain"],
  rarities: ["common","rare","heirloom"],
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
  "spores": { name: "Spore", plural: "Spores", glyph: "leaf" },
  "dewdrops": { name: "Dewdrop", plural: "Dewdrops", glyph: "drop" },
};

/** What each stat is called in the fiction. */
export const STAT: Record<StatId, string> = {
  output: "Growth",
  offline: "Mist",
  gain: "Rootstock",
};

/** The tabs' names, one per screen. */
export const TAB_NAMES = {"make":"Garden","tree":"Trellis","gacha":"Spore bank","prestige":"Repot","achievements":"Herbarium"};

/** The starter backdrop this game was scaffolded with (`src/shaders/`); the build writes its own. */
export const SURFACE = "weather";
/** The sentence every shader in the game answers to. */
export const SURFACE_LINE = "Breath on the glass: condensation drifting over green, thickening and beading as the garden grows.";
