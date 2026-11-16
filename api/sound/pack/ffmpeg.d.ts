/** Every sample of a pack is decoded and encoded at this rate. */
export declare const RATE = 48000;
/** Planar float PCM: one array per channel (1 or 2), all the same length. */
export type Pcm = {
    channels: Float32Array[];
    rate: number;
};
export declare class FfmpegError extends Error {
}
/** Fails with one clear line when `ffmpeg` is not on PATH. */
export declare function requireFfmpeg(): void;
/** Whether ffmpeg is installed, for tests that skip without it. */
export declare function hasFfmpeg(): boolean;
export declare function interleave(pcm: Pcm): Uint8Array;
export declare function deinterleave(bytes: Uint8Array, channels: number, rate?: number): Pcm;
/** Decodes any file ffmpeg reads to stereo float at `RATE` (a mono file arrives as two equal channels). */
export declare function decode(file: string): Promise<Pcm>;
/**
 * Time-stretches by `ratio` (> 1 is faster and shorter) without moving the pitch, with rubberband. The result is
 * exactly the source's length over `ratio`: at some ratios rubberband ends tens of milliseconds early, dropping the
 * sound's tail, so the source is fed in with silence after it and the result cut to the length it should have.
 */
export declare function stretch(pcm: Pcm, ratio: number): Promise<Pcm>;
/** Moves the pitch by `ratio` (2 is an octave up) and keeps the length, with rubberband. */
export declare function repitch(pcm: Pcm, ratio: number): Promise<Pcm>;
/** The raw ebur128 report for a pcm: integrated loudness (LUFS) and true peak (dBTP), either may be -Infinity. */
export declare function ebur128(pcm: Pcm): Promise<{
    lufs: number;
    truePeakDb: number;
}>;
/** Encodes to `file`: Opus in Ogg (bitrate in kbit/s) or 24-bit FLAC. */
export declare function encode(pcm: Pcm, file: string, codec: "opus" | "flac", kbps: number): Promise<void>;
