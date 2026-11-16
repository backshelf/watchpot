import {
  D,
  type Decimal,
  defineFeature,
  defineGame,
  type Move,
  nextFloat,
  type RngState,
  type StateOf,
} from "watchpot/core";
import {
  autoPlayer,
  createSimWorld,
  decodeSnapshot,
  encodeSnapshot,
  type FitGate,
  type FitProofModule,
  type FitRun,
  fitTable,
  fitTableSource,
  fmtClock,
  formatProfile,
  type HoldingsMemory,
  holdings,
  latestSnapshot,
  priceAbove,
  profileSim,
  proveFit,
  proveFitParallel,
  resumeSimWorld,
  runFit,
  type SimSnapshot,
  simArgs,
  simStore,
  timeSteps,
} from "watchpot/sim";

/**
 * The fit kit on a toy pottery: wheels throw clay, and four glazes (the plan's gates) each double what the wheels
 * throw. A kiln step draws from an rng kept in the state, so a run that lost its place in the rng would part at once.
 *
 * The script fits the plan with a snapshot every five played minutes, carries a second fit on from one of them as a
 * script's `--from` would, proves the table (on one thread, or on workers with `--workers=<n>`, which import this very
 * file for its `fitProof`), profiles a stretch from a snapshot, and prints the table module a game would commit.
 *
 *   bun docs/examples/fit-kit.ts [--workers=2]
 */

const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 5, 8);

/** The plan: the minute each glaze should open. */
const PLAN = { slip: 2, ash: 5, celadon: 9, tenmoku: 14 } as const;
type Glaze = keyof typeof PLAN;
const GLAZES = Object.keys(PLAN) as Glaze[];

// ------------------------------------------------------------------------------------------------ the game

/** The live table: the game reads each glaze's price from it, and the fit prices each into it. */
const PRICES = fitTable<Glaze>();

const wheelCost = (wheels: number): Decimal => D(4).mul(D(1.25).pow(wheels));

const studio = defineFeature({
  key: "studio",
  initial: (ctx) => ({ clay: D(5), wheels: 1, glazes: [] as string[], kiln: [...ctx.rng], cracked: 0 }),
  derived: { perSecond: (s) => D(s.studio.wheels).mul(2 ** s.studio.glazes.length) },
  actions: (api) => ({
    buyWheel: (): boolean => {
      let ok = false;
      api.set((s) => {
        const cost = wheelCost(s.studio.wheels);
        if (s.studio.clay.lt(cost)) return;
        s.studio.clay = s.studio.clay.sub(cost);
        s.studio.wheels += 1;
        ok = true;
      });
      return ok;
    },
    buyGlaze: (id: Glaze): boolean => {
      let ok = false;
      api.set((s) => {
        const price = PRICES.get(id);
        if (s.studio.glazes.includes(id) || s.studio.clay.lt(price)) return;
        s.studio.clay = s.studio.clay.sub(price);
        s.studio.glazes.push(id);
        ok = true;
      });
      return ok;
    },
  }),
  steps: {
    produce: {
      throw: {
        pass: "both",
        run: (s, ctx) => {
          s.studio.clay = s.studio.clay.add(s.studio.perSecond.mul(ctx.dtMs / 1000));
        },
      },
    },
    settle: {
      fire: (s) => {
        const [x, next] = nextFloat(s.studio.kiln as unknown as RngState);
        s.studio.kiln = [...next];
        if (x < 0.02) {
          s.studio.clay = s.studio.clay.mul(0.97);
          s.studio.cracked += 1;
        }
      },
    },
  },
  moves: (s) => {
    const out: Move<typeof s>[] = [
      {
        id: "wheel",
        cost: { currency: "clay", amount: wheelCost(s.studio.wheels) },
        apply: (store) => store.getState().studio.buyWheel(),
      },
    ];
    for (const id of GLAZES)
      if (!s.studio.glazes.includes(id))
        out.push({
          id,
          cost: { currency: "clay", amount: PRICES.get(id) },
          apply: (store) => store.getState().studio.buyGlaze(id),
        });
    return out;
  },
});

const game = defineGame({ id: "pottery", save: { key: "pottery", version: 1 }, features: [studio] });
type State = StateOf<(typeof game)["features"]>;

// ------------------------------------------------------------------------------------------------ the run

/** What the run keeps besides the world and the player: the fit's holdings. */
interface Extra {
  have: HoldingsMemory;
}

/**
 * One run of the pottery, fresh or carried on from a snapshot. The fit, the proof and the profiler all play through
 * this, on the same steps, so the fit's run is the proof's replay.
 */
