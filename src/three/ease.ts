// Easing for animation code that runs per frame. Pure numbers.

/** `t` held to 0..1. */
export const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/** Cubic ease-out: leaves fast, arrives at rest. */
export const easeOut = (t: number): number => 1 - (1 - clamp01(t)) ** 3;

/** Cubic ease-in-out: leaves and arrives at rest. */
export const easeInOut = (t: number): number => {
  const k = clamp01(t);
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
};

/** Smoothstep over 0..1: the gentlest curve that leaves and arrives at rest. */
export const smooth = (t: number): number => {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
};

/**
 * A per-frame lerp factor `k` tuned at 60 fps, rescaled for a frame of `dt` seconds, so a chase reads the same at
 * any frame rate. A frame longer than a tenth of a second counts as a tenth: a stall never jumps the chase.
 */
export const follow = (k: number, dt: number): number => 1 - (1 - k) ** (Math.min(dt, 0.1) * 60);

/** The share of the way an exponential chase at `rate` per second covers in `dt` seconds. */
export const approach = (rate: number, dt: number): number => 1 - Math.exp(-Math.max(0, dt) * rate);
