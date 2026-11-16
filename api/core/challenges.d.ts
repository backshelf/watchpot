import type { Draft } from "immer";
import { type Feature } from "./feature";
/**
 * Challenges: a run under a restriction, for a permanent reward. Entering one resets the run (the store's `resetRun`)
 * and switches on the challenge's named rule flags, which the game's own rules read (`challengeRule(state.trials,
 * "noUpgrades")` in a buy, a rate). When the goal holds the challenge completes: it is counted, its best time kept,
 * the run reset again and the flags cleared. What the completions give is the game's own effect type, fed to the stat
 * bus through `contributions`. The feature never resets with the run: it holds the record, and it survives the very
 * reset it triggers.
 */
/** One challenge: when it opens, its goal, how often it can be completed, its reward and its rule flags. */
export interface ChallengeDef<G, E = never> {
    readonly id: string;
    /** Whether it can be entered. Default: always. */
    readonly unlocked?: (state: G) => boolean;
    /** Whether the run inside it has done what it asks. Read in the `settle` phase every pass while it is active. */
    readonly goal: (state: G) => boolean;
    /** How many times it can be completed (default 1). */
    readonly maxCompletions?: number;
    /** The permanent reward for `completions` so far, for the stat bus. */
    readonly effects?: (completions: number) => readonly E[];
    /** The restriction's named flags, which the game's rules check with `challengeRule` while it is active. */
    readonly rules?: readonly string[];
}
/** The feature's saved state: the challenge under way and its flags, and the record. */
export interface ChallengesState {
    /** The challenge under way, or null. */
    active: string | null;
    /** The game time it was entered (0 when none is). */
    startedAt: number;
    /** The active challenge's rule flags; empty outside one. */
    rules: string[];
    /** Completions per challenge id. */
    completions: Record<string, number>;
    /** The fastest completion per challenge id, in game ms from entering. */
    bestMs: Record<string, number>;
}
/** Why a challenge cannot be entered. */
export type ChallengeFailure = "unknown" | "locked" | "maxed" | "busy";
/** The feature's actions. */
export interface ChallengeActions {
    /** Resets the run and enters the challenge. Returns why not, or null when it went in. */
    enter(id: string): ChallengeFailure | null;
    /** Leaves the challenge under way with no reward, resetting the run. False when none is active. */
    exit(): boolean;
}
/** Whether `rule` is in force: true only while a challenge carrying it is active. */
export declare function challengeRule(state: Pick<ChallengesState, "active" | "rules">, rule: string): boolean;
/** A challenge list's rules. */
export interface ChallengeRules<G, E> {
    readonly list: readonly ChallengeDef<G, E>[];
    challenge(id: string): ChallengeDef<G, E> | undefined;
    /** Why `id` cannot be entered now, or null when it can. */
    check(state: G, id: string): ChallengeFailure | null;
    /** Whether every completion of `id` is done. */
    maxed(slice: Pick<ChallengesState, "completions">, id: string): boolean;
    /** Every completed challenge's reward, sourced `<key>:<id>`. */
    contributions(slice: Pick<ChallengesState, "completions">): {
        source: string;
        effect: E;
    }[];
}
/** A `challenges` feature, carrying its rules as `.rules`. */
export type ChallengesFeature<K extends string, G, E> = Feature<K, ChallengesState, ChallengeActions> & {
    readonly rules: ChallengeRules<G, E>;
};
/**
 * Challenges as a feature. It saves `{ active, startedAt, rules, completions, bestMs }` under `key` (the stat bus's
 * source prefix too) and never resets with the run. `enter(id)` resets the run inside its recipe and marks the
 * challenge active; the step `<key>.settle.goal` completes it when its goal holds: counted, the best time kept, the
 * run reset, the flags cleared, then `onComplete(draft, id, completions)`. `exit()` resets the run and pays nothing.
 * The callbacks read the whole game state, so annotate one of them with the game's state type.
 */
export declare function challenges<const K extends string, E = never, G extends object = object>(def: {
    readonly key: K;
    readonly list: readonly ChallengeDef<G, E>[];
    readonly onComplete?: (draft: Draft<G>, id: string, completions: number) => void;
    /** How deep entering, leaving and completing reset (default 1): challenges of a higher layer reset at its depth. */
    readonly depth?: number;
}): ChallengesFeature<K, G, E>;
