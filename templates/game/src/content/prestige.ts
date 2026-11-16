// @feature prestige
// Written by /watchpot-init from .claude/specs/answers.json. It is the game's now: edit it freely.
import type { CurrencyWords } from "./words";

export const PRESTIGE_NAME = "Repot";
/** The button's word. */
export const PRESTIGE_VERB = "Repot";
export const PRESTIGE_CURRENCY: CurrencyWords = { name: "Root", plural: "Roots", glyph: "star" };

/** The gain: `floor(k × (earned this run / per) ^ exp)`, times the gain stat. */
export const GAIN = { k: 1, exp: 0.5, per: 207360000 };
/** Each unit held raises output by this share. */
export const BONUS_PER_UNIT = 0.1;
