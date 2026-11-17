/**
 * The sim bench: plays the game headless exactly as `sim/run.ts` does on its days branch (the auto-player, the session
 * schedule, no contract, no straight sitting), times that one play, and prints the wall time and the cost per
 * simulated hour. `--out` writes a fingerprint (the purchases, the simulated hours and the sampled rows, no timing),
 * and `--compare` checks this run against one, exiting 2 when the setup differs and 1 when the play does.
 *
 *   bun run bench -- [--days=3] [--seed=sim] [--quality=exact|quick|rough] [--out=<path>] [--compare=<path>]
 */
import { type Decimal, ZERO } from "watchpot/core";
import { autoPlayer, createSimWorld, playDays, rngFor, sampler, simArgs, simStore } from "watchpot/sim";
import { SCHEDULE } from "../src/content/pacing";
import { type GameState, game } from "../src/game/game";
import { type Row, readRow } from "./row";

const HOUR = 3_600_000;
const QUALITIES = ["exact", "quick", "rough"] as const;
type Quality = (typeof QUALITIES)[number];

/** The play's fingerprint: its setup, and what it did. Holds no timing, so an unchanged run gives the same file. */
export interface Fingerprint {
  days: number;
  seed: string;
  quality: Quality;
  bought: number;
  simHours: number;
  rows: Row[];
}

/**
 * The differences between two fingerprints, one line each (empty when equal). A setup difference is reported alone:
 * the plays are not comparable then.
 */
export function compareFingerprints(a: Fingerprint, b: Fingerprint): string[] {
  const setup = ["days", "seed", "quality"].filter(
    (k) => a[k as keyof Fingerprint] !== b[k as keyof Fingerprint],
  );
  if (setup.length > 0) {
    return [
      `setup differs: ${setup.map((k) => `${k} ${a[k as keyof Fingerprint]} -> ${b[k as keyof Fingerprint]}`).join(", ")}`,
    ];
  }
  const out: string[] = [];
  if (a.bought !== b.bought) out.push(`bought: ${a.bought} -> ${b.bought}`);
  if (a.simHours !== b.simHours) out.push(`simHours: ${a.simHours} -> ${b.simHours}`);
  const n = Math.max(a.rows.length, b.rows.length);
  for (let i = 0; i < n; i++) {
    const ra = a.rows[i] as Record<string, unknown> | undefined;
    const rb = b.rows[i] as Record<string, unknown> | undefined;
    if (!ra || !rb) {
      out.push(`rows[${i}]: ${ra ? "present" : "missing"} -> ${rb ? "present" : "missing"}`);
      continue;
    }
    const fields = new Set([...Object.keys(ra), ...Object.keys(rb)]);
    for (const f of fields) {
      if (JSON.stringify(ra[f]) !== JSON.stringify(rb[f])) {
        out.push(`rows[${i}].${f}: ${JSON.stringify(ra[f])} -> ${JSON.stringify(rb[f])}`);
      }
    }
  }
  return out;
}

const args = simArgs();
const days = Number(args.get("days") ?? 3);
const seed = args.get("seed") ?? "sim";
const quality = (args.get("quality") ?? "exact") as Quality;
const out = args.get("out");
const compare = args.get("compare");
if (!(days > 0)) {
  console.error(`--days takes a positive number of days (got "${args.get("days")}")`);
  process.exit(2);
}
if (!QUALITIES.includes(quality)) {
  console.error(`--quality takes exact, quick or rough (got "${quality}")`);
  process.exit(2);
}

/** A Monday, 08:00 local: the first session opens here. */
const START = new Date(2026, 0, 5, 8, 0, 0).getTime();
const player = "auto";

const world = createSimWorld((now) => simStore(game, now, seed), START, { quality });
const state = () => world.store.getState() as unknown as GameState;
const auto = autoPlayer<GameState>(game, {
  // The wallet's currencies, else the shower's (its shards buy its tree).
  balance: (s, currency) =>
    (s.wallet as unknown as Record<string, Decimal>)[currency] ??
    s.events.runtime.currencies[currency] ??
    ZERO,
});
const take = () => readRow(state(), (world.now() - START) / HOUR);
let best = { kinds: 0, ranks: 0 };
const climb = (r: Row) => {
  best = { kinds: Math.max(best.kinds, r.kinds), ranks: Math.max(best.ranks, r.ranks) };
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

const t0 = performance.now();
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
    best = { kinds: 0, ranks: 0 };
  },
});
const wallMs = performance.now() - t0;

const simHours = (world.now() - START) / HOUR;
const fp: Fingerprint = { days, seed, quality, bought, simHours, rows: rows.rows };
const perHour = simHours > 0 ? wallMs / simHours : 0;
console.log(
  `bench: ${days} days, seed ${seed}, ${quality}, ${(wallMs / 1000).toFixed(2)} s wall, ${perHour.toFixed(1)} ms/sim-hour, ${bought} purchases`,
);

if (out) {
  await Bun.write(out, `${JSON.stringify(fp, null, 2)}\n`);
}

if (compare) {
  const prev = JSON.parse(await Bun.file(compare).text()) as Fingerprint;
  if (prev.days !== days || prev.seed !== seed || prev.quality !== quality) {
    console.log(compareFingerprints(prev, fp)[0]);
    process.exit(2);
  }
  const diffs = compareFingerprints(prev, fp);
  if (diffs.length === 0) {
    console.log("fingerprint: identical");
  } else {
    console.log("fingerprint: differs");
    for (const line of diffs.slice(0, 10)) console.log(line);
    process.exit(1);
  }
}
