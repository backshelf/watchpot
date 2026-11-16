import { type Decimal, type DecimalSource } from "./decimal";
/**
 * Changes, watched in one place. Feedback wants to know what just happened (a count went up, a threshold was
 * crossed, a thing appeared for the first time, a best was beaten), and the store only says what is. `watchChanges`
 * subscribes once and runs the game's rules over each pair of states, the one before and the one after, each rule
 * emitting the game's own typed events. A load or an import is not news: a change the game calls a jump starts a
 * settling window in which nothing a rule emits goes out (the rules run, to keep their tallies, unless the watch or
 * the rule says to skip them), and the first moments after the watch starts settle the same way.
 */
/** What a rule gets besides the two states: the clock, the settling flag and small per-kind memories. */
export interface WatchTools {
    /** True inside the settling window: whatever a rule emits now is dropped. */
    readonly settling: boolean;
    /** The watch's duration clock. */
    now(): number;
    /** True at most once per `ms` for `kind` (the time is taken only when it says yes): a machine's win, sparingly. */
    spare(kind: string, ms: number): boolean;
    /**
     * When `value` beats the best seen for `kind` since the watch started (or the last jump), the best it beat (a
     * Decimal, so truthy even at 0); otherwise undefined. The first value seen only sets the best. Bests are kept as
     * Decimals, so any size compares.
     */
    best(kind: string, value: DecimalSource): Decimal | undefined;
    /** How far into a quick run of `kind` this is: 0, then one more each time it comes within `windowMs` of the last. */
    streak(kind: string, windowMs: number): number;
}
/** A rule: reads the change from `prev` to `next` and emits zero or more events. */
export type WatchRule<S, E> = (next: S, prev: S, emit: (event: E) => void, tools: WatchTools) => void;
/** Whether rules run inside the settling window (their events are dropped either way). */
export type WhileSettling = "run" | "skip";
/** A rule with its own say on settling: `{ rule, whileSettling: "run" }` keeps acknowledging under a skipping watch. */
export interface WatchRuleEntry<S, E> {
    rule: WatchRule<S, E>;
    whileSettling: WhileSettling;
}
/** Options of `watchChanges`. */
export interface WatchOptions<S, E> {
    /** Run in order on every change; their events go out in the order emitted. */
    rules: readonly (WatchRule<S, E> | WatchRuleEntry<S, E>)[];
    /** Hears every event that is not settled away. */
    on: (event: E) => void;
    /** A change that is not play (a load, an import, a fresh profile): settle, forget the bests and streaks. */
    jumped?: (next: S, prev: S) => boolean;
    /** How long a settling window lasts after each jump, ms (and at the start, unless `startMs`). Default 2000. */
    settleMs?: number;
    /** How long the settling window at the start lasts, ms. Default `settleMs`. */
    startMs?: number;
    /**
     * Whether rules run while settling: "run" (the default) keeps their tallies and lets `spare`, `best` and `streak`
     * take in what the load brought; "skip" leaves them untouched until the window ends. A `WatchRuleEntry` overrides
     * it for its rule.
     */
    whileSettling?: WhileSettling;
    /** A duration clock. Default `performance.now`. */
    now?: () => number;
    /** A rule that throws is reported here and the others still run. Default `console.error`. */
    onError?: (error: unknown) => void;
}
/** A running watch: `stop()` unsubscribes, `settle(ms?)` opens a settling window now. */
export interface Watch {
    stop(): void;
    settle(ms?: number): void;
}
/**
 * Anything with zustand's `subscribe(listener(next, prev))`. A store that also says how many times its profile has
 * been replaced (`IdleStore.profileSwaps`) has every such change treated as a jump, whatever `jumped` says.
 */
export interface Watchable<S> {
    subscribe(listener: (next: S, prev: S) => void): () => void;
    profileSwaps?(): number;
}
/**
 * The highest of `marks` that `before` was under and `after` has reached (marks in any order), or undefined when
 * the change crossed none. For milestones, a count of runs passing a release, a level's threshold. Pure.
 */
export declare function crossedMark<M extends DecimalSource>(marks: readonly M[], before: DecimalSource, after: DecimalSource): M | undefined;
/** The keys `after` has that `before` lacks, in `after`'s order: the firsts of an id-keyed record. Pure. */
export declare function newKeys(before: Readonly<Record<string, unknown>> | undefined, after: Readonly<Record<string, unknown>> | undefined): string[];
/** Watches `store` with `rules` until `stop()`; see the module note. */
export declare function watchChanges<S, E>(store: Watchable<S>, options: WatchOptions<S, E>): Watch;
