import { type ClockLens, clockSteps } from "./clock-feature";
import {
  type AnyStep,
  type FeatureSpec,
  type Pass,
  type PassChoice,
  PHASES,
  type Phase,
  type StepContext,
  type StepRefs,
} from "./feature";
import type { AnyGame } from "./game";

/**
 * The phase runner. A pass (`tick` or `catchUp`) runs the phases in order, each phase's steps in feature-list
 * order (the clock's last) unless a step says `after` or `before`. A step that returns `"stop"` ends its phase and
 * skips every later phase before `commit`: the work (`sync` to `settle`) is what a guard refuses; `commit` (the
 * clock's `lastSeen`) and `after` (the epilogue) always run, so a stopped pass still moves the clock and still runs
 * what must follow every pass. A `"stop"` from a `commit` or `after` step is ignored.
 */
export interface StepRef {
  /** `<featureKey>.<phase>.<name>`; the clock's steps are `clock.<phase>.<name>`. */
  readonly id: string;
  /** The feature that declares it (`clock` for the clock's own). */
  readonly feature: string;
  readonly phase: Phase;
  /** The pass it runs in; undefined for both. */
  readonly pass: Pass | undefined;
  readonly run: AnyStep;
  readonly after: readonly string[];
  readonly before: readonly string[];
}

const WORK_END: Phase = "settle";

const refs = (given: StepRefs | undefined): readonly string[] =>
  given === undefined ? [] : typeof given === "string" ? [given] : given;

const passOf = (choice: PassChoice | undefined): Pass | undefined =>
  choice === undefined || choice === "both" ? undefined : choice;

/** Every step the features and the clock declare, for both passes, in feature-list order by phase. */
export function declaredSteps(features: readonly FeatureSpec[], clock: ClockLens): readonly StepRef[] {
  const out: StepRef[] = [];
  const participants: readonly { key: string; steps: FeatureSpec["steps"] }[] = [
    ...features,
    { key: "clock", steps: clockSteps(clock) },
  ];
  for (const phase of PHASES)
    for (const { key, steps } of participants)
      for (const [name, entry] of Object.entries(steps[phase] ?? {})) {
        const def = typeof entry === "function" ? { run: entry } : entry;
        out.push({
          id: `${key}.${phase}.${name}`,
          feature: key,
          phase,
          pass: passOf(def.pass),
          run: def.run,
          after: refs(def.after),
          before: refs(def.before),
        });
      }
  return out;
}

/**
 * One phase's steps in the order they run: declared order, moved only as far as `after` and `before` ask. Throws,
 * naming the steps, when the constraints go round. A constraint naming a step this pass does not run is skipped.
 */
export function orderPhase(steps: readonly StepRef[]): StepRef[] {
  if (steps.every((s) => s.after.length === 0 && s.before.length === 0)) return [...steps];
  const targets = (name: string): StepRef[] => steps.filter((s) => s.id === name || s.feature === name);
  /** `waits.get(s)`: the steps that must run before `s`. */
  const waits = new Map<StepRef, Set<StepRef>>(steps.map((s) => [s, new Set<StepRef>()]));
  for (const s of steps) {
    for (const name of s.after) for (const t of targets(name)) if (t !== s) waits.get(s)?.add(t);
    for (const name of s.before) for (const t of targets(name)) if (t !== s) waits.get(t)?.add(s);
  }
  const out: StepRef[] = [];
  const left = [...steps];
  while (left.length > 0) {
    const i = left.findIndex((s) => [...(waits.get(s) ?? [])].every((w) => out.includes(w)));
    if (i < 0)
      throw new Error(
        `steps wait on each other in a loop (after / before): ${left.map((s) => s.id).join(", ")}. Break the loop: change or drop one of the \`after\` / \`before\` entries`,
      );
    out.push(...left.splice(i, 1));
  }
  return out;
}

function resolve(features: readonly FeatureSpec[], clock: ClockLens, pass: Pass): StepRef[] {
  const declared = declaredSteps(features, clock).filter((r) => r.pass === undefined || r.pass === pass);
  return PHASES.flatMap((phase) => orderPhase(declared.filter((r) => r.phase === phase)));
}

const resolvedByGame = new WeakMap<AnyGame, Partial<Record<Pass, readonly StepRef[]>>>();

/** The steps a pass runs, in order. Cached per game. */
export function passSteps(game: AnyGame, pass: Pass): readonly StepRef[] {
  let byPass = resolvedByGame.get(game);
  if (!byPass) {
    byPass = {};
    resolvedByGame.set(game, byPass);
  }
  const steps = byPass[pass] ?? resolve(game.features, game.clock, pass);
  byPass[pass] = steps;
  return steps;
}

/** The step ids a pass runs, in order: the list an order pin asserts. */
export function resolvedSteps(game: AnyGame, pass: Pass): readonly string[] {
  return passSteps(game, pass).map((s) => s.id);
}

/**
 * Runs one pass over the game draft. `between` runs after every step: the store closes the step there, so the
 * derived values the next step reads are current.
 */
export function runPass(game: AnyGame, draft: object, ctx: StepContext, between?: () => void): void {
  let stopped = false;
  let phase: Phase | null = null;
  for (const step of passSteps(game, ctx.pass)) {
    if (step.phase !== phase) {
      phase = step.phase;
      if (stopped && PHASES.indexOf(phase) > PHASES.indexOf(WORK_END)) stopped = false;
    }
    if (stopped) continue;
    // The draft is the game's; `AnyStep` is the erased declaration (see `feature.ts`).
    const said = step.run(draft as never, ctx);
    between?.();
    if (said === "stop" && PHASES.indexOf(phase) <= PHASES.indexOf(WORK_END)) stopped = true;
  }
}
