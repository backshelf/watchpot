/** zzfx voices by name and their positional codec. No zzfx import, so it reads anywhere without an AudioContext. */
export type Wave = "sine" | "triangle" | "saw" | "tan" | "noise" | "square";
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
export declare function toParams(v: Voice): ZzfxParams;
/** Length of a sound in seconds by zzfx's own envelope arithmetic (attack + decay + sustain + release + delay). */
export declare function soundSeconds(layers: readonly Layer[]): number;
/** Mixes layers into one buffer, each voice built by `build` and placed at its `at` offset. Pure. */
export declare function mixLayers(layers: readonly Layer[], build: (params: ZzfxParams) => Float32Array, sampleRate: number): Float32Array;
