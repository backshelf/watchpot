/**
 * The contract DSL: a game's pacing targets as data, and the checks that read a timeline against them. A table is
 * bands (a metric's range at a position on an axis: hour 8 of play, the end of day 3) over the game's metrics; `judge`
 * reads each band off the latest row at or before its position. The other checks are verdicts built from the
 * combinators (`at`, `pairs`, `perRun`) and `check`. `tally` and `failing` read the same checks over several seeds.
 */

/** One check on one run. */
export interface Verdict {
  name: string;
  value: number;
  /** "2–3", "at most 35", or the rule in words. */
  target: string;
  ok: boolean;
  /** Reported but never failing a gate: the task that will make it hold. */
  todo?: string;
}

/** A verdict from its parts. */
export const check = (name: string, value: number, target: string, ok: boolean, todo?: string): Verdict => ({
  name,
  value,
  target,
  ok,
  ...(todo ? { todo } : {}),
});

/** In at or above `min`. */
export const atLeast = (name: string, value: number, min: number): Verdict =>
  check(name, value, `at least ${min}`, value >= min);

/** In at or below `max`. */
export const atMost = (name: string, value: number, max: number): Verdict =>
  check(name, value, `at most ${max}`, value <= max);

/** One quantity of a row, with the name a verdict gives it. */
export interface Metric<R> {
  readonly name: string;
  read(row: R): number;
}

/** Where on a run a band is read. */
export interface Axis<R> {
  /** The band's position in its verdict's name: `hour 8`, `day 3`. */
  label(at: number): string;
  /** Whether a row was taken at or before the position. */
  covers(row: R, at: number): boolean;
  /** Whether the run's last row got far enough for the band to be read at all. */
  reached(last: R, at: number): boolean;
}

/** Hours since a start (`hours` reads them off a row): a band at hour `h` reads the last row by then, once reached. */
export const byHour = <R>(hours: (row: R) => number): Axis<R> => ({
  label: (at) => `hour ${at}`,
  covers: (row, at) => hours(row) <= at,
  reached: (last, at) => hours(last) >= at,
});

/**
 * Calendar days since the first morning: a band at day `d` reads the last row by the end of that day, and is read
 * once the run got into the day.
 */
export const byDay = <R>(hours: (row: R) => number): Axis<R> => ({
  label: (at) => `day ${at}`,
  covers: (row, at) => hours(row) <= at * 24,
  reached: (last, at) => hours(last) > (at - 1) * 24,
});

/** A metric's range at one position. */
export interface Band<M extends string = string> {
  readonly metric: M;
  readonly at: number;
  readonly min: number;
  readonly max: number;
  /** Where the band is today's economy, not the target: the task that will tune it. Never fails a gate. */
  readonly todo?: string;
}

/**
 * A band, written as the p10 to p90 of the seeds it was measured on (or any floor and ceiling): `band("chapter",
 * { at: 3, p10: 5, p90: 6 })`.
 */
export function band<M extends string>(
  metric: M,
  { at, p10, p90, todo }: { at: number; p10: number; p90: number; todo?: string },
): Band<M> {
  return { metric, at, min: p10, max: p90, ...(todo ? { todo } : {}) };
}

/** A metric's bands at a table's columns, each `[p10, p90]` or `[p10, p90, todo]`. */
export type BandRow<M extends string> = readonly [M, readonly (readonly [number, number, string?])[]];

/** Bands as a grid: one row per metric, one range per column, in column order. */
export function grid<M extends string>(columns: readonly number[], rows: readonly BandRow<M>[]): Band<M>[] {
  return rows.flatMap(([metric, ranges]) =>
    ranges.map(([p10, p90, todo], i) => band(metric, { at: columns[i] as number, p10, p90, todo })),
  );
}

/** A table: bands on one axis over the game's metrics. */
export interface Table<R, M extends string = string> {
  readonly axis: Axis<R>;
  readonly metrics: { readonly [K in M]: Metric<R> };
  readonly bands: readonly Band<M>[];
}

/** Builds a pacing contract: bands on an axis over named metrics. */
export const table = <R, M extends string>(
  axis: Axis<R>,
  metrics: { readonly [K in M]: Metric<R> },
  bands: readonly Band<M>[],
): Table<R, M> => ({ axis, metrics, bands });

