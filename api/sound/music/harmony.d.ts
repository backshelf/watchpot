/**
 * The harmony clock: the key, the scale and the chord every pitched cue is transposed onto. Arithmetic on the main
 * thread: a recording has a root, the clock has a key, and a play is a rate.
 *
 * A degree counts from 0 (the key's tonic) along the scale; past the scale's length it climbs octaves. A recording
 * with a root moves to the nearest copy of its degree's note, a fifth above preferred to a fourth below (so degree 0
 * to 6 never moves a take more than seven semitones); one with no root is moved relative to itself (degree 0 is 1).
 * A ladder is the other reading (`climb`): step 0 goes to the nearest copy of the tonic and every step is measured up
 * from there, so a ladder always rises, however far the recording's root is from the key.
 */
import type { CorePort } from "../port";
import type { Harmony, Scale } from "../types";
import type { TransportCore } from "./transport";
/** The harmony clock as `engine.ts` holds it. */
export interface HarmonyCore {
    /** What a game sees: `sound.harmony`. */
    api: Harmony;
    /**
     * The ratio that puts one play on the clock. `rootHz` is the recording's root (undefined when it has none: the
     * ratio is then relative to the sound as it is, so degree 0 is 1). `degree` is the scale degree asked for;
     * undefined asks for the nearest tone of the chord (or of the scale, with no chord set). `pending` reads the
     * harmony a `set` waiting for its grid line will move to, rather than the one sounding now. `climb` reads the
     * degree as a ladder's step: measured up from the nearest copy of the tonic, never wrapped down on its own.
     */
    pitch(rootHz: number | undefined, degree: number | undefined, pending?: boolean, climb?: boolean): number;
    /** Calls `fn` on every `set` (as it is asked, not when it lands); the returned function stops it. */
    onChange(fn: () => void): () => void;
}
/** Each scale's steps, in semitones above the tonic. */
export declare const SCALES: Readonly<Record<Scale, readonly number[]>>;
/** A key's tonic as a pitch class (C is 0) and whether it names a minor key; null for a name that is not a key. */
export declare function parseKey(key: string): {
    tonic: number;
    minor: boolean;
} | null;
export declare function createHarmony(transport: TransportCore, port: CorePort): HarmonyCore;
