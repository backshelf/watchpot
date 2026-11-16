/** `t` held to 0..1. */
export declare const clamp01: (t: number) => number;
/** Cubic ease-out: leaves fast, arrives at rest. */
export declare const easeOut: (t: number) => number;
/** Cubic ease-in-out: leaves and arrives at rest. */
export declare const easeInOut: (t: number) => number;
/** Smoothstep over 0..1: the gentlest curve that leaves and arrives at rest. */
export declare const smooth: (t: number) => number;
/**
 * A per-frame lerp factor `k` tuned at 60 fps, rescaled for a frame of `dt` seconds, so a chase reads the same at
 * any frame rate. A frame longer than a tenth of a second counts as a tenth: a stall never jumps the chase.
 */
export declare const follow: (k: number, dt: number) => number;
/** The share of the way an exponential chase at `rate` per second covers in `dt` seconds. */
export declare const approach: (rate: number, dt: number) => number;
