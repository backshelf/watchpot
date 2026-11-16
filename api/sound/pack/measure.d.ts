import { type Pcm } from "./ffmpeg";
export type Loudness = {
    /** Integrated loudness, LUFS. */
    lufs: number;
    /** True peak, dBFS. */
    peakDb: number;
};
/** Repeats a short sound end to end until it fills a block, so its loudness is its own and not diluted by silence. */
export declare function tiled(pcm: Pcm): Pcm;
/** Integrated loudness and true peak by ffmpeg's `ebur128`. */
export declare function measure(pcm: Pcm): Promise<Loudness>;
/** dB to a linear ratio. */
export declare const fromDb: (db: number) => number;
export declare const toDb: (linear: number) => number;
/** The correlation of two channels (1 = the same signal). Silence counts as the same. */
export declare function correlation(l: Float32Array, r: Float32Array): number;
/** Folds a stereo pair to mono when the channels correlate above `threshold` (default 0.98); otherwise returns it as is. */
export declare function foldMono(pcm: Pcm, threshold?: number): Pcm;
/** Multiplies every sample by `gain` in place. */
export declare function applyGain(pcm: Pcm, gain: number): void;
/** The largest absolute sample over every channel. */
export declare function samplePeak(pcm: Pcm): number;
