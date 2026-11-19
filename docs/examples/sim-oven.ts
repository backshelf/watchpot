import {
  costAt,
  D,
  type Decimal,
  defineCurrencies,
  defineFeature,
  defineGame,
  defineKnobs,
  type Move,
  type StateOf,
  vocab,
} from "watchpot/core";
import {
  type Axis,
  activeSchedule,
  atMost,
  autoPlayer,
  createSimWorld,
  type DeskRun,
  defineDesk,
  type FitGate,
  type FitRun,
  fitHolds,
  fitTable,
  fixedSchedule,
  fmtClock,
  formatFit,
  grid,
  type Holdings,
  type HoldingsMemory,
  holdings,
  judge,
  latestSnapshot,
  nicePrice,
  nominalWakeHour,
  planDay,
  priceAbove,
  proveFit,
  resumeSimWorld,
  rngFor,
  runFit,
  type Schedule,
  type SimSnapshot,
  simStore,
  table,
  type Verdict,
} from "watchpot/sim";

/**
 * The sim section's game: an oven with a fire under it, a shelf of three fittings and an almanac, priced by a plan.
 * Bubbles grow with the burners; each fitting on the shelf doubles what they make; the almanac pays the whole time the
 * tab is closed instead of half. The plan says the played minute each fitting should open, and `runFit` prices each one
 * at what the pilot holds when its minute comes.
 *
 *   bun docs/examples/sim-oven.ts
 */

const MIN = 60_000;
const HOUR = 60 * MIN;

/** The fixed start: the sim owns its clock and never reads the wall. */
export const START = Date.UTC(2026, 0, 5, 8);

/** The plan: the played minute each fitting should open at. It is pacing as intent, for a player paying attention. */
export const PLAN = { bellows: 1, hood: 2, jacket: 4 } as const;
export type Fitting = keyof typeof PLAN;
/** Every gate, in the plan's order. */
export const FITTINGS = Object.keys(PLAN) as Fitting[];
/** The plan's last minute: a run that finishes near it is on the plan. */
export const LAST_MIN: number = Math.max(...Object.values(PLAN));

/** The minute a later fit carries on from: one of the snapshots the first fit left, one a played minute. */
export const AT_MIN = 2;

/** The live table: the game reads every fitting's price from it, and the fit writes each price into it. */
export const PRICES = fitTable<Fitting>();

/** How much of the time away the oven pays: half, unless the almanac is in. */
export const AWAY_SHARE = 0.5;
/** The longest absence that pays at all: two hours. */
export const AWAY_CAP_MS = 2 * HOUR;

/** What one fitting multiplies the burners' pay by. */
export const FITTING_HEAT = 2;

/** The almanac: an unlock that pays the whole time away. */
export const ALMANAC_COST = 40;
/** What the pilot thinks the almanac is worth. The objective cannot see it, so the move states it. */
export const ALMANAC_WORTH = 5;

/** The first burner costs 10 bubbles, each one after 15% more than the last. */
export const BURNER_COST = { base: 10, growth: 1.15 } as const;
export const burnerPrice = (owned: number): Decimal => costAt(BURNER_COST, owned);

/** A player at the game the whole time, a look every ten seconds: every hour of the run is a played hour. */
export const ACTIVE = activeSchedule(10);

/** The numbers a sim may turn: how much of the time away the oven pays, read where the step needs it. */
export const KNOBS = defineKnobs({
  awayShare: { value: AWAY_SHARE, label: "Time away pays", group: "the oven", min: 0, max: 1, step: 0.05 },
});

/**
 * Someone who checks in: a handful of sessions a day of a few minutes each, a look every minute or so, the tab closed
 * in between and overnight. Every figure is drawn from the seed's behaviour stream.
 */
