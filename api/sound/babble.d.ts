import type { SoundHost } from "./port";
import type { Babble, BabbleDef } from "./types";
/** One syllable of a line: when it starts and how it is shaped. */
export interface Syllable {
    /** The index in the text of the syllable's first character. */
    index: number;
    /** Seconds from the line's start, and how long it lasts. */
    start: number;
    length: number;
    /** A ratio on the voice's pitch. */
    pitch: number;
    /** The vowel's two formants, in Hz. */
    formant1: number;
    formant2: number;
    /** 0..1: how much of a consonant's burst opens it. */
    noise: number;
    /** 0..1. */
    level: number;
}
/**
 * A line as syllables: deterministic for a given text. `rate` is syllables a second (default 9), `pitch` a ratio.
 *
 * Each syllable lasts a beat of `1 / rate` scaled by its letters, and longer before punctuation; a gap follows a
 * word, a longer one a comma and a longer still a sentence. Pitch falls across a sentence to a full stop (from
 * higher to an exclamation mark) and rises over the last syllables to a question mark; a capitalised word steps up
 * on its first syllable and a word in capitals is higher and louder throughout. A small wobble seeded by the text
 * keeps it from droning.
 */
export declare function syllables(text: string, options?: {
    rate?: number;
    pitch?: number;
}): Syllable[];
/** Builds a babble voice over a sound. At most 4 exist at once. */
export declare function createBabble(def: BabbleDef<string>, host: SoundHost): Babble;
