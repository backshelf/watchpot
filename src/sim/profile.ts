/**
 * The profiler: where a sim's time goes. `profileSim` plays a number of steps and times the pilot's look against the
 * game's step; `timeSteps` wraps a game so each of its steps (by id) is timed too. The engine reads no clock: the
 * caller passes the timer (`performance.now`). Start it from a snapshot (`resumeSimWorld`) to profile a late stretch
 * without playing to it.
 */

import type { AnyGame, FeatureSpec } from "../core";
import { markdownTable } from "./timeline";

/** One step id's time: how often it ran and how long it took in all, in the timer's ms. */
export interface StepTime {
  readonly id: string;
  readonly calls: number;
  readonly ms: number;
}

/** A game whose steps are timed (`timeSteps`). */
export interface TimedGame<G extends AnyGame> {
  /** The same game, each step wrapped in the timer: build the sim's store over this one. */
  readonly game: G;
  /** Each step id's time since the last `reset`, the slowest first. */
  times(): StepTime[];
  /** Starts the count again. */
  reset(): void;
}

/**
 * The game with every feature step timed by `timer`, by its id (`<feature>.<phase>.<name>`). The steps run as before,
 * in the same order: the only change is the two timer reads around each. A derived value is timed inside the step
 * that first reads it; the clock's own steps are not timed.
 */
export function timeSteps<G extends AnyGame>(game: G, timer: () => number): TimedGame<G> {
  const totals = new Map<string, { calls: number; ms: number }>();
  const wrap = (id: string, run: (draft: never, ctx: never) => unknown) => {
    const total = { calls: 0, ms: 0 };
    totals.set(id, total);
    return (draft: never, ctx: never): unknown => {
      const t = timer();
      try {
        return run(draft, ctx);
      } finally {
        total.ms += timer() - t;
        total.calls += 1;
      }
    };
  };
  const features = game.features.map((f): FeatureSpec => {
    const steps: Record<string, Record<string, unknown>> = {};
    for (const [phase, entries] of Object.entries(f.steps ?? {})) {
      const out: Record<string, unknown> = {};
      for (const [name, entry] of Object.entries((entries ?? {}) as Record<string, unknown>)) {
        const id = `${f.key}.${phase}.${name}`;
        if (typeof entry === "function") out[name] = wrap(id, entry as never);
        else {
          const def = entry as { run: (draft: never, ctx: never) => unknown };
          out[name] = { ...def, run: wrap(id, def.run) };
        }
      }
      steps[phase] = out;
    }
    return { ...f, steps: steps as FeatureSpec["steps"] };
  });
  return {
    game: { ...game, features } as G,
    times: () =>
      [...totals]
        .map(([id, t]) => ({ id, calls: t.calls, ms: t.ms }))
        .filter((t) => t.calls > 0)
        .sort((a, b) => b.ms - a.ms),
    reset: () => {
      for (const t of totals.values()) {
        t.calls = 0;
        t.ms = 0;
      }
    },
  };
}

/** What `profileSim` plays. */
export interface ProfileOptions {
  /** How many steps to time. */
  steps: number;
  /** The timer (`performance.now`): ms, any origin. */
  timer: () => number;
  /** One step of play (the game's pass or passes). */
  step(): void;
  /** One look by the pilot, before each step. */
  look?(): void;
  /** The game's steps, when the store was built over `timeSteps(game).game`: the profile lists them. */
  timed?: Pick<TimedGame<AnyGame>, "times" | "reset">;
  /** Ms of play so far, to report how much play the steps covered. */
  playedMs?(): number;
}

/** Where the time went: totals and per-step averages, in the timer's ms. */
export interface SimProfile {
  steps: number;
  /** Ms of play the steps covered (0 without `playedMs`). */
  playedMs: number;
  totalMs: number;
  lookMs: number;
  stepMs: number;
  /** Per step: the whole, the look and the game's step. */
  perStep: { total: number; look: number; step: number };
  /** The game's steps by id, the slowest first (with `timed`). */
  bySteps: StepTime[];
}

/** Plays `steps` steps, a look before each, timing the look and the step apart. Pure apart from the timer. */
export function profileSim({ steps, timer, step, look, timed, playedMs }: ProfileOptions): SimProfile {
  timed?.reset();
  const played0 = playedMs?.() ?? 0;
  let lookMs = 0;
  let stepMs = 0;
  for (let i = 0; i < steps; i++) {
    if (look) {
      const t = timer();
      look();
      lookMs += timer() - t;
    }
    const t = timer();
    step();
    stepMs += timer() - t;
  }
  const n = Math.max(1, steps);
  return {
    steps,
    playedMs: (playedMs?.() ?? 0) - played0,
    totalMs: lookMs + stepMs,
    lookMs,
    stepMs,
    perStep: { total: (lookMs + stepMs) / n, look: lookMs / n, step: stepMs / n },
    bySteps: timed?.times() ?? [],
  };
}

/**
 * The profile as text: a line of totals (steps, played hours, ms a step: look and step), then, with step times, a
 * table of the `top` slowest steps (default 15) with their calls, total ms, µs a call and share of the step time.
 */
export function formatProfile(profile: SimProfile, top = 15): string {
  const f2 = (n: number) => n.toFixed(2);
  /** Two places, or three figures below one ms (a small game's step is a few µs). */
  const ms = (n: number) => (n >= 1 || n === 0 ? n.toFixed(2) : n.toPrecision(3));
  const head = `${profile.steps} steps, ${f2(profile.playedMs / 3_600_000)} played hours, ${ms(profile.perStep.total)} ms a step: look ${ms(profile.perStep.look)}, step ${ms(profile.perStep.step)}`;
  if (profile.bySteps.length === 0) return head;
  const rows = profile.bySteps
    .slice(0, top)
    .map((s) => [
      s.id,
      String(s.calls),
      s.ms.toFixed(1),
      ((s.ms / Math.max(1, s.calls)) * 1000).toFixed(1),
      `${((s.ms / Math.max(Number.EPSILON, profile.stepMs)) * 100).toFixed(0)}%`,
    ]);
  return `${head}\n\n${markdownTable(["step", "calls", "ms", "µs a call", "of the step"], rows)}`;
}
