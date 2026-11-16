import { type ClockLens } from "./clock-feature";
import { type AnyStep, type FeatureSpec, type Pass, type Phase, type StepContext } from "./feature";
import type { AnyGame } from "./game";
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
/** Every step the features and the clock declare, for both passes, in feature-list order by phase. */
export declare function declaredSteps(features: readonly FeatureSpec[], clock: ClockLens): readonly StepRef[];
/** The steps a pass runs, in order. Cached per game. */
export declare function passSteps(game: AnyGame, pass: Pass): readonly StepRef[];
/** The step ids a pass runs, in order: the list an order pin asserts. */
export declare function resolvedSteps(game: AnyGame, pass: Pass): readonly string[];
/** Runs one pass over the game draft. */
export declare function runPass(game: AnyGame, draft: object, ctx: StepContext): void;
