/**
 * The timeline: the rows a sim keeps of a profile as it plays. A sampler takes a row when the time since the run's
 * start passes each of its marks (several passed in one look give one row) and at the close of every day played; the
 * game says what a row holds (`take`). `markdownTable` prints any rows as a table.
 */
export interface Sampler<R> {
  /** Every row taken, in order. */
  readonly rows: R[];
  /** A new run started at `at`: the marks count again from it. */
  restart(at: number): void;
  /** After a look at `now`: one row when a mark has passed since the run's start. */
  look(now: number): void;
  /** A row taken now, outside the marks (a run's milestone). */
  push(row: R): void;
  /** The close of a day: the row replaces the last one when both were taken at the same moment. */
  close(row: R): void;
}

/** Options for `sampler`: the marks, the run's start, how to take a row and how to read its time. */
export interface SamplerOptions<R> {
  /** Milliseconds since the run's start at which a row is taken. */
  marks: readonly number[];
  /** The run's start. */
  start: number;
  take(): R;
  /** When a row was taken, to compare a close with the row before it. */
  at(row: R): number;
}

/** A timeline sampler: a row as the time since the run's start passes each mark, plus milestone and day-end rows. */
export function sampler<R>({ marks, start, take, at }: SamplerOptions<R>): Sampler<R> {
  const rows: R[] = [];
  let runAt = start;
  let left = [...marks];
  return {
    rows,
    restart(when) {
      runAt = when;
      left = [...marks];
    },
    look(now) {
      const next = left[0];
      if (next === undefined || now - runAt < next) return;
      rows.push(take());
      // Marks a long gap passed over together are one row, not one a look.
      left = left.filter((m) => now - runAt < m);
    },
    push(row) {
      rows.push(row);
    },
    close(row) {
      const last = rows.at(-1);
      if (last !== undefined && at(last) === at(row)) rows[rows.length - 1] = row;
      else rows.push(row);
    },
  };
}

/** A markdown table: a header row, its rule, then one line per row of cells. */
export function markdownTable(heads: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]) => `| ${cells.join(" | ")} |`;
  return [line(heads), line(heads.map(() => "---")), ...rows.map(line)].join("\n");
}
