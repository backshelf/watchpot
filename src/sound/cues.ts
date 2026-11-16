/**
 * The cue model: which take a play picks and how much it varies. A pure decision: no audio, no clock, no
 * `Math.random` (chance comes from the sound's seeded generator, so a seed replays the same picks).
 *
 * - `velocity` narrows the takes to those whose range holds it (a take with no range answers to all); when no range
 *   holds it, the takes of the nearest range answer. Readiness is asked after: a take that is not loaded yet leaves
 *   the play to the cue's clips or zzfx voices rather than handing it to a take meant for another velocity.
 * - `pick`: `shuffle` (the default) deals from a bag and never repeats a take back to back, across refills too;
 *   `round` goes in order; `random` draws by `weight`.
 * - `vary` draws cents, dB and a start offset within ± its values (a start never before the sample's own start),
 *   scaled by the governor's `widen`. It applies with or without a take: clips and zzfx voices vary too.
 * - `ladder`: ratios multiply the rate by `ladder[step]` (the step held to the ladder's ends); `"scale"` leaves the
 *   step to the harmony clock, which the engine asks.
 * - `velocity` also scales the level: 20·log10(velocity), no lower than {@link VELOCITY_FLOOR_DB}.
 */
import type { Cue, PlayOptions, Take } from "./types";

/** The quietest a play gets from its `velocity`, in dB (velocity 0). */
export const VELOCITY_FLOOR_DB = -26;

/** What a cue remembers between plays (its shuffled bag, its place in the round). One per cue key. */
export interface CueState {
  /** The last take picked, by index in the cue's `takes`, or -1. */
  last: number;
  /** The shuffle's bag: indices into the cue's `takes` not yet dealt this round. */
  bag: number[];
}

export const createCueState = (): CueState => ({ last: -1, bag: [] });

/** A seeded generator of numbers in 0..1 (mulberry32): the sound's one source of chance. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What one play of a cue is: the take (null when none is ready) and what the cue's variation adds. */
export interface Picked {
  take: Take | null;
  /** A ratio on the play's rate: the take's own, the cue's `vary.cents`, its `ladder`. */
  rate: number;
  /** dB on the play's level: the take's own, the cue's `vary.db`, the play's `velocity`. */
  db: number;
  /** Milliseconds into the sample the play starts: the take's `at` and the cue's `vary.startMs`. */
  startMs: number;
}

const finite = (n: number | undefined, fallback: number): number =>
  n !== undefined && Number.isFinite(n) ? n : fallback;

const positive = (n: number | undefined, fallback: number): number => {
  const v = finite(n, fallback);
  return v > 0 ? v : fallback;
};

/** How far `v` lies outside a take's velocity range (0 inside, or with no range). */
function distance(take: Take, v: number): number {
  const range = take.velocity;
  if (!range) return 0;
  const lo = Math.min(range[0], range[1]);
  const hi = Math.max(range[0], range[1]);
  return v < lo ? lo - v : v > hi ? v - hi : 0;
}

/** The indices of the takes a play of `velocity` answers to: those in range, else those of the nearest range. */
function byVelocity(takes: readonly Take[], velocity: number | undefined): number[] {
  const all = takes.map((_, i) => i);
  if (velocity === undefined || !Number.isFinite(velocity)) return all;
  const v = Math.min(1, Math.max(0, velocity));
  const gaps = takes.map((take) => distance(take, v));
  const nearest = Math.min(...gaps);
  return all.filter((i) => gaps[i] === nearest);
}

/** A draw in -1..1. */
const signed = (rng: () => number): number => 2 * rng() - 1;

function deal(cue: Cue, state: CueState, able: readonly number[], rng: () => number): number {
  const takes = cue.takes ?? [];
  const pick = cue.pick ?? "shuffle";
  if (pick === "round") {
    // The next able take after the last, wrapping.
    return able.find((i) => i > state.last) ?? (able[0] as number);
  }
  if (pick === "random") {
    const weights = able.map((i) => Math.max(0, finite(takes[i]?.weight, 1)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return able[Math.floor(rng() * able.length)] as number;
    let r = rng() * total;
    for (let k = 0; k < able.length; k++) {
      r -= weights[k] as number;
      if (r < 0) return able[k] as number;
    }
    return able[able.length - 1] as number;
  }
  // Shuffle: deal from the bag; refill with every able take when it holds none of them, never opening on the last.
  let options = state.bag.filter((i) => able.includes(i));
  if (!options.length) {
    state.bag = [...able];
    options = [...able];
  }
  if (options.length > 1) options = options.filter((i) => i !== state.last);
  const chosen = options[Math.floor(rng() * options.length)] as number;
  state.bag = state.bag.filter((i) => i !== chosen);
  return chosen;
}

/** The ratio a ladder gives a step, or 1 when the play names no step. */
function ladderRatio(cue: Cue, step: number | undefined): number {
  const ladder = cue.ladder;
  if (!ladder || step === undefined || !Number.isFinite(step)) return 1;
  const n = Math.round(step);
  // A scale ladder's step is a degree of the harmony clock: the engine asks the clock for its rate.
  if (ladder === "scale") return 1;
  if (!ladder.length) return 1;
  return positive(ladder[Math.min(ladder.length - 1, Math.max(0, n))], 1);
}

/**
 * Picks this play's take and draws its variation. `ready` says which takes can sound now (all, when left out);
 * `widen` scales the cue's `vary` (the governor widens it for a cue that repeats). The variation applies whether
 * or not a take is picked: a cue that plays its clips or its zzfx voices varies too.
 */
export function pickTake(
  cue: Cue,
  state: CueState,
  options: PlayOptions,
  rng: () => number,
  ready: (take: Take) => boolean = () => true,
  widen = 1,
): Picked {
  const takes = cue.takes ?? [];
  const able = byVelocity(takes, options.velocity).filter((i) => ready(takes[i] as Take));
  let take: Take | null = null;
  if (able.length) {
    const index = deal(cue, state, able, rng);
    state.last = index;
    take = takes[index] ?? null;
  }

  const scale = Math.max(0, finite(widen, 1));
  const vary = cue.vary ?? {};
  const cents = Math.abs(finite(vary.cents, 0)) * scale;
  const varyDb = Math.abs(finite(vary.db, 0)) * scale;
  const startMs = Math.abs(finite(vary.startMs, 0)) * scale;

  let rate = positive(take?.rate, 1) * ladderRatio(cue, options.step);
  if (cents > 0) rate *= 2 ** ((signed(rng) * cents) / 1200);

  let db = finite(take?.level, 0);
  if (varyDb > 0) db += signed(rng) * varyDb;
  if (options.velocity !== undefined && Number.isFinite(options.velocity)) {
    const v = Math.min(1, Math.max(0, options.velocity));
    db += v > 0 ? Math.max(VELOCITY_FLOOR_DB, 20 * Math.log10(v)) : VELOCITY_FLOOR_DB;
  }

  // A start drawn before the sample's own start folds back into it, so a take at 0 spreads over 0..startMs.
  let start = Math.max(0, finite(take?.at, 0) * 1000);
  if (startMs > 0) start = Math.abs(start + signed(rng) * startMs);

  return { take, rate, db, startMs: start };
}
