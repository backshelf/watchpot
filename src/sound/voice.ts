/** zzfx voices by name and their positional codec. No zzfx import, so it reads anywhere without an AudioContext. */

export type Wave = "sine" | "triangle" | "saw" | "tan" | "noise" | "square";

const WAVES: Record<Wave, number> = { sine: 0, triangle: 1, saw: 2, tan: 3, noise: 4, square: 5 };

/** One zzfx voice by name. Units as zzfx: seconds, Hz; `slide` is 500 Hz/s per unit; negative `filter` is lowpass. */
export interface Voice {
  volume?: number;
  randomness?: number;
  frequency?: number;
  attack?: number;
  sustain?: number;
  release?: number;
  wave?: Wave;
  shapeCurve?: number;
  slide?: number;
  deltaSlide?: number;
  pitchJump?: number;
  pitchJumpTime?: number;
  repeatTime?: number;
  noise?: number;
  modulation?: number;
  bitCrush?: number;
  delay?: number;
  sustainVolume?: number;
  decay?: number;
  tremolo?: number;
  filter?: number;
}

/** A voice placed in time: `at` seconds after the sound starts. */
export interface Layer {
  voice: Voice;
  at?: number;
}

/** The positional parameter list zzfx takes; undefined slots keep zzfx's defaults. */
export type ZzfxParams = (number | undefined)[];

/** The positional parameter list zzfx's `buildSamples` takes. Undefined slots keep zzfx's defaults. */
export function toParams(v: Voice): ZzfxParams {
  return [
    v.volume,
    v.randomness,
    v.frequency,
    v.attack,
    v.sustain,
    v.release,
    v.wave === undefined ? undefined : WAVES[v.wave],
    v.shapeCurve,
    v.slide,
    v.deltaSlide,
    v.pitchJump,
    v.pitchJumpTime,
    v.repeatTime,
    v.noise,
    v.modulation,
    v.bitCrush,
    v.delay,
    v.sustainVolume,
    v.decay,
    v.tremolo,
    v.filter,
  ];
}

/** Length of a sound in seconds by zzfx's own envelope arithmetic (attack + decay + sustain + release + delay). */
export function soundSeconds(layers: readonly Layer[]): number {
  return Math.max(
    0,
    ...layers.map(({ voice: v, at = 0 }) => {
      const release = v.release ?? 0.1;
      return at + (v.attack ?? 0) + (v.decay ?? 0) + (v.sustain ?? 0) + release + (v.delay ?? 0);
    }),
  );
}

/** Mixes layers into one buffer, each voice built by `build` and placed at its `at` offset. Pure. */
export function mixLayers(
  layers: readonly Layer[],
  build: (params: ZzfxParams) => Float32Array,
  sampleRate: number,
): Float32Array {
  const parts = layers.map(({ voice, at = 0 }) => ({
    offset: Math.round(at * sampleRate),
    samples: build(toParams(voice)),
  }));
  const length = Math.max(0, ...parts.map((p) => p.offset + p.samples.length));
  const out = new Float32Array(length);
  for (const { offset, samples } of parts) {
    for (let i = 0; i < samples.length; i++) {
      out[offset + i] = (out[offset + i] ?? 0) + (samples[i] ?? 0);
    }
  }
  return out;
}
