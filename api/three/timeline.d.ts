/** One move of a job: its natural length in seconds; a dwell soaks up the time a slow job leaves over. */
export interface Move<K extends string> {
    readonly kind: K;
    readonly seconds: number;
    readonly dwell?: boolean;
}
/** A job's moves laid along its progress: each runs from `from` to `to` (0..1, contiguous, ending at 1). */
export type Plan<K extends string> = readonly {
    readonly kind: K;
    readonly from: number;
    readonly to: number;
}[];
/**
 * Fits `moves` to a job of `seconds`. A job shorter than the moves plays them all faster; a longer one slows the
 * motions up to `maxStretch` times their natural length (default 1.6) and gives the remainder to the dwells, or
 * stretches everything when there are no dwells.
 */
export declare function planOf<K extends string>(moves: readonly Move<K>[], seconds: number, maxStretch?: number): Plan<K>;
/** The move playing at progress `v`, and how far through it (0..1). */
export declare function moveAt<K extends string>(plan: Plan<K>, v: number): {
    index: number;
    kind: K;
    t: number;
};
/** Where the first move of `kind` starts and ends, as progress; 1 to 1 when the plan has none. */
export declare function spanOf<K extends string>(plan: Plan<K>, kind: K): {
    from: number;
    to: number;
};
