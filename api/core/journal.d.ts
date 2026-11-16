/** The journal: a capped log of typed lines and a cursor over it. */
/** One line of a log: when, what kind, what it says. */
export interface JournalLine<K extends string = string> {
    at: number;
    kind: K;
    text: string;
}
/** Pushes a line, then drops from the front past `keep` (default 40; 0 or less keeps nothing). Works on a draft. */
export declare function pushLine<L>(log: L[], line: L, keep?: number): void;
/**
 * The lines after `last`: all of them when `last` is undefined, what follows it when it is in the log (found by
 * identity), nothing when it is not (a swapped profile is not news).
 */
export declare function linesSince<L>(log: readonly L[], last: L | undefined): L[];
