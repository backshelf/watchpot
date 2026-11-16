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
export declare const VELOCITY_FLOOR_DB = -26;
/** What a cue remembers between plays (its shuffled bag, its place in the round). One per cue key. */
export interface CueState {
    /** The last take picked, by index in the cue's `takes`, or -1. */
    last: number;
    /** The shuffle's bag: indices into the cue's `takes` not yet dealt this round. */
    bag: number[];
}
export declare const createCueState: () => CueState;
/** A seeded generator of numbers in 0..1 (mulberry32): the sound's one source of chance. */
export declare function createRng(seed: number): () => number;
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
/**
 * Picks this play's take and draws its variation. `ready` says which takes can sound now (all, when left out);
 * `widen` scales the cue's `vary` (the governor widens it for a cue that repeats). The variation applies whether
 * or not a take is picked: a cue that plays its clips or its zzfx voices varies too.
 */
export declare function pickTake(cue: Cue, state: CueState, options: PlayOptions, rng: () => number, ready?: (take: Take) => boolean, widen?: number): Picked;
