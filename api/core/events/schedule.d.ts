/**
 * When an event runs. A fixed window, repeating cycles from an epoch, or a rolling cycle that starts on the
 * profile's first open and restarts when it ends.
 */
export type EventSchedule = {
    kind: "fixed";
    start: number;
    end: number;
}
/** Cycles of `durationMs` from `epoch`, with an optional gap between cycles. */
 | {
    kind: "repeating";
    epoch: number;
    durationMs: number;
    gapMs?: number;
}
/** Runs `durationMs` from the profile's first open (the runtime's `cycleStart`) and restarts when it ends. */
 | {
    kind: "rolling";
    durationMs: number;
};
/** A resolved window: its start, end and whether it is active. */
export interface EventWindow {
    start: number;
    end: number;
    /** False in the gap between cycles or outside a fixed window. */
    active: boolean;
}
/**
 * The window that covers `now`, or the next one when `now` falls in a gap (then `active` is false).
 * A rolling schedule needs `anchor`, the runtime's `cycleStart`; without one, or past its end, it starts now.
 */
export declare function resolveWindow(schedule: EventSchedule, now: number, anchor?: number): EventWindow;
