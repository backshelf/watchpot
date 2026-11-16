/**
 * The sim: plays the game headless on the engine's auto-player (every feature's `moves`) and prints a timeline. By
 * default it plays `ACTIVE` from `src/content/pacing.ts`, a player at it around the clock, so every hour of the run is
 * a played hour; `--contract` judges the pacing bands at their played hours and exits 1 on a miss. `--sessions` plays
 * the session schedule instead (`SCHEDULE`, days of a person coming and going), a second look that is never judged.
 *
 *   bun run sim -- [--hours=12] [--seed=sim] [--contract]
 *   bun run sim -- --sessions [--days=7] [--seed=sim]
 */
import { type Decimal, ZERO } from "watchpot/core";
import {
  autoPlayer,
  byHour,
  createSimWorld,
  formatVerdicts,
  grid,
  judge,
  type LookAt,
  markdownTable,
  playDays,
  rngFor,
  type Schedule,
  sampler,
  simArgs,
  simStore,
  table,
} from "watchpot/sim";
import { ACTIVE, BANDS, CONTRACT_HOURS, SCHEDULE, SIM_DAYS, SIM_HOURS } from "../src/content/pacing";
import { type GameState, game } from "../src/game/game";
import { COLUMNS, readRow, type Row } from "./row";

const HOUR = 3_600_000;
const args = simArgs();
const player = args.get("player") ?? "auto";
if (player !== "auto") {
  console.error(`unknown player "${player}": the template ships the engine's auto-player only (--player=auto)`);
  process.exit(2);
}
const seed = args.get("seed") ?? "sim";
const contract = args.has("contract");
const sessions = args.has("sessions");
const hours = Number(args.get("hours") ?? SIM_HOURS);
const days = Number(args.get("days") ?? SIM_DAYS);
if (!(hours > 0 && hours <= 24)) {
  console.error(`--hours takes the played hours, a day at most: --hours=12 (got "${args.get("hours")}")`);
  process.exit(2);
}
if (sessions && contract) {
  console.error("--contract judges played hours; a session run is never judged, so run them apart");
  process.exit(2);
}

/** A Monday, 08:00 local: the first look happens here. */
const START = new Date(2026, 0, 5, 8, 0, 0).getTime();
const started = performance.now();

const world = createSimWorld((now) => simStore(game, now, seed), START);
const state = () => world.store.getState() as unknown as GameState;
const auto = autoPlayer<GameState>(game, {
  balance: (s, currency) => (s.wallet as unknown as Record<string, Decimal>)[currency] ?? ZERO,
});
const take = () => readRow(state(), (world.now() - START) / HOUR);
/**
 * The best kinds and ranks so far (a session run: that day): a row reports how far the play got, so a prestige just
 * before it (which empties both) does not read as play that got nowhere.
 */
const NONE = {
  kinds: 0,
  // @if tree
  ranks: 0,
  // @end
};
let best = NONE;
const climb = (r: Row) => {
  best = {
    kinds: Math.max(best.kinds, r.kinds),
    // @if tree
    ranks: Math.max(best.ranks, r.ranks),
    // @end
  };
  return r;
};
const marks = sessions ? [0.25, 0.5, 1, 2, 4] : [...new Set([0.25, 0.5, 1, 2, 4, 8, ...CONTRACT_HOURS])].sort((a, b) => a - b);
const rows = sampler<Row>({
  marks: marks.map((h) => h * HOUR),
  start: START,
  take: () => ({ ...take(), ...best }),
  at: (r) => r.hours,
});
let bought = 0;
let presses = 0;
const look = (at: LookAt) => {
  // @if clicker
  for (let i = 0; i < at.presses; i++) state().clicker.click();
  // @end
  presses += at.presses;
  bought += auto.look(world.store as never).bought;
};
// The active run is one sitting of `hours` from the first look: the schedule's day, cut to its length.
const schedule: Schedule = sessions ? SCHEDULE : { ...ACTIVE, sleepHour: ACTIVE.wakeHour + hours };
playDays({
  world,
  schedule,
  days: sessions ? days : 1,
  start: START,
  rng: rngFor(seed, player),
  look,
  afterLook: () => {
    climb(take());
    rows.look(world.now());
  },
  dayEnd: (day) => {
    rows.close({ ...climb(take()), ...best, ...(sessions ? { day } : {}) });
    best = NONE;
  },
});

const fixed = (n: number, d = 1) => n.toFixed(d);
const span = sessions ? `${days} days of sessions` : `${hours} played hours`;
console.log(`sim: ${player} player, seed ${seed}, ${span}, ${bought} purchases, ${presses} presses, ${fixed((performance.now() - started) / 1000)}s`);
console.log(
  markdownTable(
    ["day", "hours", ...COLUMNS.map(([heading]) => heading)],
    rows.rows.map((r) => [r.day === undefined ? "" : String(r.day), fixed(r.hours), ...COLUMNS.map(([, cell]) => cell(r))]),
  ),
);

if (contract) {
  // Every metric a band may name; `BANDS` holds bands for some of them.
  const metrics = {
    main: { name: "log10 of the main balance", read: (r: Row) => r.main },
    kinds: { name: "Producer kinds owned (the best so far)", read: (r: Row) => r.kinds },
    // @if tree
    ranks: { name: "Upgrade ranks (the best so far)", read: (r: Row) => r.ranks },
    // @end
    // @if gacha
    pulls: { name: "Pulls", read: (r: Row) => r.pulls },
    // @end
    // @if prestige
    runs: { name: "Prestige resets", read: (r: Row) => r.runs },
    // @end
  };
  const CONTRACT = table(byHour((r: Row) => r.hours), metrics, grid(CONTRACT_HOURS, BANDS));
  const verdicts = judge(rows.rows, CONTRACT);
  console.log(formatVerdicts(verdicts));
  if (verdicts.some((v) => !v.ok)) process.exit(1);
}
