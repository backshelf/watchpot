import { type ClockLens, clockSteps } from "./clock-feature";
import { type AnyStep, type FeatureSpec, type Pass, PHASES, type Phase, type StepContext } from "./feature";
import type { AnyGame, StepOrder } from "./game";

/**
 * The phase runner. A pass (`tick` or `catchUp`) runs the phases in order, each phase's steps in the game's
 * `order` first and then in feature-list order, the clock's steps last. A step that returns `"stop"` ends its
 * phase and skips every later phase before `commit`: the work (`sync` to `settle`) is what a guard refuses;
 * `commit` (the clock's `lastSeen`) and `after` (the epilogue) always run, so a stopped pass still moves the
 * clock and still runs what must follow every pass. A `"stop"` from a `commit` or `after` step is ignored.
 */
export interface StepRef {
  /** `<featureKey>.<phase>.<name>`; the clock's steps are `clock.<phase>.<name>`. */
  readonly id: string;
  readonly phase: Phase;
  readonly pass: Pass | undefined;
  readonly run: AnyStep;
}

const WORK_END: Phase = "settle";

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
        const def = typeof entry === "function" ? { run: entry, pass: undefined } : entry;
        out.push({ id: `${key}.${phase}.${name}`, phase, pass: def.pass, run: def.run });
      }
  return out;
}

function orderPhase(refs: readonly StepRef[], first: readonly string[] | undefined): StepRef[] {
  if (!first || first.length === 0) return [...refs];
  const byId = new Map(refs.map((r) => [r.id, r]));
  const named = first.flatMap((id) => byId.get(id) ?? []);
  const rest = refs.filter((r) => !first.includes(r.id));
  return [...named, ...rest];
}

function resolve(
  features: readonly FeatureSpec[],
  clock: ClockLens,
  order: StepOrder,
  pass: Pass,
): StepRef[] {
  const declared = declaredSteps(features, clock).filter((r) => r.pass === undefined || r.pass === pass);
  return PHASES.flatMap((phase) =>
    orderPhase(
      declared.filter((r) => r.phase === phase),
      order[phase],
    ),
  );
}

const resolvedByGame = new WeakMap<AnyGame, Partial<Record<Pass, readonly StepRef[]>>>();

/** The steps a pass runs, in order. Cached per game. */
export function passSteps(game: AnyGame, pass: Pass): readonly StepRef[] {
  let byPass = resolvedByGame.get(game);
  if (!byPass) {
    byPass = {};
    resolvedByGame.set(game, byPass);
  }
  const steps = byPass[pass] ?? resolve(game.features, game.clock, game.order, pass);
  byPass[pass] = steps;
  return steps;
}

/** The step ids a pass runs, in order: the list an order pin asserts. */
export function resolvedSteps(game: AnyGame, pass: Pass): readonly string[] {
  return passSteps(game, pass).map((s) => s.id);
}

/** Runs one pass over the game draft. */
export function runPass(game: AnyGame, draft: object, ctx: StepContext): void {
  let stopped = false;
  let phase: Phase | null = null;
  for (const step of passSteps(game, ctx.pass)) {
    if (step.phase !== phase) {
      phase = step.phase;
      if (stopped && PHASES.indexOf(phase) > PHASES.indexOf(WORK_END)) stopped = false;
    }
    if (stopped) continue;
    // The draft is the game's; `AnyStep` is the erased declaration (see `feature.ts`).
    if (step.run(draft as never, ctx) === "stop" && PHASES.indexOf(phase) <= PHASES.indexOf(WORK_END))
      stopped = true;
  }
}
