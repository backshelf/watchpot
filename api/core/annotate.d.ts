/** Something to mark: its id, and every spelling of it (a phrase may hold spaces, hyphens and apostrophes). */
export interface LexiconEntry {
    id: string;
    words: readonly string[];
}
/** A run of the text: plain, or the word of the entry `id`. */
export interface Segment {
    text: string;
    id?: string;
}
/** A lexicon made ready to match (by `lexicon`): every phrase, lowercased, under its first word, longest first. */
export interface Lexicon {
    byFirst: ReadonlyMap<string, readonly {
        phrase: string;
        id: string;
    }[]>;
}
/**
 * Makes a lexicon ready, once, for any number of texts. Spaces in a phrase are tidied and its case dropped. A
 * phrase two entries share goes to the earlier one; an empty phrase is dropped.
 */
export declare function lexicon(entries: readonly LexiconEntry[]): Lexicon;
/**
 * `text` in segments. Whole words only (a hyphen joins a word: `hands-free` holds no `free`), any case, and each
 * entry is marked once, where it first turns up. At each word, the longest phrase starting there whose entry is
 * allowed and not yet marked is marked; the scan carries on after it, so marks never overlap. `allow` leaves an
 * entry out (and lets a shorter phrase of another entry be found in its place): what the player has not met yet.
 * The segments' texts joined are `text`, exactly. Its work grows with the text's length, not the lexicon's.
 */
export declare function annotate(lex: Lexicon, text: string, allow?: (id: string) => boolean): Segment[];
/** What `annotator` takes: how many scopes and how many texts a scope it keeps before it starts over. */
export interface AnnotatorOptions {
    /** The scopes kept; the oldest goes when another arrives. Default 8. */
    scopes?: number;
    /** The texts a scope keeps before it starts over. Default 4000. */
    texts?: number;
}
/**
 * `annotate` with a memory: the segments of a text are worked out once per `scope` (whatever `allow` depends on,
 * as a string) and handed back the same array after. Meant for a fixed set of texts drawn again and again; a text
 * that holds a moving figure should not be passed through it, so the memory is capped all the same (the oldest
 * scope goes first, and a scope that fills up starts over).
 */
export declare function annotator(lex: Lexicon, options?: AnnotatorOptions): (text: string, scope: string, allow?: (id: string) => boolean) => Segment[];
