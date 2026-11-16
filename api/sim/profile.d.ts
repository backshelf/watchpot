/**
 * The profiler: where a sim's time goes. `profileSim` plays a number of steps and times the pilot's look against the
 * game's step; `timeSteps` wraps a game so each of its steps (by id) is timed too. The engine reads no clock: the
 * caller passes the timer (`performance.now`). Start it from a snapshot (`resumeSimWorld`) to profile a late stretch
 * without playing to it.
 */
import type { AnyGame } from "../core";
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
export declare function timeSteps<G extends AnyGame>(game: G, timer: () => number): TimedGame<G>;
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
    perStep: {
        total: number;
        look: number;
        step: number;
    };
    /** The game's steps by id, the slowest first (with `timed`). */
    bySteps: StepTime[];
}
/** Plays `steps` steps, a look before each, timing the look and the step apart. Pure apart from the timer. */
export declare function profileSim({ steps, timer, step, look, timed, playedMs }: ProfileOptions): SimProfile;
/**
 * The profile as text: a line of totals (steps, played hours, ms a step: look and step), then, with step times, a
 * table of the `top` slowest steps (default 15) with their calls, total ms, µs a call and share of the step time.
 */
export declare function formatProfile(profile: SimProfile, top?: number): string;
