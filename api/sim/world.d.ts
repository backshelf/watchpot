import { type AnyGame, type IdleStore, type StateOf } from "../core";
/** What the harness drives: any store with the root clock actions (`createIdleStore`'s, or a game's wrapper of it). */
export interface SimStore {
    getState(): {
        tick(dtMs: number, now?: number): void;
        catchUp(now?: number): void;
        gameNow(): number;
    };
}
/**
 * A headless profile: a store reading a clock the simulator owns, and the two ways time passes for a player. The
 * store must read `now()` as its wall (its `now` option), so every action that defaults its time sees sim time.
 */
export interface SimWorld<S extends SimStore = SimStore> {
    store: S;
    /**
     * The sim's wall time: the day loop and the samples read it. Not the game's time: `gameNow()` adds the profile's
     * clock offset, so stamp actions with `gameNow()` and measure days and hours with `now()`.
     */
    now(): number;
    /** The store's game time (the wall plus the profile's clock offset): what every action is stamped with. */
    gameNow(): number;
    /** Plays `ms` with the tab open, in ticks of at most `stepMs` (default the world's `tickMs`). */
    play(ms: number, stepMs?: number): void;
    /** Closes the tab for `ms`, then opens it: one catch-up over the gap, as on a return. */
    away(ms: number): void;
}
/**
 * The shell's tick, which the harness plays in: a minute. `playStraight` and `runFit` step a second at a time
 * instead (their own `tickMs` and `stepMs`); pass `tickMs` to match them when a run must agree with one of theirs.
 */
export declare const SIM_TICK_MS = 60000;
/** Options for `createSimWorld`: the length of one play tick. */
export interface SimWorldOptions {
    /** The longest tick `play` takes. Default `SIM_TICK_MS`. */
    tickMs?: number;
}
/**
 * The harness: `build` makes the store over the clock it is handed (pass it as the store's `now`), and the world
 * opens it at `start` with one catch-up, as a first load does.
 */
export declare function createSimWorld<S extends SimStore>(build: (now: () => number) => S, start: number, { tickMs }?: SimWorldOptions): SimWorld<S>;
/**
 * A store for the sim: the game on storage that never writes (a debounce that never fires; serialising every set is
 * the slowest thing a sim could do), reading `now`, its draws seeded so one seed is one run.
 */
export declare function simStore<G extends AnyGame>(game: G, now: () => number, seed?: string | number): IdleStore<StateOf<G["features"]>>;