/** The latest row at or before a position on an axis; undefined before the first. Rows in time order. */
export const at = <R>(rows: readonly R[], axis: Axis<R>, position: number): R | undefined =>
  rows.findLast((row) => axis.covers(row, position));

/**
 * Every band the run reached, judged on the latest row at or before it (rows in time order). With `ceiling` a band
 * is an upper bound alone: under its floor is in.
 */
export function judge<R, M extends string>(
  rows: readonly R[],
  t: Table<R, M>,
  { ceiling = false }: { ceiling?: boolean } = {},
): Verdict[] {
  const last = rows.at(-1);
  if (last === undefined) return [];
  const out: Verdict[] = [];
  for (const b of t.bands) {
    if (!t.axis.reached(last, b.at)) continue;
    const row = at(rows, t.axis, b.at);
    if (row === undefined) continue;
    const metric = t.metrics[b.metric];
    const value = metric.read(row);
    out.push(
      check(
        `${metric.name}, ${t.axis.label(b.at)}`,
        value,
        ceiling ? `at most ${b.max}` : `${b.min}–${b.max}`,
        (ceiling || value >= b.min) && value <= b.max,
        b.todo,
      ),
    );
  }
  return out;
}

/** A check on each row and the one before it (a day's close against the day before's): the first row has none. */
export const pairs = <R>(rows: readonly R[], each: (row: R, before: R | undefined) => Verdict[]): Verdict[] =>
  rows.flatMap((row, i) => each(row, rows[i - 1]));

/** A check on each run's rows, in run order (`run` reads a row's run). */
export function perRun<R>(
  rows: readonly R[],
  run: (row: R) => number,
  each: (rows: R[], run: number) => Verdict[],
): Verdict[] {
  const runs = [...new Set(rows.map(run))];
  return runs.flatMap((n) =>
    each(
      rows.filter((r) => run(r) === n),
      n,
    ),
  );
}

/** One check across several runs (seeds): how many of them it was out on. */
export interface Tally {
  name: string;
  out: number;
  of: number;
  /** Every run's value, in run order. */
  values: number[];
  /** Carried from the verdicts: reported, never failing (`Verdict.todo`). */
  todo?: string;
}

/**
 * The same checks over several runs, by name. A check fails when it is out on more than half of them: one seed is
 * one draw, and a band one unlucky draw misses is noise, not a regression.
 */
export function tally(runs: readonly (readonly Verdict[])[]): Tally[] {
  const by = new Map<string, Tally>();
  for (const verdicts of runs)
    for (const v of verdicts) {
      const row = by.get(v.name) ?? {
        name: v.name,
        out: 0,
        of: 0,
        values: [],
        ...(v.todo ? { todo: v.todo } : {}),
      };
      row.of++;
      if (!v.ok) row.out++;
      row.values.push(v.value);
      by.set(v.name, row);
    }
  return [...by.values()];
}

/** The checks a majority of runs miss, but those marked `todo`. */
export const failing = (tallies: readonly Tally[]): Tally[] =>
  tallies.filter((t) => !t.todo && t.out * 2 > t.of);

/** The 10th and 90th percentiles of a check's values (nearest rank): how a band is written from a few seeds. */
export function p10p90(values: readonly number[]): [number, number] {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] ?? 0;
  return [rank(0.1), rank(0.9)];
}

/** The verdicts as a count and a markdown table. */
export function formatVerdicts(verdicts: readonly Verdict[]): string {
  const fmt = (n: number) =>
    Number.isFinite(n) ? (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2)) : "inf";
  const passed = verdicts.filter((v) => v.ok).length;
  const mark = (v: Verdict) => (v.ok ? "in" : v.todo ? `TODO(${v.todo})` : "OUT");
  const lines = verdicts.map((v) => `| ${mark(v)} | ${v.name} | ${fmt(v.value)} | ${v.target} |`);
  return [
    `${passed} of ${verdicts.length} in the contract`,
    "",
    "| | Check | Value | Target |",
    "| --- | --- | --- | --- |",
    ...lines,
  ].join("\n");
}
