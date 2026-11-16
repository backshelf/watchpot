import type { Pcm } from "./ffmpeg";
export type Root = {
    hz: number;
    confidence: number;
};
/** A root is only kept at or above this confidence. */
export declare const MIN_CONFIDENCE = 0.8;
/**
 * The root of a tonal file by YIN over the loudest 200 ms: the frame of best confidence wins. `null` when the file is
 * too short to analyse or no frame reaches `MIN_CONFIDENCE`.
 */
export declare function detectRoot(pcm: Pcm): Root | null;
/** A note name (`"A4"`, `"C#3"`, `"Bb2"`) or a number of Hz as Hz; `undefined` when it is neither. */
export declare function rootToHz(root: string | number): number | undefined;
/** The nearest note's name for a log line (`"A4 +3c"`). */
export declare function noteName(hz: number): string;
