/**
 * The sim: plays the game headless on the engine's auto-player (every feature's `moves`), on the session schedule in
 * `src/content/pacing.ts`, and prints a timeline. `--contract` also judges the pacing bands and exits 1 on a miss.
 * `--straight=<hours>` plays one unbroken sitting instead, the tab open throughout, looking in at the schedule's
 * pace, and prints the same table.
 *
 *   bun run sim -- --player=auto [--days=7] [--seed=sim] [--contract]
 *   bun run sim -- --straight=<hours> [--seed=sim]
 */
import { type Decimal, ZERO } from "watchpot/core";
import {
  autoPlayer,
  byDay,
  createSimWorld,
  formatVerdicts,
  grid,
  judge,
  markdownTable,
  playDays,
  playStraight,
  rngFor,
  SIM_TICK_MS,
  sampler,
  simArgs,
  simStore,
  table,
} from "watchpot/sim";
import { BANDS, CONTRACT_DAYS, SCHEDULE, SIM_DAYS } from "../src/content/pacing";
import { type GameState, game } from "../src/game/game";
import { COLUMNS, readRow, type Row } from "./row";

const HOUR = 3_600_000;
const args = simArgs();
const player = args.get("player") ?? "auto";
if (player !== "auto") {
  console.error(`unknown player "${player}": the template ships the engine's auto-player only (--player=auto)`);
  process.exit(2);
}
const days = Number(args.get("days") ?? SIM_DAYS);
const seed = args.get("seed") ?? "sim";
const contract = args.has("contract");
const straight = args.has("straight") ? Number(args.get("straight")) : null;
if (straight !== null && !(straight > 0)) {
  console.error(`--straight takes the sitting's hours: --straight=1 (got "${args.get("straight")}")`);
  process.exit(2);
}
if (straight !== null && contract) {
  console.error("--contract judges whole days; a straight sitting has none, so run them apart");
  process.exit(2);
}

/** A Monday, 08:00 local: the first session opens here. */
const START = new Date(2026, 0, 5, 8, 0, 0).getTime();
const started = performance.now();

const world = createSimWorld((now) => simStore(game, now, seed), START);
const state = () => world.store.getState() as unknown as GameState;
const auto = autoPlayer<GameState>(game, {
  balance: (s, currency) => (s.wallet as unknown as Record<string, Decimal>)[currency] ?? ZERO,
});
const take = () => readRow(state(), (world.now() - START) / HOUR);
/**
 * The day's best kinds and ranks: a day-end row reports how far the day's play got, so a prestige just before
 * midnight (which empties both) does not read as a day that got nowhere.
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
const rows = sampler<Row>({
  marks: [0.25, 0.5, 1, 2, 4].map((h) => h * HOUR),
  start: START,
  take,
  at: (r) => r.hours,
});
let bought = 0;
const look = () => {
  bought += auto.look(world.store as never).bought;
};
if (straight === null) {
  playDays({
    world,
    schedule: SCHEDULE,
    days,
    start: START,
    rng: rngFor(seed, player),
    look,
    afterLook: () => {
      climb(take());
      rows.look(world.now());
    },
    dayEnd: (day) => {
      rows.close({ ...climb(take()), ...best, day });
      best = NONE;
    },
  });
} else {
  // One sitting, looking in at the middle of the schedule's look gap, in the same minute ticks the days play in.
  const { min, max } = SCHEDULE.lookEveryMin;
  playStraight({
    world,
    ms: straight * HOUR,
    lookEveryMs: ((min + max) / 2) * 60_000,
    tickMs: SIM_TICK_MS,
    look,
    afterLook: () => rows.look(world.now()),
  });
  rows.close(take());
}

const fixed = (n: number, d = 1) => n.toFixed(d);
const span = straight === null ? `${days} days` : `one ${straight}h sitting`;
console.log(`sim: ${player} player, seed ${seed}, ${span}, ${bought} purchases, ${fixed((performance.now() - started) / 1000)}s`);
console.log(
  markdownTable(
    ["day", "hours", ...COLUMNS.map(([heading]) => heading)],
    rows.rows.map((r) => [r.day === undefined ? "" : String(r.day), fixed(r.hours), ...COLUMNS.map(([, cell]) => cell(r))]),
  ),
);

if (contract) {
  const hoursOf = (r: Row) => r.hours;
  const CONTRACT = table(
    byDay(hoursOf),
    {
      kinds: { name: "Producer kinds owned (the day's best)", read: (r: Row) => r.kinds },
      // @if tree
      ranks: { name: "Upgrade ranks (the day's best)", read: (r: Row) => r.ranks },
      // @end
      // @if gacha
      pulls: { name: "Pulls", read: (r: Row) => r.pulls },
      // @end
      // @if prestige
      runs: { name: "Prestige resets", read: (r: Row) => r.runs },
      // @end
    },
    grid(CONTRACT_DAYS, BANDS),
  );
  const verdicts = judge(rows.rows, CONTRACT);
  console.log(formatVerdicts(verdicts));
  if (verdicts.some((v) => !v.ok)) process.exit(1);
}
