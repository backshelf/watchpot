/**
 * Plan-and-fit: price each gate at what a pilot holds when its planned minute comes.
 *
 * A plan names the minute each gate should open. `runFit` shuts every gate in a live `fitTable`, plays the pilot, and
 * as each minute comes asks the gate for a price; the first price it gives goes into the table, and the run carries on
 * with it, payable at once. One pass prices the game. What a gate measures and how it rounds stays the game's: the
 * loop calls `price()` and writes what it returns.
 *
 * With `capture` the fit leaves snapshots as it goes (every `snapshotEveryMs` of play, and one where it ends): a later
 * fit carries on from one (`from`) instead of playing from nothing, and the proof (`proveFit`) replays the finished
 * table between them.
 */

import { D, Decimal } from "../core";
import { fmtClock } from "./print";
import {
  type SimSnapshot,
  SNAPSHOT_FORMAT,
  type SnapshotParts,
  snapshotCadence,
  snapshotDiff,
} from "./snapshot";
import type { FitTable, FitTableData } from "./table";
import { markdownTable } from "./timeline";
import { SIM_QUALITY, type SimQuality } from "./world";

const NICE_STEPS: readonly number[] = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
const EPS = 1e-9;

/**
 * A price a player can read, never above `x`: null below 1 or not finite, whole below 100, else rounded down to two
 * figures off `steps` (ascending, from 1), written out below a million and as `<step>e<exponent>` from there.
 */
export function nicePrice(x: Decimal, steps: readonly number[] = NICE_STEPS): string | null {
  if (!x.isFinite() || x.lt(1)) return null;
  if (x.lt(100)) return String(Math.floor(x.toNumber()));
  const e = Math.floor(x.log10().toNumber() + EPS);
  const m = x.div(Decimal.pow(10, e)).toNumber();
  const step = steps.findLast((s) => s <= m + EPS) ?? 1;
  return e < 6 ? String(Math.round(step * 10 ** e)) : `${step}e${e}`;
}

/**
 * A price a player can read, strictly above `x`: what nothing held up to now pays, so a replay on the finished table
 * cannot open the gate sooner than the fit did (the price `proveFit` passes). "1" below 1, the next whole number below
 * 100, else two figures rounded up, written out below a million and as `<m>e<exponent>` from there.
 */
export function priceAbove(x: Decimal): string {
  if (!x.isFinite()) throw new Error(`priceAbove: ${x.toString()} has no price above it`);
  if (x.lt(1)) return "1";
  if (x.lt(100)) return String(Math.floor(x.toNumber() + EPS) + 1);
  const e = Math.floor(x.log10().toNumber() + EPS);
  let m = Math.floor(x.div(Decimal.pow(10, e - 1)).toNumber() + EPS) + 1;
  const write = (): string =>
    m >= 100
      ? e + 1 < 6
        ? String(10 ** (e + 1))
        : `1e${e + 1}`
      : e < 6
        ? String(m * 10 ** (e - 1))
        : `${m / 10}e${e}`;
  while (D(write()).lte(x)) m += 1;
  return write();
}

// ------------------------------------------------------------------------------------------------ holdings

/** What holdings carry, as plain data: the window, the peaks and the ratchets' bars, by the order they were made. */
export interface HoldingsMemory {
  readonly trail: Readonly<Record<string, readonly Decimal[]>>;
  readonly peaks: Readonly<Record<string, Decimal>>;
  readonly bars: readonly (Decimal | null)[];
}

/** Options for `holdings`: the window and where to carry on from. */
export interface HoldingsOptions {
  /** How many samples are kept per ref. Default 90. */
  window?: number;
  /** What earlier holdings remembered (`remember()`): these carry on from it. */
  from?: HoldingsMemory;
}

/** What a pilot has held of each ref: a window of recent samples and the peak ever seen. */
export interface Holdings<R extends string> {
  /** Reads every ref once and keeps it (call it once a step, in `afterStep`). */
  sample(): void;
  /** The most held in the last `last` samples (default: the whole window); 0 before any sample. */
  held(ref: R, last?: number): Decimal;
  /** The most ever sampled; 0 before any sample. */
  peak(ref: R): Decimal;
  /**
   * A check that fixes its bar at `peak(ref) × margin` on its first call and is true once `held(ref)` reaches it:
   * a price set after it passes is above anything held before, whatever was reset in between. Ratchets are
   * remembered by the order they are made, so a fit carried on from a snapshot makes them in the same order.
   */
  ratchet(ref: R, margin?: number): () => boolean;
  /** Everything they carry, to keep in a snapshot's `extra` and pass back as `from`. */
  remember(): HoldingsMemory;
}

