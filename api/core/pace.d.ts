/**
 * The pace clock: real time scaled, for slow motion and a held moment. Every animation reads `now()` instead of
 * the frame's own time, so one `setScale` slows or stops the whole scene at once. It is presentation time: the
 * game's economy runs on the store's clock (`gameNow`), never on this one.
 */
/** A scaled clock over a source of real seconds. */
export interface PaceClock {
    /** Seconds since it was made, slowed or stopped by `scale`. */
    now(): number;
    /** Real seconds, unscaled, for easing that must not slow down. */
    real(): number;
    /** The scale now: 1 is real time, 0 is a held moment. */
    readonly scale: number;
    /** Ramps the scale to `to` (never below 0) over `seconds` of real time (default: at once). */
    setScale(to: number, seconds?: number): void;
}
/**
 * A pace clock over the caller's real seconds (`() => performance.now() / 1000`). The scale ramps linearly and
 * scaled time is the ramp's exact integral, so reading `now()` at any frame rate gives the same answer.
 */
export declare function createPaceClock(realSeconds: () => number): PaceClock;
/** A value eased toward a target over pace or real seconds: `set` starts a smoothstep ramp, `at` reads it. */
export interface Ramp {
    /** The value at `now`. */
    at(now: number): number;
    /** Starts easing from the value at `now` to `to` over `seconds` (0: at once). */
    set(to: number, now: number, seconds?: number): void;
    /** Where it is heading. */
    readonly target: number;
}
/** A ramp starting at `value`. Smoothstep in time: it leaves and arrives at rest. */
export declare function createRamp(value: number): Ramp;
