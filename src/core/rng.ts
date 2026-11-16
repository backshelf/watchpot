/**
 * Seeded PRNG (sfc32) with an immutable, serialisable state: four uint32s.
 * Every draw returns the value and the next state; the store saves the state, so a reload cannot reroll.
 */
export type RngState = readonly [number, number, number, number];

/** Hash a string or number seed into four uint32s (cyrb128). */
export function seedRng(seed: string | number): RngState {
  const str = String(seed);
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  let state: RngState = [(h1 ^ h2 ^ h3 ^ h4) >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  // Warm up: sfc32 needs a few rounds before the output decorrelates from the seed.
  for (let i = 0; i < 12; i++) state = nextU32(state)[1];
  return state;
}

/** A fresh state from entropy, for a new profile: the caller hands over the wall time and the random source. */
export function randomSeed(wallMs: number, random: () => number): RngState {
  const r = () => Math.floor(random() * 0x1_0000_0000);
  return seedRng(`${wallMs}:${r()}:${r()}`);
}

function nextU32(state: RngState): [number, RngState] {
  let [a, b, c, d] = state;
  a >>>= 0;
  b >>>= 0;
  c >>>= 0;
  d >>>= 0;
  let t = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  t = (t + d) | 0;
  c = (c + t) | 0;
  return [t >>> 0, [a >>> 0, b >>> 0, c >>> 0, d >>> 0]];
}

/** Uniform float in [0, 1). */
export function nextFloat(state: RngState): [number, RngState] {
  const [u, next] = nextU32(state);
  return [u / 4294967296, next];
}

/** Uniform integer in [0, n). */
export function nextInt(state: RngState, n: number): [number, RngState] {
  const [f, next] = nextFloat(state);
  return [Math.floor(f * Math.max(1, Math.floor(n))), next];
}

/** Picks an index by weight (weights need not sum to one). Zero-weight entries are never picked. */
export function pickWeighted(state: RngState, weights: readonly number[]): [number, RngState] {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  const [f, next] = nextFloat(state);
  let acc = 0;
  let last = -1;
  for (let i = 0; i < weights.length; i++) {
    const w = Math.max(0, weights[i] ?? 0);
    if (w <= 0) continue;
    last = i;
    acc += w;
    if (f * total < acc) return [i, next];
  }
  return [last, next];
}
