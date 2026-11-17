// Written by /watchpot from .claude/specs/answers.json. It is the game's now: edit it freely.
import type { CurrencyWords } from "./words";

export const PRESTIGE_NAME = "Change orbit";
/** The button's word. */
export const PRESTIGE_VERB = "Change orbit";
export const PRESTIGE_CURRENCY: CurrencyWords = { name: "Orbit", plural: "Orbits", glyph: "moon" };

/** The gain: `floor(k × (earned this run / per) ^ exp)`, times the gain stat. */
export const GAIN = { k: 1, exp: 0.5, per: 829440000 };
