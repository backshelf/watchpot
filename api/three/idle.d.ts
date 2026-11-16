/** A build running in idle time. */
export interface IdleTask<T> {
    /** Settles with the result, or rejects when cancelled or a step throws. */
    readonly promise: Promise<T>;
    readonly done: boolean;
    /** Runs the remaining steps now (a pending compile is left to finish on its own) and returns the result. */
    finish(): T;
    /** Stops; the steps already run are dropped. A finished task's result is the caller's to dispose. */
    cancel(): void;
}
/** What an idle callback is told: whether it was forced by its timeout, and the time left in the idle period. */
export interface IdleDeadline {
    readonly didTimeout: boolean;
    timeRemaining(): number;
}
/** Runs `slice` in idle time; `urgent` work should wait at most about a frame. */
export type IdleSchedule = (slice: (deadline: IdleDeadline) => void, urgent: boolean) => void;
/** How a run is sliced. */
export interface IdleOptions {
    /** Work that is waited on gets a slice every frame or so. */
    readonly urgent?: boolean;
    /** Milliseconds of steps per slice; a single step can run over. Default 4. */
    readonly sliceMs?: number;
    /** Where slices run. Default: `requestIdleCallback`, or a timer where there is none (Safari). */
    readonly schedule?: IdleSchedule;
    /** The work clock, milliseconds. Default `performance.now`. */
    readonly now?: () => number;
}
/** The default schedule: idle callbacks where the browser has them, a timer elsewhere. */
export declare const idleSchedule: IdleSchedule;
/** Thrown by `finish` on a cancelled task, and the reason its promise rejects with. */
export declare class Cancelled extends Error {
    constructor();
}
/** Starts `steps` in idle time. */
export declare function runIdle<T>(steps: Generator<unknown, T>, options?: IdleOptions): IdleTask<T>;
