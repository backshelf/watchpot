import type { Pcm } from "./ffmpeg";
export type Trimmed = {
    pcm: Pcm;
    leadMs: number;
    tailMs: number;
};
/** The first and last index where any channel is above the floor, or `null` for silence. */
export declare function audibleRange(pcm: Pcm): [number, number] | null;
/**
 * Cuts a shot (or an IR): leading silence down to 1 ms before the first sound, the tail where it falls under -60 dBFS
 * at the last zero crossing before it, a 2 ms fade in and a 2 ms fade out. `null` when the file is all silence.
 */
export declare function trimShot(pcm: Pcm): Trimmed | null;
/** Cuts or zero-pads every channel to exactly `samples` frames (a loop's whole bars). */
export declare function fitLength(pcm: Pcm, samples: number): Pcm;
