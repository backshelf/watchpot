// A job's moves laid along its progress, 0..1. The economy decides how long a job takes; the picture fits its
// moves to that length, so it can never drift from the timer. Pure numbers.

/** One move of a job: its natural length in seconds; a dwell soaks up the time a slow job leaves over. */
export interface Move<K extends string> {
  readonly kind: K;
  readonly seconds: number;
  readonly dwell?: boolean;
}

/** A job's moves laid along its progress: each runs from `from` to `to` (0..1, contiguous, ending at 1). */
export type Plan<K extends string> = readonly {
  readonly kind: K;
  readonly from: number;
  readonly to: number;
}[];

/**
 * Fits `moves` to a job of `seconds`. A job shorter than the moves plays them all faster; a longer one slows the
 * motions up to `maxStretch` times their natural length (default 1.6) and gives the remainder to the dwells, or
 * stretches everything when there are no dwells.
 */
export function planOf<K extends string>(
  moves: readonly Move<K>[],
  seconds: number,
  maxStretch = 1.6,
): Plan<K> {
  const total = moves.reduce((n, m) => n + Math.max(0, m.seconds), 0);
  const motion = moves.reduce((n, m) => n + (m.dwell ? 0 : Math.max(0, m.seconds)), 0);
  const dwell = total - motion;
  const lengths = moves.map((m) => Math.max(0, m.seconds));
  if (total > 0 && seconds > total && dwell > 0) {
    const stretch = Math.min(maxStretch, (seconds - dwell) / Math.max(motion, 1e-9));
    const spare = seconds - motion * stretch;
    moves.forEach((m, i) => {
      const s = Math.max(0, m.seconds);
      lengths[i] = m.dwell ? (spare * s) / dwell : s * stretch;
    });
  }
  const sum = lengths.reduce((n, s) => n + s, 0);
  let at = 0;
  return moves.map((m, i) => {
    const from = at;
    at = i === moves.length - 1 ? 1 : sum > 0 ? at + (lengths[i] as number) / sum : (i + 1) / moves.length;
    return { kind: m.kind, from, to: at };
  });
}

/** The move playing at progress `v`, and how far through it (0..1). */
export function moveAt<K extends string>(plan: Plan<K>, v: number): { index: number; kind: K; t: number } {
  const x = Math.min(1, Math.max(0, v));
  let i = 0;
  while (i < plan.length - 1 && x >= (plan[i] as Plan<K>[number]).to) i++;
  const m = plan[i] as Plan<K>[number];
  const span = m.to - m.from;
  return { index: i, kind: m.kind, t: span > 0 ? Math.min(1, Math.max(0, (x - m.from) / span)) : 1 };
}

/** Where the first move of `kind` starts and ends, as progress; 1 to 1 when the plan has none. */
export function spanOf<K extends string>(plan: Plan<K>, kind: K): { from: number; to: number } {
  const m = plan.find((p) => p.kind === kind);
  return m ? { from: m.from, to: m.to } : { from: 1, to: 1 };
}
