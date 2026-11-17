import { type Decimal, type FeatureSpec, type Move, type StateOf } from "../core";
import { type Rng, type Schedule } from "./schedule";
import type { SimWorld } from "./world";
/**
 * The auto-player: plays any game from its features' `moves`, with no persona written for it. At each look it buys
 * the move of the best worth per share of its currency held, again and again while one is affordable, then takes
 * each free move (a claim, an open) once, and goes round again while either did anything.
 *
 * What a purchase is worth is worked out where it can be: the game names one `objective` (what the player is
 * trying to grow, usually income a second), and a purchase's worth is the objective after buying it less the
 * objective before, tried on the state and put back. A move that does not move the objective at once (an unlock,
 * an offline cap, a reset) comes to nothing that way, and says its own `worth`.
 */
/** What the auto-player reads of a game: its features (a `Game` is one). */
export interface Playable {
    readonly features: readonly FeatureSpec[];
}
/** Every feature's moves now, in the game's feature order. */
export declare function movesOf<S extends object>(game: Playable, state: S): Move<S>[];
/** Options for `autoPlayer`: the objective, how to read a balance by currency, and the limits of one look. */
export interface AutoPlayerOptions<S> {
    /**
     * What the player is trying to grow, read off the state: usually income a second. With it, a move that states
     * no `worth` is worth what buying it adds to this. Without it, every move must state its `worth` (the first one
     * that does not is named in the error).
     */
    objective?(state: S): number;
    /**
     * What the state holds of a currency a move's cost names: the auto-player buys only what this covers. Default,
     * when the game has exactly one `currencies` feature, its balance of that currency; otherwise required.
     */
    balance?(state: S, currency: string): Decimal;
    /** The most moves one look makes, against a purchase that never stops going through. Default 1,000. */
    maxMoves?: number;
    /**
     * How many looks a worked-out worth is kept for while nothing is bought (default 10). Every purchase and free
     * move drops what was kept; 1 works each one out afresh at every look.
     */
    worthLooks?: number;
    /** Silences the warning for features that look purchasable and declare no moves. */
    quiet?: boolean;
    /** What an earlier auto-player remembered (`remember()`, kept in a snapshot): this one carries on from it. */
    memory?: AutoPlayerMemory;
}
/**
 * What an auto-player carries between looks: the worths it worked out and keeps, how many looks they are kept for
 * yet, which moves' worked-out worth ever came above nothing, and whether it has warned. Plain data, kept in a
 * snapshot, so a run resumed from one buys what the run that took it would have.
 */
export interface AutoPlayerMemory {
    readonly kept: readonly (readonly [string, number])[];
    readonly keptFor: number;
    readonly worked: readonly (readonly [string, boolean])[];
    readonly warned: boolean;
}
/** What a look did: purchases and free moves taken. */
export interface LookResult {
    bought: number;
    free: number;
}
/**
 * A store whose state the auto-player reads (the game's state `S`); a move's `apply` gets it whole. `trial`, when
 * the store has one (the plain store does), runs something and puts the state back; without it the auto-player
 * keeps the state it read and sets it back, which a store of immutable states (the real one) allows.
 */
export interface AutoStore<S> {
    getState(): S;
    trial?<T>(run: () => T): T;
    /**
     * A value worked out from the state and kept until what it read changes (the plain store has one). The
     * auto-player keeps each feature's move list this way, and drops them all when a fit table changes (prices live
     * outside the state); without it, every look lists them afresh. A game whose moves read anything else outside its
     * state (the wall clock, a module variable) must not hand the auto-player a store with `memo`.
     */
    memo?<T>(fn: (state: S) => T): () => T;
}
/** The auto-player `autoPlayer` makes. */
export interface AutoPlayer<S> {
    /** Plays one look. */
    look(store: AutoStore<S>): LookResult;
    /**
     * The moves with no `worth` of their own whose worked-out worth has never come above nothing: the auto-player
     * has never bought them, and each wants a hand-written `worth`. Read it at the end of a run.
     */
    blind(): readonly string[];
    /** What it carries between looks, as plain data: pass it as `memory` to carry on from here. */
    remember(): AutoPlayerMemory;
}
/**
 * The auto-player for a game: `look(store)` plays one look. A purchase's score is its worth over the share of its
 * currency it spends (`amount / balance`), so a gem and a gold purchase compare; ties go to the first declared. A
 * move whose `apply` refuses is not tried again in the look; one worth nothing or less is never taken; a free
 * move is taken once a look unless it says `repeat`.
 */
export declare function autoPlayer<F extends readonly FeatureSpec[]>(game: {
    readonly features: F;
}, options?: AutoPlayerOptions<StateOf<F>>): AutoPlayer<StateOf<F>>;
export declare function autoPlayer<S extends object>(game: Playable, options?: AutoPlayerOptions<S>): AutoPlayer<S>;
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
    /** Stops the run when true, checked after each look's play (a "when does X first happen" probe). */
    until?(): boolean;
    /** Stops the run once this much sim time has passed since `start` (checked like `until`). */
    hours?: number;
}
/**
 * Days of play on a schedule (`planDay`): before each session the gap is a closed tab (`away`) or, when the session
 * before left it open, play in the background; a session is looks at its cadence, the time between them played,
 * until its attended time runs out. `until` or `hours` stops it early, after the look that crossed it; a day cut
 * short has no `dayEnd`.
 */
export declare function playDays<W extends SimWorld>({ world, schedule, days, start, rng, look, afterLook, dayEnd, until, hours, }: PlayDaysOptions<W>): void;