export const CHECKER: Schedule = {
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

// ------------------------------------------------------------------------------------------------ the game

/** The game's words: one currency. */
export const WORDS = vocab({ currencies: ["bubbles"] });

/** The wallet: `s.wallet.bubbles`, every bubble credited since the run began. */
export const wallet = defineCurrencies({ key: "wallet", vocab: WORDS });

/** The oven: the burners, the shelf of fittings, the almanac, and the rate they make together. */
export const oven = defineFeature({
  key: "oven",
  reach: [wallet],
  initial: () => ({ burners: 1, fittings: [] as string[], almanac: false }),
  derived: {
    // What the burners make a second: one each, times two for every fitting on the shelf.
    perSecond: (s) => D(s.oven.burners).mul(D(FITTING_HEAT).pow(s.oven.fittings.length)),
  },
  actions: (api) => ({
    buyBurner: (): boolean =>
      api.set((s) => {
        if (!wallet.draft.debit(s, "bubbles", burnerPrice(s.oven.burners))) return false;
        s.oven.burners += 1;
        return true;
      }),
    buyFitting: (id: Fitting): boolean =>
      api.set((s) => {
        if (s.oven.fittings.includes(id)) return false;
        // A gate the fit has not priced yet costs `BLOCKED`: nothing unfitted is payable.
        if (!wallet.draft.debit(s, "bubbles", PRICES.get(id))) return false;
        s.oven.fittings.push(id);
        return true;
      }),
    buyAlmanac: (): boolean =>
      api.set((s) => {
        if (s.oven.almanac || !wallet.draft.debit(s, "bubbles", D(ALMANAC_COST))) return false;
        s.oven.almanac = true;
        return true;
      }),
  }),
  steps: {
    produce: {
      simmer: {
        pass: "tick",
        run: (s, ctx) => wallet.draft.credit(s, "bubbles", s.oven.perSecond.mul(ctx.dtMs / 1000)),
      },
      away: {
        pass: "catchUp",
        run: (s, ctx) => {
          const share = s.oven.almanac ? 1 : KNOBS.get("awayShare");
          wallet.draft.credit(
            s,
            "bubbles",
            s.oven.perSecond.mul((Math.min(ctx.dtMs, AWAY_CAP_MS) * share) / 1000),
          );
        },
      },
    },
  },
  // What the sim's auto-player may do now. A fitting costs what the fit table says; a move with no `worth` is worth
  // what it adds to the objective (the oven's rate), and the almanac states its own.
  moves: (s) => {
    const out: Move<typeof s>[] = [
      {
        id: "burner",
        cost: { currency: "bubbles", amount: burnerPrice(s.oven.burners) },
        apply: (store) => store.getState().oven.buyBurner(),
      },
    ];
    for (const id of FITTINGS)
      if (!s.oven.fittings.includes(id))
        out.push({
          id,
          cost: { currency: "bubbles", amount: PRICES.get(id) },
          apply: (store) => store.getState().oven.buyFitting(id),
        });
    if (!s.oven.almanac)
      out.push({
        id: "almanac",
        cost: { currency: "bubbles", amount: D(ALMANAC_COST) },
        worth: () => ALMANAC_WORTH,
        apply: (store) => store.getState().oven.buyAlmanac(),
      });
    return out;
  },
});

export const game = defineGame({
  id: "oven",
  save: { key: "oven.save", version: 1 },
  vocab: WORDS,
  features: [wallet, oven],
});

export type OvenState = StateOf<(typeof game)["features"]>;

/** What the run keeps besides the world and the player: the holdings a gate is priced from. */
export interface Extra {
  have: HoldingsMemory;
}

/**
 * What a gate costs: strictly above the most ever held, so nothing the pilot held before its minute can pay it. This is
 * the rounding the proof passes.
 */
export const abovePeak = (have: Holdings<"bubbles">): string => priceAbove(have.peak("bubbles"));

/**
 * The other way to round a price: nine tenths of what was held lately, so the pilot pays it within moments. A table
 * priced this way can be paid before its minute in a replay, and the proof says so.
 */
export const payNow = (have: Holdings<"bubbles">): string | null => nicePrice(have.held("bubbles").mul(0.9));

/** The plan's gates: each at its minute, priced from what the pilot holds then. */
export function gatesOf(have: Holdings<"bubbles">): FitGate<Fitting>[] {
  return FITTINGS.map((key) => ({
    key,
    atMs: PLAN[key] * MIN,
    price: () => abovePeak(have),
  }));
}

// ------------------------------------------------------------------------------------------------ the run

/**
 * One run of the oven, fresh or carried on from a snapshot: the world, the pilot, the holdings and the plan's gates.
 * The fit, the proof and the resume all play through this, so a resumed run is the run that took it.
 */
export function ovenRun(from?: SimSnapshot<Extra>) {
  const build = (now: () => number) => simStore(game, now, "oven");
  const world = from ? resumeSimWorld(build, from.world) : createSimWorld(build, START);
  const player = autoPlayer<OvenState>(game, {
    objective: (s) => s.oven.perSecond.toNumber(),
    memory: from?.player,
  });
  const state = () => world.store.getState() as unknown as OvenState;
  let played = from?.atMs ?? 0;
  const have = holdings(["bubbles"], () => state().wallet.bubbles, { from: from?.extra?.have });
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
    capture: () => ({
      world: world.snapshot(),
      player: player.remember(),
      extra: { have: have.remember() },
    }),
  };
  // Each gate is priced above the most ever held, so nothing the pilot held before its minute can pay it.
  const gates = gatesOf(have);
  return {
    world,
    player,
    state,
    have,
    run,
    gates,
    done: () => state().oven.fittings.length === FITTINGS.length,
  };
}

