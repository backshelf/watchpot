import type { Decimal, FeatureSpec, Move } from "../core";
import { type Rng, type Schedule } from "./schedule";
import type { SimWorld } from "./world";
/**
 * The auto-player: plays any game from its features' `moves`, with no persona written for it. At each look it buys
 * the move of the best value per share of its currency held, again and again while one is affordable, then takes
 * every free move (a claim, an open), and goes round again while either did anything.
 */
/** What the auto-player reads of a game: its features (a `Game` is one). */
export interface Playable {
    readonly features: readonly FeatureSpec[];
}
/** Every feature's moves now, in the game's feature order. */
export declare function movesOf<S extends object>(game: Playable, state: S): Move<S>[];
/** Options for `autoPlayer`: how to read a balance by currency, and the most moves one look may make. */
export interface AutoPlayerOptions<S> {
    /** What the state holds of a currency a move's cost names: the auto-player buys only what this covers. */
    balance(state: S, currency: string): Decimal;
    /** The most moves one look makes, against a move that never stops going through. Default 1,000. */
    maxMoves?: number;
}
/** What a look did: purchases and free moves taken. */
export interface LookResult {
    bought: number;
    free: number;
}
/** A store whose state the auto-player reads (the game's state `S`); a move's `apply` gets it whole. */
export interface AutoStore<S> {
    getState(): S;
}
/**
 * The auto-player for a game: `look(store)` plays one look. A purchase's worth is its `value` over the
 * share of its currency it spends (`amount / balance`), so a gem and a gold purchase compare; ties go to the first
 * declared. A move whose `apply` refuses is not tried again in the look; one valued at or below 0 is never taken.
 */
export declare function autoPlayer<S extends object>(game: Playable, { balance, maxMoves }: AutoPlayerOptions<S>): {
    look(store: AutoStore<S>): LookResult;
};
/** One look's place in the days: its day, its session (from 0, across the run), its index in the session. */
export interface LookAt {
    day: number;
    session: number;
    look: number;
    /** The schedule's keypresses at this look. */
    presses: number;
}
/** Options for `playDays`: the world, the schedule, how many days, the rng and the look and day-end callbacks. */
export interface PlayDaysOptions<W extends SimWorld> {
    world: W;
    schedule: Schedule;
    days: number;
    /** The first morning (epoch ms): day `d` starts `d` days after it. */
    start: number;
    /** The behaviour stream the days are planned from. */
    rng: Rng;
    /** One look at the game. */
    look(at: LookAt): void;
    /** After a look and the play to the next (a sampler's `look`). */
    afterLook?(): void;
    /** The close of a day played (from 1); a skipped day has none. */
    dayEnd?(day: number): void;
}
/**
 * Days of play on a schedule (`planDay`): before each session the gap is a closed tab (`away`) or, when the session
 * before left it open, play in the background; a session is looks at its cadence, the time between them played,
 * until its attended time runs out.
 */
export declare function playDays<W extends SimWorld>({ world, schedule, days, start, rng, look, afterLook, dayEnd, }: PlayDaysOptions<W>): void;
