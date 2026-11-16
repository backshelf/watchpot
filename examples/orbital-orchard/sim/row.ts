import { MAIN } from "../src/content/words";
import type { GameState } from "../src/game/game";

/** One timeline row: what the sim reads off the game at a mark. A new column goes here and in `run.ts`'s metrics. */
export interface Row {
  /** Hours since the profile's start. */
  hours: number;
  day?: number;
  /** log10 of the main balance (0 at none). */
  main: number;
  /** Generator kinds owned. */
  kinds: number;
  /** Upgrade ranks held. */
  ranks: number;
  /** Pulls made, ever. */
  pulls: number;
  /** Prestige resets. */
  runs: number;
  /** Meteor shards caught, every shower. */
  caught: number;
}

export function readRow(s: GameState, hours: number): Row {
  const main = s.wallet[MAIN];
  const row: Row = {
    hours,
    main: main.gt(0) ? main.log10().toNumber() : 0,
    kinds: Object.values(s.generators.owned).filter((n) => n > 0).length,
    ranks: 0,
    pulls: 0,
    runs: 0,
    caught: s.events.caughtEver,
  };
  row.ranks = Object.values(s.upgrades.ranks).reduce((a, b) => a + b, 0);
  row.pulls = Object.values(s.summon.opened).reduce((a, b) => a + b, 0);
  row.runs = s.prestige.runs;
  return row;
}
