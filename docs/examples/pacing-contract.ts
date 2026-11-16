import { HOUR_MS } from "watchpot/core";
import {
  activeSchedule,
  autoPlayer,
  byHour,
  createSimWorld,
  grid,
  judge,
  markdownTable,
  nominalWakeHour,
  playDays,
  rngFor,
  sampler,
  simStore,
  table,
  type Verdict,
} from "watchpot/sim";
import { game } from "./add-a-generator";

/** One timeline row: what the contract reads. `hours` is the played time since the run's start. */
interface Row {
  hours: number;
  gold: number;
  owned: number;
}

/** The hours the contract judges: one played sitting, the way a person starts a game. */
const HOURS = [1, 2, 4];

/**
 * The contract as data: gold and generators owned at each played hour must land in a band (p10 to p90 over seeds).
 * The bands are drawn around one real run of this file (hour 1: 21,889 gold and 55 owned; hour 4: 66,192 and 67),
 * with room on either side.
 */
const CONTRACT = table(
  byHour((r: Row) => r.hours),
  {
    gold: { name: "Gold", read: (r: Row) => r.gold },
    owned: { name: "Generators", read: (r: Row) => r.owned },
  },
  grid(HOURS, [
    [
      "gold",
      [
        [10_000, 40_000],
        [20_000, 80_000],
        [30_000, 130_000],
      ],
    ],
    [
      "owned",
      [
        [45, 65],
        [50, 72],
        [55, 80],
      ],
    ],
  ]),
);

/** A player at the game the whole time: a look every 10 seconds, so every hour of the run is a played hour. */
const ACTIVE = activeSchedule(10);

/** Plays the auto-player for `hours` played hours and judges the timeline against the contract. */
export function check(seed = "contract", hours = 4): { verdicts: Verdict[]; table: string } {
  const start = Date.UTC(2026, 0, 1, nominalWakeHour(ACTIVE));
  const world = createSimWorld((now) => simStore(game, now, seed), start);
  // No `balance`: the game has one `currencies` feature, so the auto-player reads what it holds there.
  const player = autoPlayer(game);
  const read = (): Row => {
    const s = world.store.getState();
    return {
      hours: (world.now() - start) / HOUR_MS,
      gold: s.wallet.gold.toNumber(),
      owned: s.generator.owned,
    };
  };
  const timeline = sampler({ marks: HOURS.map((h) => h * HOUR_MS), start, take: read, at: (r) => r.hours });
  playDays({
    world,
    schedule: ACTIVE,
    days: 1,
    hours, // stop after the look that crosses the last played hour
    start,
    rng: rngFor(seed, "auto"),
    look: () => player.look(world.store),
    afterLook: () => timeline.look(world.now()),
  });
  return {
    verdicts: judge(timeline.rows, CONTRACT),
    table: markdownTable(
      ["hours", "gold", "owned"],
      timeline.rows.map((r) => [r.hours.toFixed(1), r.gold.toFixed(0), String(r.owned)]),
    ),
  };
}

if (import.meta.main) {
  const { verdicts, table: rows } = check();
  console.log(rows);
  for (const v of verdicts) console.log(v.ok ? "pass" : "FAIL", v.name, v.value, "target", v.target);
}
