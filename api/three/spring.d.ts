/** How the spring and its stops behave. Defaults are tuned for something hand-sized on a runner. */
export interface SpringStops {
    /** The near stop, units from home. Default 0. */
    readonly min?: number;
    /** The far stop. */
    readonly max: number;
    /** Default 70. */
    readonly stiffness?: number;
    /** Default 11. */
    readonly damping?: number;
    /** How much speed survives a stop: a little bounce, then it sits. Default 0.22. */
    readonly restitution?: number;
    /** How far past a stop `toMin` and `toMax` pull, so the spring holds the thing against it. Default 0.07. */
    readonly press?: number;
    /** How much a full load (`weight` 1) adds to the mass. Default 1.4. */
    readonly load?: number;
}
/** A spring's state. */
export interface Spring {
    /** Units out from home. */
    x: number;
    /** Units per second. */
    v: number;
    /** Where the spring pulls: past a stop to press against it. */
    target: number;
    /** 0..1: empty to full. */
    weight: number;
    /** Seconds it has sat still; a settled spring stops integrating. */
    still: number;
}
/** What a step reports: the stop it struck this step and how fast, for a sound. */
export type Knock = {
    stop: "min" | "max";
    speed: number;
} | null;
/** A spring at rest against its near stop. */
export declare function spring(stops: SpringStops, weight?: number): Spring;
/** The target that holds a spring pressed against its near stop. */
export declare function toMin(stops: SpringStops): number;
/** The target that holds a spring pressed against its far stop. */
export declare function toMax(stops: SpringStops): number;
/** Advances a spring by `dt` seconds (sub-stepped at 240 Hz). Returns the hardest stop it struck, if any. */
export declare function stepSpring(s: Spring, stops: SpringStops, dt: number): Knock;
/** Settled: still for a beat at the place the target asks for. */
export declare function settled(s: Spring, beat?: number): boolean;