/** Prices the plan in one pass. With `snapshots`, it leaves one every played minute for a later fit to carry on from. */
export function fitPlan({
  from,
  snapshots = false,
}: {
  from?: SimSnapshot<Extra>;
  snapshots?: boolean;
} = {}) {
  const r = ovenRun(from);
  return runFit({
    ...r.run,
    table: PRICES,
    gates: r.gates,
    done: r.done,
    limitMs: LAST_MIN * 2 * MIN,
    quality: "exact",
    ...(snapshots && { snapshotEveryMs: MIN }),
    from,
  });
}

/** The report's longest wait: the biggest gap between two gates opening, the run's start included. */
export function longestWait(gates: readonly { atMs: number; openedMs?: number }[]): {
  from: number;
  to: number;
  ms: number;
} {
  const marks = [0, ...gates.filter((g) => g.openedMs !== undefined).map((g) => g.openedMs as number)].sort(
    (a, b) => a - b,
  );
  let best = { from: 0, to: 0, ms: 0 };
  for (let i = 1; i < marks.length; i++) {
    const ms = (marks[i] as number) - (marks[i - 1] as number);
    if (ms > best.ms) best = { from: marks[i - 1] as number, to: marks[i] as number, ms };
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ the pilot

/**
 * What one look buys: the pilot on the oven with 60 bubbles in hand, the shelf shut and the almanac still to unlock.
 * `moves` names what it took, in the order it took them.
 */
export function lookOnce(): {
  bought: number;
  moves: string[];
  burners: number;
  almanac: boolean;
  bubbles: string;
} {
  const world = createSimWorld((now) => simStore(game, now, "look"), START);
  world.store.getState().wallet.credit("bubbles", 60);
  const player = autoPlayer<OvenState>(game, { objective: (s) => s.oven.perSecond.toNumber() });
  const result = player.look(world.store as never);
  const s = world.store.getState() as unknown as OvenState;
  const moves: string[] = [];
  if (s.oven.almanac) moves.push("the almanac");
  if (s.oven.burners > 1)
    moves.push(`${s.oven.burners - 1} ${s.oven.burners - 1 === 1 ? "burner" : "burners"}`);
  return {
    bought: result.bought,
    moves,
    burners: s.oven.burners,
    almanac: s.oven.almanac,
    bubbles: s.wallet.bubbles.toFixed(0),
  };
}

/** A day from 08:00 under three schedules: what is played of the 24 hours, and what is waited. */
export function dayOf(which: "active" | "evening" | "checker"): {
  label: string;
  sessions: number;
  playedHours: number;
  waitedHours: number;
  looks: number;
} {
  const schedule: Schedule =
    which === "active" ? ACTIVE : which === "evening" ? fixedSchedule(8, 23, 15, 0) : CHECKER;
  const sessions = planDay(rngFor("oven", "day"), schedule, 0, 1, START + nominalWakeHour(ACTIVE) * HOUR);
  const attendMs = sessions.reduce((sum, s) => sum + s.attendMs, 0);
  const looks = sessions.reduce((sum, s) => sum + Math.max(1, Math.round(s.attendMs / s.lookEveryMs)), 0);
  return {
    label: which === "active" ? "All day" : which === "evening" ? "08:00 to 23:00" : "A checker",
    sessions: sessions.length,
    playedHours: attendMs / HOUR,
    waitedHours: 24 - attendMs / HOUR,
    looks,
  };
}

// ------------------------------------------------------------------------------------------------ the cache

/** Which gate the plan moved, and to which minute: the change a snapshot is asked to carry. */
export type PlanMove = { key: Fitting; minute: number } | null;

/**
 * What a snapshot is worth after a change: whether the plan still holds, and, when it does, where a fit carried on
 * from it starts and ends. `atMs` is the minute the snapshot was taken at; `move` is the gate the reader moved, if any.
 */
export function cacheStory(
  move: PlanMove = null,
  atMs = AT_MIN * MIN,
): {
  atMs: number;
  taken: number;
  holds: string[];
  carriedFrom: number | null;
  carriedTo: string | null;
  freshTo: string;
  sameTable: boolean | null;
  table: Record<string, string>;
  snaps: { atMs: number; gates: number }[];
} {
  const first = fitPlan({ snapshots: true });
  const freshTo = fmtClock(first.playedMs);
  const firstTable = JSON.stringify(sorted(PRICES.data()));
  const snaps = first.snapshots.map((s) => ({
    atMs: s.atMs,
    gates: s.fit?.gates.filter((g) => g.openedMs !== undefined).length ?? 0,
  }));
  const snapshot = latestSnapshot(first.snapshots, atMs) as SimSnapshot<Extra> | undefined;
  const blank = {
    atMs,
    taken: snaps.length,
    carriedFrom: null,
    carriedTo: null,
    freshTo,
    sameTable: null,
    table: {},
    snaps,
  };
  if (!snapshot) return { ...blank, holds: [] };

  // The run the snapshot carries, with the reader's move in its gates.
  const base = ovenRun(snapshot);
  const gates = base.gates.map((g) =>
    move !== null && move.key === g.key ? { ...g, atMs: move.minute * MIN } : g,
  );
  // The table a carried fit starts from is the snapshot's: the fit shut every gate before it and wrote each price.
  PRICES.load({});
  const holds = fitHolds(snapshot, gates);
  if (holds.length > 0) return { ...blank, holds };
  const second = runFit({
    ...base.run,
    table: PRICES,
    gates,
    done: base.done,
    limitMs: Math.max(LAST_MIN, move?.minute ?? 0) * 2 * MIN,
    quality: "exact",
    from: snapshot,
  });
  const table = PRICES.data() as Record<string, string>;
  return {
    ...blank,
    holds,
    carriedFrom: snapshot.atMs,
    carriedTo: fmtClock(second.playedMs),
    sameTable: move === null ? JSON.stringify(sorted(table)) === firstTable : null,
    table,
  };
}

/** A table's data with its keys in one order, for comparing two. */
const sorted = (data: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));

// ------------------------------------------------------------------------------------------------ the report

/** One timeline row: what the contract reads. `minutes` is played time since the run's start. */
interface Row {
  minutes: number;
  rate: number;
}

/** The minutes the contract judges: the plan's three gates, in its own unit. */
export const MARKS = [1, 2, 4] as const;

/** Played minutes since the run's start: the plan's unit, so the contract judges in minutes and says so. */
const byMinute = (minutes: (row: Row) => number): Axis<Row> => ({
  label: (at) => `minute ${at}`,
  covers: (row, at) => minutes(row) <= at,
  reached: (last, at) => minutes(last) >= at,
});

/**
 * The contract as data: what the oven makes a second at each planned minute, in a band. The bands are drawn around one
 * real run of this file (10, 50 and 156 a second) with room either side.
 */
export const CONTRACT = table(
  byMinute((r: Row) => r.minutes),
  { rate: { name: "Bubbles a second", read: (r: Row) => r.rate } },
  grid(
    [...MARKS],
    [
      [
        "rate",
        [
          [5, 20],
          [30, 70],
          [100, 220],
        ],
      ],
    ],
  ),
);

/**
 * The plan's own run again, on the finished table, read at each planned minute and judged against the contract. The
 * replay is the proof's: the same table, from nothing, looked at every third step.
 */
export function judgePlan(): { verdicts: Verdict[]; rows: Row[]; lastOnMin: number } {
  const r = ovenRun();
  const rows: Row[] = [];
  const marks = MARKS.map((m) => m * MIN);
  let next = 0;
  let had = 0;
  let lastOn = 0;
  for (let steps = 0; r.run.playedMs() < LAST_MIN * MIN + MIN; steps++) {
    if (steps % 3 === 0) r.run.look();
    r.run.step(1000);
    const now = r.run.playedMs();
    const s = r.state();
    // The minute a fitting goes on the shelf: what the plan promised, measured.
    if (s.oven.fittings.length > had) {
      had = s.oven.fittings.length;
      lastOn = now;
    }
    while (next < marks.length && now >= (marks[next] as number)) {
      rows.push({ minutes: (marks[next] as number) / MIN, rate: s.oven.perSecond.toNumber() });
      next++;
    }
  }
  const verdicts = judge(rows, CONTRACT);
  verdicts.push(atMost("Minutes to the last fitting", lastOn / MIN, LAST_MIN + 1));
  return { verdicts, rows, lastOnMin: lastOn / MIN };
}

/**
 * The report a desk prints: the fit's gates table, the longest wait between two gates opening, a pacing contract
 * judged on the same run played again, and the desk's own numbers.
 */
export function readReport(): {
  report: string;
  gates: { key: string; atMs: number; openedMs?: number; value?: string }[];
  finished: boolean;
  playedMs: number;
  wait: { from: number; to: number; ms: number };
  verdicts: Verdict[];
  lastOnMin: number;
  desk: {
    currency: string;
    hours: number;
    windowHours: number;
    seeds: { tuning: number; full: number };
    knobs: string[];
  };
} {
  const fit = fitPlan({ snapshots: true });
  const wait = longestWait(fit.gates);
  const judged = judgePlan();
  return {
    report: formatFit(fit),
    gates: fit.gates.map((g) => ({ key: g.key, atMs: g.atMs, openedMs: g.openedMs, value: g.value })),
    finished: fit.finished,
    playedMs: fit.playedMs,
    wait,
    verdicts: judged.verdicts,
    lastOnMin: judged.lastOnMin,
    desk: {
      currency: desk.currency,
      hours: desk.end.hours,
      windowHours: desk.windowHours,
      seeds: desk.seeds,
      knobs: Object.keys(desk.knobs.spec),
    },
  };
}

// ------------------------------------------------------------------------------------------------ the desk

/** The desk's contract: the game's words and knobs, where a run ends, and a fresh run for a seed. */
export const desk = defineDesk({
  vocab: WORDS,
  knobs: KNOBS,
  currency: "bubbles",
  source: ["docs/examples/sim-oven.ts"],
  end: { hours: 0.1 },
  fit: { quality: "exact" },
  run: ({ from }): DeskRun<"bubbles", Extra> => {
    const r = ovenRun(from as SimSnapshot<Extra> | undefined);
    return {
      ...r.run,
      table: PRICES,
      gates: r.gates,
      done: r.done,
      sample: () => ({
        currencies: { bubbles: r.state().wallet.bubbles },
        next: { burner: { currency: "bubbles", cost: burnerPrice(r.state().oven.burners) } },
      }),
    };
  },
});

// ------------------------------------------------------------------------------------------------ the script

if (import.meta.main) {
  const started = performance.now();
  const result = fitPlan({ snapshots: true });
  console.log(
    `${result.finished ? "finished" : "unfinished"} at ${fmtClock(result.playedMs)}, ${result.gates.length} gates`,
  );
  for (const g of result.gates)
    console.log(
      `  ${g.key} planned ${fmtClock(g.atMs)} opened ${g.openedMs === undefined ? "never" : fmtClock(g.openedMs)} at ${g.value}`,
    );
  const wait = longestWait(result.gates);
  console.log(`longest wait: ${fmtClock(wait.ms)} (${fmtClock(wait.from)} to ${fmtClock(wait.to)})`);
  const proof = proveFit({ marks: result.snapshots, replay: (from) => ovenRun(from).run });
  console.log(
    `proof: ${proof.stretches} stretches, ${proof.failed.length === 0 ? "the replay is the fit's run" : proof.failed.join(" | ")}`,
  );
  console.log(`fit and proof took ${(performance.now() - started).toFixed(0)} ms`);
  const judgedAt = performance.now();
  const judged = judgePlan();
  console.log(
    `judged in ${(performance.now() - judgedAt).toFixed(0)} ms, last fitting at ${judged.lastOnMin.toFixed(1)} min`,
  );
  for (const row of judged.rows) console.log(`  minute ${row.minutes.toFixed(0)}: rate ${row.rate}`);
  for (const v of judged.verdicts)
    console.log(`  ${v.ok ? "in" : "OUT"} ${v.name} ${v.value.toFixed(2)} target ${v.target}`);
  for (const move of [null, { key: "hood", minute: 1 }, { key: "jacket", minute: 5 }] as const) {
    const cache = cacheStory(move as PlanMove);
    console.log(
      `cache ${move === null ? "nothing moved" : `${move.key} to ${move.minute}`}: ${cache.taken} snapshots, holds ${cache.holds.length === 0 ? "yes" : cache.holds.join("; ")}`,
    );
    console.log(
      `  carried ${cache.carriedFrom === null ? "no" : `${fmtClock(cache.carriedFrom)} to ${cache.carriedTo}`}, same table: ${cache.sameTable}, table ${JSON.stringify(cache.table)}`,
    );
  }
  console.log(`look: ${JSON.stringify(lookOnce())}`);
  for (const which of ["active", "evening", "checker"] as const)
    console.log(`day ${which}: ${JSON.stringify(dayOf(which))}`);
}
