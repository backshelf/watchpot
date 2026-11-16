// Written by /watchpot from .claude/specs/answers.json. It is the game's now: edit it freely.

/** What a new profile starts with. */
export const START = { main: 15, premium: 20 };
/** Away, the core makes this share of its rate (before the offline stat), for at most `OFFLINE_CAP_MS`. */
export const OFFLINE_BASE = 0.5;
export const OFFLINE_CAP_MS = 8 * 3_600_000;
/** The income a late game makes a second: where the backdrop's heat reaches 1 (log scale from 1). */
export const LATE_RATE = 207000 * 100;
