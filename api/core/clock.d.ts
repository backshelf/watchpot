/**
 * The clock: a fixed interval (not requestAnimationFrame: the store updates ten times a second and the
 * counters animate between values themselves) that measures real elapsed time, pauses while the document is
 * hidden, and treats any gap longer than `awayAfterMs` as time away, which the store credits at the offline rate.
 */
/** Shorter absences are credited silently; longer ones get the away sheet. */
export declare const AWAY_REPORT_MIN_MS = 30000;
/** The default interval between live ticks, in milliseconds. */
export declare const TICK_INTERVAL_MS = 100;
/** A single tick never advances more than this; a longer frame short of `AWAY_AFTER_MS` is split into steps. */
export declare const MAX_STEP_MS = 1000;
/** The gap after which a step is treated as time away rather than a long frame, in milliseconds. */
export declare const AWAY_AFTER_MS = 5000;
/** The result of `catchUp`: time away, time credited after the rate and cap, and whether the cap bit. */
export interface CatchUp {
    /** Wall time away. */
    awayMs: number;
    /** Time credited to the game tab after the cap and the rate: the income is `rate x min(away, cap)`. */
    creditedMs: number;
    rate: number;
    capped: boolean;
}
/**
 * How much of an absence the game tab pays for: `offlineRate` of the time, up to `capMs`. Pure. The caller passes the
 * tuned rate and cap.
 */
export declare function catchUp(elapsedMs: number, offlineRate: number, capMs: number): CatchUp;
/** `catchUp` plus how to replay it: `steps` slices of `stepMs` each, 0 steps when nothing is credited. */
export interface CatchUpSteps extends CatchUp {
    steps: number;
    stepMs: number;
}
/**
 * `catchUp` for a game that replays its tick rule over an absence: `steps` is `max(1, min(maxSteps, ceil(credited /
 * minStepMs)))`, or 0 when nothing is credited, and `stepMs` is the credited time over `steps`. Defaults: rate 1,
 * 240 steps, 1,000 ms at least per step. Pure.
 */
export declare function catchUpSteps(elapsedMs: number, options: {
    capMs: number;
    rate?: number;
    maxSteps?: number;
    minStepMs?: number;
}): CatchUpSteps;
/** What the engine clock calls: `onTick` for live ticks, `onAway` for a gap, `onHide` when the tab hides. */
export interface ClockHandlers {
    /** A live tick of `dtMs` (at most MAX_STEP_MS) ending at `now`; a longer frame arrives as several. */
    onTick: (dtMs: number, now: number) => void;
    /** A gap of `elapsedMs` (hidden tab, sleep, a long frame) ending at `now`. */
    onAway: (elapsedMs: number, now: number) => void;
    /** The document went hidden; the store flushes its save here. */
    onHide?: (now: number) => void;
}
/** The document-visibility source the clock listens to, injected so tests can drive it. */
export interface Visibility {
    hidden: () => boolean;
    /** Calls `cb` whenever visibility changes; returns the unsubscribe. */
    subscribe: (cb: () => void) => () => void;
}
/** Options for `createClock`: the interval, the step cap, the away threshold, the caller's `now` and the scheduler. */
export interface ClockOptions {
    intervalMs?: number;
    maxStepMs?: number;
    awayAfterMs?: number;
    /** The caller's clock: the one the steps measure. */
    now: () => number;
    schedule?: (fn: () => void, ms: number) => unknown;
    cancel?: (handle: unknown) => void;
    visibility?: Visibility | null;
}
/** A running interval clock: `start`, `stop` and a manual `step`. */
export interface Clock {
    start: () => void;
    stop: () => void;
    /** Runs one step as if the interval fired at `now`. Exposed for tests and manual ticks. */
    step: (now?: number) => void;
    readonly running: boolean;
}
/** Makes the interval clock that turns frames into ticks and long gaps into catch-ups. */
export declare function createClock(handlers: ClockHandlers, options: ClockOptions): Clock;