/** Holdings over `refs`, read through `read`, keeping the last `window` samples (default 90). */
export function holdings<R extends string>(
  refs: readonly R[],
  read: (ref: R) => Decimal,
  { window = 90, from }: HoldingsOptions = {},
): Holdings<R> {
  const trail = new Map<R, Decimal[]>(refs.map((r) => [r, [...(from?.trail[r] ?? [])]]));
  const peaks = new Map<R, Decimal>(
    refs.flatMap((r) => {
      const p = from?.peaks[r];
      return p ? [[r, p] as const] : [];
    }),
  );
  const bars: (Decimal | null)[] = [];
  const held = (ref: R, last = window): Decimal =>
    (trail.get(ref) ?? []).slice(-Math.max(1, last)).reduce((a, b) => Decimal.max(a, b), D(0));
  return {
    sample() {
      for (const ref of refs) {
        const now = read(ref);
        const list = trail.get(ref);
        list?.push(now);
        if (list && list.length > window) list.shift();
        if (now.gt(peaks.get(ref) ?? 0)) peaks.set(ref, now);
      }
    },
    held,
    peak: (ref) => peaks.get(ref) ?? D(0),
    ratchet(ref, margin = 1.34) {
      const i = bars.length;
      bars.push(from?.bars[i] ?? null);
      return () => {
        const bar = bars[i] ?? (peaks.get(ref) ?? D(0)).mul(margin);
        bars[i] = bar;
        return held(ref).gte(bar);
      };
    },
    remember: () => ({
      trail: Object.fromEntries([...trail].map(([r, list]) => [r, [...list]])),
      peaks: Object.fromEntries(peaks),
      bars: [...bars],
    }),
  };
}

// ------------------------------------------------------------------------------------------------ the fit

/** A gate in the plan. The loop shuts it and writes its price into the table; the game says what the price is. */
export interface FitGate {
  /** The plan's key for the gate; the table's key. */
  readonly key: string;
  /** The planned minute, in ms of play. */
  readonly atMs: number;
  /**
   * The gate's price now, if it can be priced now (a figure Decimal reads; text after a space is a note for the
   * report, never the table); null to be asked again next step.
   */
  price(): string | null;
}

/** A gate after the fit: when it opened and the value its `price()` gave, if it did. */
export interface FittedGate {
  readonly key: string;
  readonly atMs: number;
  openedMs?: number;
  value?: string;
}

/**
 * A run a fit plays, or a proof replays: the game's step and pilot, its played clock, and (to leave snapshots) what
 * it holds now.
 */
export interface FitRun<X = unknown> {
  /** Advances the game `dtMs`. */
  step(dtMs: number): void;
  /** One look by the pilot: buys what it would buy. */
  look(): void;
  /** Ms of play so far. */
  playedMs(): number;
  /** After each step, before the gates are asked (sample the holdings here). */
  afterStep?(): void;
  /**
   * The run's part of a snapshot now: `world.snapshot()`, the auto-player's memory, and the game's own `extra`. Given,
   * the fit leaves snapshots and can be proved.
   */
  capture?(): SnapshotParts<X>;
}

/** What `runFit` plays: the table, the gates, the run, the clock, and where to start. */
export interface FitOptions<X = unknown> extends FitRun<X> {
  /** The live table the game reads its prices from: the fit shuts every gate in it and prices each into it. */
  table: FitTable;
  gates: readonly FitGate[];
  /** The game is finished. */
  done(): boolean;
  /** The run stops here, finished or not (ms of play). */
  limitMs: number;
  /** How finely the fit steps: the step length is the quality's (`SIM_QUALITY`). Default `"exact"`. */
  quality?: SimQuality;
  /** Ms per step, when a named quality will not do. Default: the quality's. */
  stepMs?: number;
  /** A look every this many steps. Default 3. */
  lookEvery?: number;
  /** With `capture`: a snapshot every this many ms of play (and always one where the run ends). */
  snapshotEveryMs?: number;
  /**
   * A snapshot to carry on from (one this fit's `capture` took, decoded). Build the run from it first (its world,
   * player and extra); the fit takes its own progress and table from it, prices only what was still unpriced there,
   * and plays on as if it had never stopped. Throws when the plan moved before it (`fitHolds`).
   */
  from?: SimSnapshot<X>;
}

