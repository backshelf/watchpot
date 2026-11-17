/**
 * The heavy bench: plays the synthetic game (`bench/heavy/game.ts`) through `runFit` on the engine's auto-player, one
 * gate every 30 minutes of play, and prints the wall time per step and per sim-hour. `--out` saves the fingerprint;
 * `--compare` checks this run's against a saved one (exit 2 on a setup mismatch, 1 on a play difference).
 *
 *   bun run bench:heavy -- [--hours=4] [--seed=sim] [--quality=exact|quick|rough] [--out=<path>] [--compare=<path>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Decimal } from "watchpot/core";
import {
  autoPlayer,
  createSimWorld,
  type FitGate,
  type FittedGate,
  fitTable,
  holdings,
  nicePrice,
  runFit,
  SIM_QUALITY,
  type SimQuality,
  simArgs,
  simStore,
} from "watchpot/sim";
import { MAIN } from "./content";
import { type GameState, game } from "./game";

const HOUR = 3_600_000;
const GATE_EVERY_MS = HOUR / 2;

/** What a run is fingerprinted by: its setup, what it bought, the final coins, and each gate's opening. */
export interface Fingerprint {
  hours: number;
  seed: string;
  quality: SimQuality;
  bought: number;
  coinsLog10: number;
  gates: FittedGate[];
}

const SETUP = ["hours", "seed", "quality"] as const;
const PLAY = ["bought", "coinsLog10"] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What differs between two fingerprints: the setup (a different run altogether) and the play (the same run, moved).
 * The play lists at most ten lines.
 */
export function compareFingerprints(
  now: Fingerprint,
  saved: Fingerprint,
): { setup: string[]; play: string[] } {
  const setup = SETUP.filter((k) => !same(now[k], saved[k])).map(
    (k) => `${k}: ${JSON.stringify(now[k])} vs saved ${JSON.stringify(saved[k])}`,
  );
  const play: string[] = [];
  for (const k of PLAY) {
    if (!same(now[k], saved[k]))
      play.push(`${k}: ${JSON.stringify(now[k])} vs saved ${JSON.stringify(saved[k])}`);
  }
  const count = Math.max(now.gates.length, saved.gates.length);
  for (let i = 0; i < count; i++) {
    const a = now.gates[i];
    const b = saved.gates[i];
    if (!same(a, b)) {
      play.push(
        `gate ${a?.key ?? b?.key ?? i}: ${JSON.stringify(a ?? null)} vs saved ${JSON.stringify(b ?? null)}`,
      );
    }
  }
  return { setup, play: play.slice(0, 10) };
}

const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};

const args = simArgs();
const hours = Number(args.get("hours") ?? 4);
if (!(hours > 0)) fail(`--hours takes the play's hours: --hours=4 (got "${args.get("hours")}")`);
const seed = args.get("seed") ?? "sim";
const quality = args.get("quality") ?? "exact";
if (!Object.hasOwn(SIM_QUALITY, quality)) {
  fail(`--quality is exact, quick or rough (got "${quality}")`);
}
const out = args.get("out");
const compare = args.get("compare");
let saved: Fingerprint | undefined;
if (compare !== undefined) {
  try {
    saved = JSON.parse(readFileSync(compare, "utf8")) as Fingerprint;
  } catch (e) {
    fail(`--compare: cannot read ${compare}: ${(e as Error).message}`);
  }
}

/** A Monday, 08:00 local: the play starts here. */
const START = new Date(2026, 0, 5, 8, 0, 0).getTime();
const limitMs = hours * HOUR;
const q = quality as SimQuality;

const world = createSimWorld((now) => simStore(game, now, seed), START, { quality: q });
const state = () => world.store.getState() as unknown as GameState;
const coins = (): Decimal => state().wallet[MAIN];
const auto = autoPlayer<GameState>(game);
const have = holdings([MAIN], () => coins());

// One gate every half hour of play; each is priced at what the pilot held of the coins when its minute came.
const gates: FitGate[] = Array.from({ length: Math.round(hours * 2) }, (_, i) => ({
  key: `g${String(i + 1).padStart(2, "0")}`,
  atMs: (i + 1) * GATE_EVERY_MS,
  price: () => nicePrice(have.held(MAIN)),
}));

let bought = 0;
let steps = 0;
const started = performance.now();
const result = runFit({
  table: fitTable(),
  gates,
  step: (dt) => world.play(dt),
  look: () => {
    bought += auto.look(world.store as never).bought;
  },
  afterStep: () => {
    steps++;
    have.sample();
  },
  playedMs: () => world.now() - START,
  done: () => false,
  limitMs,
  quality: q,
});
const wallMs = performance.now() - started;

const final = coins();
const fp: Fingerprint = {
  hours,
  seed,
  quality: q,
  bought,
  coinsLog10: Number((final.gt(0) ? final.log10().toNumber() : 0).toFixed(6)),
  gates: result.gates,
};

const wall = `${(wallMs / 1000).toFixed(2)} s wall`;
const perStep = `${(wallMs / steps).toFixed(3)} ms/step`;
const perHour = `${(wallMs / hours).toFixed(1)} ms/sim-hour`;
console.log(
  `bench:heavy: ${hours} h, seed ${seed}, ${quality}, ${steps} steps, ${wall}, ${perStep}, ${perHour}, ${bought} purchases`,
);

if (out !== undefined) {
  writeFileSync(out, `${JSON.stringify(fp, null, 2)}\n`);
  console.log(`fingerprint written: ${out}`);
}

if (saved !== undefined) {
  const { setup, play } = compareFingerprints(fp, saved);
  if (setup.length > 0) {
    console.error(`setup differs (not the same run):\n  ${setup.join("\n  ")}`);
    process.exit(2);
  }
  if (play.length > 0) {
    console.log(`fingerprint differs:\n  ${play.join("\n  ")}`);
    process.exit(1);
  }
  console.log("fingerprint: identical");
}
