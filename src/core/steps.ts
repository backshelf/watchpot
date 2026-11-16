import type { Draft } from "immer";
import type { ResetRunContext } from "./feature-types";

/** The tick phases, in the order they run. */
export const PHASES = ["guard", "sync", "rates", "produce", "automate", "settle", "commit", "after"] as const;
/** A tick phase: `guard, sync, rates, produce, automate, settle, commit` or `after`. */
export type Phase = (typeof PHASES)[number];

/** The two passes: a live tick of `dtMs`, or a catch-up over the gap since `lastSeen`. */
export type Pass = "tick" | "catchUp";

/** What a step is given: the pass, game time at its end, and `dtMs`. */
export interface StepContext {
  readonly pass: Pass;
  /** Game time the pass ends at. */
  readonly now: number;
  /** The tick's length; in a catch-up, the gap since `lastSeen` (0 when there is none). */
  readonly dtMs: number;
  /**
   * The prestige reset inside this pass's recipe, as `FeatureApi.resetRun`: every feature follows its `reset`
   * rule, at `now` (default: the pass's own). For a step that ends a run (a challenge whose goal is met).
   */
  resetRun(draft: object, ctx?: ResetRunContext): void;
}

/**
 * One step of a pass over the game draft. Returning `"stop"` ends the current phase and skips every later phase
 * before `commit`; `commit` and `after` always run (see `tick.ts`). A step with no return statement is `void`.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: a block-bodied step returns void
export type Step<G extends object = object> = (draft: Draft<G>, ctx: StepContext) => void | "stop";

/** When a step runs: in a live tick, in a catch-up, or in both. */
export type PassChoice = Pass | "both";

/** Steps a step runs after or before: step ids (`<featureKey>.<phase>.<name>`) or feature keys, in the same phase. */
export type StepRefs = string | readonly string[];

/** A step with its options: `{ pass: "tick", run }`. Written as a literal, never through a helper (see below). */
export interface StepDef<G extends object = object> {
  readonly run: Step<G>;
  /**
   * The passes the step runs in. Omitted, it runs in both, which suits a step that tidies or checks. A step in an
   * earning phase (`EARNING_PHASES`) has no default and must say: one that pays the live rate in a catch-up pays
   * the whole time away with no cap, so that is written out (`"both"`) or split into a `"tick"` step and a
   * `"catchUp"` twin that pays the away rate.
   */
  readonly pass?: PassChoice;
  /**
   * Runs after the named steps of the same phase: a step id, or a feature's key for all of its steps there. Only
   * for a step that acts; a derived value needs no order (see `FeatureDef.derived`).
   */
  readonly after?: StepRefs;
  /** Runs before the named steps of the same phase. */
  readonly before?: StepRefs;
}

/** A step in an earning phase: it must name its pass. */
export interface EarningStepDef<G extends object = object> extends StepDef<G> {
  readonly pass: PassChoice;
}

/** The phases whose steps pay the player over time, and so must each name the pass they run in. */
export const EARNING_PHASES = ["produce"] as const;
/** A phase whose steps must name their pass. */
export type EarningPhase = (typeof EARNING_PHASES)[number];

/**
 * A step entry is the function, or `{ run, pass, after, before }`. A generic helper such as `onTick(run)` would
 * not do: its own unresolved type parameter becomes a candidate for the feature's `G` and breaks the inference.
 */
export type StepEntry<G extends object = object> = Step<G> | StepDef<G>;

/**
 * The feature's steps: by phase, then by name. The step's id is `<featureKey>.<phase>.<name>`. In an earning
 * phase a step is always `{ pass, run }`.
 */
export type FeatureSteps<G extends object = object> = {
  readonly [P in Phase]?: Readonly<Record<string, P extends EarningPhase ? EarningStepDef<G> : StepEntry<G>>>;
};

/** A step with its game type erased (it accepts `never`): the store calls it with the game's draft. */
// biome-ignore lint/suspicious/noConfusingVoidType: a block-bodied step returns void
export type AnyStep = (draft: never, ctx: StepContext) => void | "stop";
/** A step as a feature declares it: a function or `{ pass, run }`. */
export type AnyStepEntry =
  | AnyStep
  | {
      readonly run: AnyStep;
      readonly pass?: PassChoice;
      readonly after?: StepRefs;
      readonly before?: StepRefs;
    };
/** A feature's steps by phase, then by name. */
export type AnySteps = { readonly [P in Phase]?: Readonly<Record<string, AnyStepEntry>> };