/** A fit's own progress, kept in a snapshot it takes. */
export interface FitProgress {
  /** Steps played so far (the look cadence counts them). */
  readonly steps: number;
  readonly stepMs: number;
  readonly lookEvery: number;
  /** The plan as this fit had it: each gate's key and minute. */
  readonly plan: readonly (readonly [string, number])[];
  /** Every gate as it stood. */
  readonly gates: readonly FittedGate[];
  /** The table as it stood: what was priced by then. */
  readonly table: FitTableData;
}

/** A fit's outcome: the gates in plan order, whether it finished with every gate open, its length and its snapshots. */
export interface FitResult<X = unknown> {
  gates: FittedGate[];
  finished: boolean;
  playedMs: number;
  /** With `capture`: the snapshots taken, in order, the last where the run ended. */
  snapshots: SimSnapshot<X>[];
}

/**
 * Whether a fit can carry on from a snapshot under this plan: the gates it had planned up to its moment must be the
 * gates planned up to it now, at the same minutes. The reasons it cannot, empty when it can.
 */
export function fitHolds(snapshot: SimSnapshot, gates: readonly FitGate[]): string[] {
  const fit = snapshot.fit;
  if (!fit) return ["the snapshot was not taken by a fit"];
  const by = snapshot.atMs;
  const then = new Map(fit.plan.filter(([, at]) => at <= by));
  const now = new Map(gates.filter((g) => g.atMs <= by).map((g) => [g.key, g.atMs] as const));
  const out: string[] = [];
  for (const [key, at] of now)
    if (then.get(key) !== at)
      out.push(`"${key}" is planned at ${fmtClock(at)}, before the snapshot, and was not then`);
  for (const [key, at] of then)
    if (now.get(key) !== at)
      out.push(`"${key}" was planned at ${fmtClock(at)}, before the snapshot, and is not now`);
  return out;
}

/**
 * Prices a game in one pass. Shuts every gate in the table, orders them by `atMs` (the plan's order between equals),
 * then steps: with `capture`, a snapshot first when one is due; every `lookEvery`th step `look()`, `step(stepMs)`,
 * `afterStep()`, then each unopened gate whose minute has come is asked `price()`, and a figure goes into the table
 * and opens it at `playedMs()`. Ends on `done()` or at `limitMs`.
 */
export function runFit<X = unknown>(options: FitOptions<X>): FitResult<X> {
  const { table, gates, step, look, playedMs, done, limitMs, afterStep, capture, from } = options;
  const stepMs = options.stepMs ?? SIM_QUALITY[options.quality ?? "exact"];
  const lookEvery = Math.max(1, options.lookEvery ?? 3);
  const order = gates.toSorted((a, b) => a.atMs - b.atMs);
  const fitted: FittedGate[] = order.map((g) => ({ key: g.key, atMs: g.atMs }));
  let steps = 0;

  if (from) {
    const problems = fitHolds(from as SimSnapshot, gates);
    if (problems.length > 0)
      throw new Error(
        `runFit: cannot carry on from the snapshot at ${fmtClock(from.atMs)}: ${problems.join("; ")}`,
      );
    const fit = from.fit as FitProgress;
    if (fit.stepMs !== stepMs || fit.lookEvery !== lookEvery)
      throw new Error(
        `runFit: the snapshot was taken stepping ${fit.stepMs} ms with a look every ${fit.lookEvery} steps, not ${stepMs} and ${lookEvery}`,
      );
    steps = fit.steps;
    table.load(fit.table);
    const was = new Map(fit.gates.map((g) => [g.key, g]));
    fitted.forEach((f, i) => {
      const old = was.get(f.key);
      if (old?.openedMs !== undefined) fitted[i] = { ...old };
    });
  }
  for (const [i, g] of order.entries()) if (fitted[i]?.openedMs === undefined) table.set(g.key, null);

  const plan = order.map((g) => [g.key, g.atMs] as const);
  const snapshots: SimSnapshot<X>[] = [];
  const take = (): void => {
    if (!capture) return;
    const at = playedMs();
    if (snapshots.at(-1)?.atMs === at) return;
    snapshots.push({
      format: SNAPSHOT_FORMAT,
      atMs: at,
      ...capture(),
      fit: { steps, stepMs, lookEvery, plan, gates: fitted.map((f) => ({ ...f })), table: table.data() },
    });
  };
  const cadence =
    capture && options.snapshotEveryMs ? snapshotCadence(options.snapshotEveryMs, from?.atMs ?? 0) : null;

  for (; playedMs() < limitMs && !done(); steps++) {
    if (cadence?.due(playedMs())) take();
    if (steps % lookEvery === 0) look();
    step(stepMs);
    afterStep?.();
    const now = playedMs();
    order.forEach((g, i) => {
      const f = fitted[i];
      if (!f || f.openedMs !== undefined || g.atMs > now) return;
      const value = g.price();
      if (value === null) return;
      table.set(g.key, priceOf(value));
      f.openedMs = now;
      f.value = value;
    });
  }
  take();
  return {
    gates: fitted,
    finished: done() && fitted.every((g) => g.openedMs !== undefined),
    playedMs: playedMs(),
    snapshots,
  };
}

