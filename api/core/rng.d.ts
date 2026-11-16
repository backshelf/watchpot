/**
 * Seeded PRNG (sfc32) with an immutable, serialisable state: four uint32s.
 * Every draw returns the value and the next state; the store saves the state, so a reload cannot reroll.
 */
export type RngState = readonly [number, number, number, number];
/** Hash a string or number seed into four uint32s (cyrb128). */
export declare function seedRng(seed: string | number): RngState;
/** A fresh state from entropy, for a new profile: the caller hands over the wall time and the random source. */
export declare function randomSeed(wallMs: number, random: () => number): RngState;
/** Uniform float in [0, 1). */
export declare function nextFloat(state: RngState): [number, RngState];
/** Uniform integer in [0, n). */
export declare function nextInt(state: RngState, n: number): [number, RngState];
/** Picks an index by weight (weights need not sum to one). Zero-weight entries are never picked. */
export declare function pickWeighted(state: RngState, weights: readonly number[]): [number, RngState];
