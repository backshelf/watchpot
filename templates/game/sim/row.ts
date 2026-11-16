import { MAIN } from "../src/content/words";
import type { GameState } from "../src/game/game";

/** One timeline row: what the sim reads off the game at a mark. A new column goes here, in `COLUMNS` and in `run.ts`'s metrics. */
export interface Row {
  /** Hours since the profile's start. */
  hours: number;
  day?: number;
  /** log10 of the main balance (0 at none). */
  main: number;
  /** Producer kinds owned (generators) or tiers bought (dimensions). */
  kinds: number;
  // @if tree
  /** Upgrade ranks held. */
  ranks: number;
  // @end
  // @if gacha
  /** Pulls made, ever. */
  pulls: number;
  // @end
  // @if prestige
  /** Prestige resets. */
  runs: number;
  // @end
  // @if achievements
  /** Achievements earned. */
  earned: number;
  // @end
}

/** The timeline's columns after the day and the hours: a heading and how a row prints in it. */
export const COLUMNS: readonly [string, (r: Row) => string][] = [
  ["log10 main", (r) => r.main.toFixed(2)],
  ["kinds", (r) => String(r.kinds)],
  // @if tree
  ["ranks", (r) => String(r.ranks)],
  // @end
  // @if gacha
  ["pulls", (r) => String(r.pulls)],
  // @end
  // @if prestige
  ["runs", (r) => String(r.runs)],
  // @end
  // @if achievements
  ["earned", (r) => String(r.earned)],
  // @end
];

export function readRow(s: GameState, hours: number): Row {
  const main = s.wallet[MAIN];
  let kinds = 0;
  // @if generators
  kinds = Math.max(kinds, Object.values(s.generators.owned).filter((n) => n > 0).length);
  // @end
  // @if dimensions
  kinds = Math.max(kinds, Object.values(s.dimensions.bought).filter((n) => n > 0).length);
  // @end
  return {
    hours,
    main: main.gt(0) ? main.log10().toNumber() : 0,
    kinds,
    // @if tree
    ranks: Object.values(s.upgrades.ranks).reduce((a, b) => a + b, 0),
    // @end
    // @if gacha
    pulls: Object.values(s.summon.opened).reduce((a, b) => a + b, 0),
    // @end
    // @if prestige
    runs: s.prestige.runs,
    // @end
    // @if achievements
    earned: Object.keys(s.achievements.earned).length,
    // @end
  };
}