function potteryRun(from?: SimSnapshot<Extra>, build = game) {
  const store = (now: () => number) => simStore(build, now, "pottery");
  const world = from ? resumeSimWorld(store, from.world) : createSimWorld(store, T0);
  const player = autoPlayer<State>(game, {
    balance: (s) => s.studio.clay,
    objective: (s) => s.studio.perSecond.toNumber(),
    memory: from?.player,
  });
  const state = () => world.store.getState() as unknown as State;
  let played = from?.atMs ?? 0;
  const have = holdings(["clay"], () => state().studio.clay, { from: from?.extra?.have });
  const run: FitRun<Extra> = {
    step: (dt) => {
      world.play(dt);
      played += dt;
    },
    look: () => {
      player.look(world.store as never);
    },
    playedMs: () => played,
    afterStep: () => have.sample(),
    capture: () => ({ world: world.snapshot(), player: player.remember(), extra: { have: have.remember() } }),
  };
  /** Each glaze priced just above the most clay ever held, so nothing held before its minute pays it. */
  const gates: FitGate[] = GLAZES.map((key) => ({
    key,
    atMs: PLAN[key] * MIN,
    price: () => priceAbove(have.peak("clay")),
  }));
  return { world, player, state, run, gates, done: () => state().studio.glazes.length === GLAZES.length };
}

/** For `proveFitParallel`: each worker imports this file and replays its stretches through this. */
export const fitProof: FitProofModule<Extra> = { table: PRICES, replay: (from) => potteryRun(from).run };

/** A fit of the plan, from nothing or carried on from a snapshot, leaving a snapshot every five played minutes. */
function fit(from?: SimSnapshot<Extra>) {
  const r = potteryRun(from);
  return runFit({
    ...r.run,
    table: PRICES,
    gates: r.gates,
    done: r.done,
    limitMs: 30 * MIN,
    quality: "exact",
    snapshotEveryMs: 5 * MIN,
    from,
  });
}

// ------------------------------------------------------------------------------------------------ the script

export async function main(workers = 0): Promise<boolean> {
  // A fit from nothing. Its snapshots are plain data: a script writes `encodeSnapshot(s)` to a file of its choosing.
  const first = fit();
  if (!first.finished) return false;
  const disk = new Map(first.snapshots.map((s) => [s.atMs, encodeSnapshot(s)]));
  const table = PRICES.data();
  console.log(`fit: ${fmtClock(first.playedMs)} played, ${first.snapshots.length} snapshots`);

  // `--from=<minute>`: the latest snapshot at or before it, and a fit that carries on from there. It prices what a
  // fit from nothing would, and replays only the minutes after.
  const kept = [...disk.values()].map((text) => decodeSnapshot<Extra>(text));
  const from = latestSnapshot(kept, 12 * MIN);
  if (!from) return false;
  const second = fit(from);
  const same = JSON.stringify(PRICES.data()) === JSON.stringify(table);
  console.log(`fit from ${fmtClock(from.atMs)}: ${same ? "the same table" : "a different table"}`);

  // The proof: the finished table replayed between the snapshots must arrive at each exactly. A draft skips it.
  const proof =
    workers > 0
      ? await proveFitParallel({
          module: new URL(import.meta.url),
          table: PRICES.data(),
          marks: second.snapshots,
          start: from,
          workers,
        })
      : proveFit({ marks: second.snapshots, start: from, replay: (s) => potteryRun(s).run });
  console.log(
    `proof: ${proof.stretches} stretches${workers > 0 ? ` on ${workers} workers` : ""}, ${proof.failed.length === 0 ? "the replay is the fit's run" : proof.failed.join("\n")}`,
  );

  // The profiler: a stretch played from a snapshot, the look against the step and the game's steps by id.
  const timed = timeSteps(game, () => performance.now());
  const late = potteryRun(from, timed.game);
  const profile = profileSim({
    steps: 300,
    timer: () => performance.now(),
    look: late.run.look,
    step: () => late.run.step(1000),
    playedMs: late.run.playedMs,
    timed,
  });
  console.log(formatProfile(profile));

  console.log(
    fitTableSource(PRICES, {
      header: "Written by the fit. Never edit by hand: change the plan and fit again.",
      planImport: "./plan",
      keyType: "Glaze",
      order: GLAZES,
    }),
  );
  return same && proof.failed.length === 0;
}

if (import.meta.main && !(await main(Number(simArgs().get("workers") ?? 0)))) process.exit(1);