/** The price in a gate's value: its first word, without the note. */
const priceOf = (value: string): string => value.split(" ")[0] ?? value;

/** The fit's report: a markdown table of gate, planned minute, the minute it opened (or "never"), and its value. */
export function formatFit(result: Pick<FitResult, "gates">): string {
  return markdownTable(
    ["gate", "planned", "opened", "price"],
    result.gates.map((g) => [
      g.key,
      fmtClock(g.atMs),
      g.openedMs === undefined ? "never" : fmtClock(g.openedMs),
      g.value ?? "",
    ]),
  );
}

// ------------------------------------------------------------------------------------------------ the proof

/** A proof's outcome: how many stretches it replayed, and a line for each that parted from the fit's run. */
export interface FitProof {
  stretches: number;
  failed: string[];
}

/** One stretch of a proof: from a snapshot (undefined: from nothing) to the next. */
export interface ProofStretch<X = unknown> {
  readonly from: SimSnapshot<X> | undefined;
  readonly to: SimSnapshot<X>;
}

/** The stretches a proof replays: from `start` (or nothing) to the first mark, and from each mark to the next. */
export function proofStretches<X>(
  marks: readonly SimSnapshot<X>[],
  start?: SimSnapshot<X>,
): ProofStretch<X>[] {
  return marks.map((to, i) => ({ from: i === 0 ? start : marks[i - 1], to }));
}

/**
 * Replays one stretch on the table as it stands: `replay` builds a run from the stretch's start (from nothing when
 * there is none) and plays it, on the fit's own steps and looks, to the end's moment; the stretch holds when the run
 * then is the snapshot (its world, its player, and its `extra` when the replay captures one). The differences, empty
 * when it holds.
 */
export function replayStretch<X>(
  stretch: ProofStretch<X>,
  replay: (from: SimSnapshot<X> | undefined) => FitRun<X>,
): string[] {
  const { from, to } = stretch;
  const fit = to.fit;
  if (!fit) throw new Error("proveFit: a mark was not taken by a fit");
  const run = replay(from);
  let steps = from?.fit?.steps ?? 0;
  while (run.playedMs() < to.atMs) {
    if (steps % fit.lookEvery === 0) run.look();
    run.step(fit.stepMs);
    run.afterStep?.();
    steps++;
  }
  if (!run.capture) throw new Error("proveFit: the replay has no `capture`, so there is nothing to compare");
  const got = run.capture();
  const want: SnapshotParts<X> = { world: to.world, player: to.player, extra: to.extra };
  if (got.extra === undefined) delete want.extra;
  const found = snapshotDiff(
    { steps, playedMs: run.playedMs(), ...got },
    { steps: fit.steps, playedMs: to.atMs, ...want },
  );
  return found.length > 0 ? [`to ${fmtClock(to.atMs)}: ${found.join(" · ")}`] : [];
}

/**
 * The fit's proof, on one thread: replays the finished table from where the fit started (`start`, or nothing) to the
 * first snapshot it left (`result.snapshots`), then from each to the next, and checks each stretch arrives exactly
 * where the fit's run stood. Stretch by stretch, that is the whole replay: a replay that is the fit's run again means
 * no gate could be paid before the fit priced it, so the table plays as planned. Each stretch starts from its own
 * snapshot, so one fault is one line.
 *
 * Leave the table holding the fit's result (it does, after `runFit`). For the same proof on several workers, see
 * `proveFitParallel`.
 */
export function proveFit<X>(options: {
  marks: readonly SimSnapshot<X>[];
  start?: SimSnapshot<X>;
  replay(from: SimSnapshot<X> | undefined): FitRun<X>;
}): FitProof {
  const stretches = proofStretches(options.marks, options.start);
  if (stretches.length === 0) throw new Error("proveFit: no marks: give runFit a `capture`");
  return {
    stretches: stretches.length,
    failed: stretches.flatMap((s) => replayStretch(s, options.replay)),
  };
}
