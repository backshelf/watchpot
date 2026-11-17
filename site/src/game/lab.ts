// The sim lab over the page's own game: the same definition, played headless on a clock the sim owns, by the
// engine's auto-player on a schedule of sessions drawn from a seed, sampled into a timeline and judged against a
// pacing contract. It runs in the page, on demand.
import { HOUR_MS } from "watchpot/core";
import {
  autoPlayer,
  byHour,
  createSimWorld,
  grid,
  judge,
  playDays,
  rngFor,
  type SessionSchedule,
  sampler,
  simStore,
  table,
  type Verdict,
} from "watchpot/sim";
import { type ToyState, type Tuning, tunedToy } from "./toy";

/** One row of the timeline: what the contract and the chart read. */
export interface LabRow {
  hours: number;
  /** log10 of all the steam boiled, across every run. */
  boiled: number;
  vents: number;
}

export interface LabRun {
  seed: string;
  rows: LabRow[];
  verdicts: Verdict[];
  /** Wall milliseconds the run took in this browser. */
  ms: number;
  /** Looks the auto-player took. */
  looks: number;
}

export const DAYS = 3;

/** A fixed morning: the sim owns its clock and never reads the wall. */
const START = Date.UTC(2026, 0, 5, 8);

/**
 * Someone who checks in: a handful of sessions a day of a few minutes each, a look every minute or so, the tab
 * closed in between and overnight. Every figure here is drawn from the seed's behaviour stream.
 */
const CHECKER: SessionSchedule = {
  kind: "sessions",
  wakeHour: { min: 7, max: 9 },
  sleepHour: { min: 22, max: 24 },
  sessionsPerDay: { min: 4, max: 7 },
  sessionMin: { median: 9, spread: 0.6, min: 3, max: 40 },
  lookEveryMin: { min: 0.5, max: 2 },
  tabLeftOpen: 0.25,
  skipDay: 0,
  skipWeekendDay: 0,
  decay: [1],
  lengthDecay: [1],
  pressesPerSession: { min: 0, max: 0 },
  firstDayBonusSessions: 1,
};

/** The contract: where the pacing is meant to be, in orders of magnitude of steam ever boiled, by the hour. */
export const MARKS = [4, 12, 24, 48, 60] as const;
export const BANDS: readonly (readonly [number, number])[] = [
  [3.5, 7.5],
  [7.5, 13.2],
  [9.5, 14.2],
  [14.8, 17.6],
  [16, 18.3],
];

const CONTRACT = table(
  byHour((r: LabRow) => r.hours),
  { boiled: { name: "Steam boiled, log10", read: (r: LabRow) => r.boiled } },
  grid([...MARKS], [["boiled", BANDS.map(([lo, hi]): [number, number] => [lo, hi])]]),
);

/** Plays three days of the game on a seed and judges the timeline. `tuning` turns the prices first. */
export function runLab(seed: string, tuning: Tuning = {}): LabRun {
  const wallStart = performance.now();
  const game = tunedToy(tuning);
  // A minute a tick: the lab plots three days on a log axis, where a finer tick draws the same lines 60 times slower
  // (the sim's own default is a second, for a contract that must be exact).
  const world = createSimWorld((now) => simStore(game, now, seed), START, { quality: "rough" });
  const player = autoPlayer(game, { balance: (s: ToyState) => s.wallet.steam });
  // `boiled` starts over with each run: carry the sum of the runs before this one.
  let total = 0;
  let carried = 0;
  let lastRun = 0;
  const read = (): LabRow => {
    const s = world.store.getState() as unknown as ToyState;
    if (s.valve.runs !== lastRun) {
      carried = total;
      lastRun = s.valve.runs;
    }
    total = carried + s.wallet.boiled.toNumber();
    return {
      hours: (world.now() - START) / HOUR_MS,
      boiled: Math.log10(Math.max(1, total)),
      vents: s.valve.runs,
    };
  };
  const marks: number[] = [];
  for (let h = 0.5; h <= DAYS * 24; h += 0.5) marks.push(h * HOUR_MS);
  const timeline = sampler({ marks, start: START, take: read, at: (r) => r.hours });
  let looks = 0;
  playDays({
    world,
    schedule: CHECKER,
    days: DAYS,
    start: START,
    rng: rngFor(seed, "checker"),
    look: () => {
      looks += 1;
      player.look(world.store);
      read();
    },
    afterLook: () => timeline.look(world.now()),
    dayEnd: () => timeline.close(read()),
  });
  return {
    seed,
    rows: timeline.rows,
    verdicts: judge(timeline.rows, CONTRACT),
    ms: performance.now() - wallStart,
    looks,
  };
}
