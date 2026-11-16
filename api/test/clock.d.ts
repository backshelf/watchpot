/** A wall clock a test moves by hand: frozen at a time, or following another clock, shifted. */
export interface TestClock {
    /** The wall now. Pass it as the store's `now`. */
    now(): number;
    /** Moves the wall so `now()` reads `at`. */
    set(at: number): void;
    /** Moves the wall forward by `ms` (back, if negative); returns the new `now()`. */
    advance(ms: number): number;
}
/** A clock frozen at `start`, or following `start()` (say `Date.now` under a pinned system time) plus any moves. */
export declare function testClock(start: number | (() => number)): TestClock;
/** Noon, local time, on a fixed day: a test's default instant (local-day rules see the middle of a day). */
export declare const T0: number;
