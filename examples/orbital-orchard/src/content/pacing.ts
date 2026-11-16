// Written by /watchpot from .claude/specs/answers.json. It is the game's now: edit it freely.
import type { BandRow, SessionSchedule } from "watchpot/sim";

/** The session the game is built for: short sessions: a handful a day, about ten minutes each. */
export const SESSION = "short";

/** How the sim's player comes and goes. */
export const SCHEDULE: SessionSchedule = {
  kind: "sessions",
  wakeHour: { min: 7, max: 9 },
  sleepHour: { min: 22, max: 24 },
  sessionsPerDay: { min: 4, max: 6 },
  sessionMin: { median: 10, spread: 0.5, min: 3, max: 25 },
  lookEveryMin: { min: 1, max: 3 },
  tabLeftOpen: 0.3,
  skipDay: 0,
  skipWeekendDay: 0,
  decay: [1],
  lengthDecay: [1],
  pressesPerSession: { min: 0, max: 0 },
  firstDayBonusSessions: 1,
};

/** The days the contract reads, and how many the sim plays by default. */
export const CONTRACT_DAYS = [1, 3, 7] as const;
export const SIM_DAYS = 7;

/**
 * The pacing contract: per metric, the [low, high] it should sit in by the end of each contract day. These are the
 * design's intent, not a measurement: tune the content until `bun run sim -- --contract` holds them, or move a band
 * on purpose and say why in the commit.
 */
export const BANDS = [
  [
    "kinds",
    [
      [3, 5],
      [4, 5],
      [5, 5],
    ],
  ],
  [
    "ranks",
    [
      [1, 40],
      [5, 60],
      [10, 200],
    ],
  ],
  [
    "pulls",
    [
      [2, 40],
      [5, 120],
      [10, 400],
    ],
  ],
  [
    "runs",
    [
      [0, 2],
      [1, 6],
      [2, 20],
    ],
  ],
  [
    "caught",
    [
      [20, 150],
      [80, 500],
      [250, 1500],
    ],
  ],
] as const satisfies readonly BandRow<string>[];
