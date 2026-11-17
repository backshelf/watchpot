// @feature clicker
// Written by the scaffold from the game's answers. It is the game's now: edit it freely.
import type { ClickCombo, ClickCrit } from "watchpot/core";

/** The thing pressed, the press's verb, and its line. */
export const CLICKER = { name: "The glass", verb: "Tap", line: "Condensation runs. Something stirs." };
/** One press pays `BASE` plus `SHARE` of the income a second. */
export const BASE = 1;
export const SHARE = 0.05;
export const CRIT: ClickCrit = { chance: 0.04, mult: 8 };
/** Presses close together climb to ×2. */
export const COMBO: ClickCombo = { windowMs: 800, step: 0.1, max: 2 };
/** Past this many presses a second, the rest pay nothing. */
export const MAX_PER_SECOND = 20;
