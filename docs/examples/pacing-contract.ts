import { HOUR_MS, type StateOf } from "watchpot/core";
import {
  autoPlayer,
  byDay,
  createSimWorld,
  fixedSchedule,
  grid,
  judge,
  markdownTable,
  playDays,
  rngFor,
  sampler,
  simStore,
  table,
  type Verdict,
} from "watchpot/sim";
import { game } from "./add-a-generator";

/** One timeline row: what the contract reads. `hours` is the time since the run's start. */
interface Row {
  hours: number;
  gold: number;
  owned: number;
}

/** The contract as data: gold by the end of day 1 and day 3 must land in a band (p10 to p90 over seeds). */
const CONTRACT = table(
  byDay((r: Row) => r.hours),
  {
    gold: { name: "Gold", read: (r: Row) => r.gold },
    owned: { name: "Generators", read: (r: Row) => r.owned },
  },
  grid(
    [1, 3],
    [
      [
        "gold",
        [
          [0, 1e9],
          [0, 1e9],
        ],
      ],
      [
        "owned",
        [
          [5, 200],
          [20, 400],
        ],
      ],
    ],
  ),
);

/** Plays the auto-player for `days` and judges the timeline against the contract. */
export function check(seed = "contract", days = 3): { verdicts: Verdict[]; table: string } {
  const start = Date.UTC(2026, 0, 1, 8);
  const world = createSimWorld((now) => simStore(game, now, seed), start);
  const player = autoPlayer(game, { balance: (s: StateOf<typeof game.features>) => s.wallet.gold });
  const read = (): Row => {
    const s = world.store.getState();
    return {
      hours: (world.now() - start) / HOUR_MS,
      gold: s.wallet.gold.toNumber(),
      owned: s.generator.owned,
    };
  };
  const timeline = sampler({ marks: [1, 4].map((h) => h * HOUR_MS), start, take: read, at: (r) => r.hours });
  playDays({
    world,
    schedule: fixedSchedule(8, 23, 15, 0),
    days,
    start,
    rng: rngFor(seed, "auto"),
    look: () => player.look(world.store),
    afterLook: () => timeline.look(world.now()),
    dayEnd: () => timeline.close(read()),
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
