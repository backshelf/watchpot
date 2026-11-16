import { type AnyGame, type IdleStore, type PlainData, type PlainStore, type StateOf } from "../core";
/**
 * What the harness drives: any store with the root clock actions (`createIdleStore`'s, or a game's wrapper of it). A
 * store with `snapshot` and `restore` (the plain store's) can be snapshotted and resumed.
 */
export interface SimStore {
    getState(): {
        tick(dtMs: number, now?: number): void;
        catchUp(now?: number): void;
        gameNow(): number;
    };
    snapshot?(): PlainData;
    restore?(data: PlainData): void;
}
/** A world at a moment: the sim clock and the store's data (the rng's position is in the data). */
export interface WorldSnapshot {
    readonly now: number;
    readonly state: PlainData;
}
/**
 * A headless profile: a store reading a clock the simulator owns, and the two ways time passes for a player. The
 * store must read `now()` as its wall (its `now` option), so every action that defaults its time sees sim time.
 */
export interface SimWorld<S extends SimStore = SimStore> {
    store: S;
    /** The longest tick `play` takes unless told otherwise: the world's quality. */
    readonly tickMs: number;
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
    /** The world now, to resume from (`resumeSimWorld`). Throws for a store that cannot be snapshotted. */
    snapshot(): WorldSnapshot;
}
/**
 * How finely a sim steps time: the length of one play tick. `exact` is a second, the grain the shell plays at and
 * the one a fit is proved on; `quick` and `rough` take longer steps, so a long game can be read for its general
 * curve and its pauses in a fraction of the time, at the cost of anything that happens inside a step (an
 * autobuyer fires once a step, a timed window is seen a step late).
 */
export declare const SIM_QUALITY: {
    readonly exact: 1000;
    readonly quick: 10000;
    readonly rough: 60000;
};
/** A named sim quality: `exact`, `quick` or `rough`. */
export type SimQuality = keyof typeof SIM_QUALITY;
/** The one default tick, everywhere in the sim: a second (`SIM_QUALITY.exact`). */
export declare const SIM_TICK_MS: number;
/** Options for `createSimWorld`: the quality, or the length of one play tick outright. */
export interface SimWorldOptions {
    /** How finely time is stepped. Default `"exact"`. */
    quality?: SimQuality;
    /** The longest tick `play` takes, when a named quality will not do. Default: the quality's. */
    tickMs?: number;
}
/**
 * The harness: `build` makes the store over the clock it is handed (pass it as the store's `now`), and the world
 * opens it at `start` with one catch-up, as a first load does.
 */
export declare function createSimWorld<S extends SimStore>(build: (now: () => number) => S, start: number, options?: SimWorldOptions): SimWorld<S>;
/**
 * A world picked up where a snapshot left it (`world.snapshot()`, or `SimSnapshot.world`): `build` makes a fresh
 * store over the clock, set to the snapshot's time, and the snapshot's data is put into it. There is no opening
 * catch-up: the run carries on as if it had never stopped, and plays on exactly as the one that took it. The store
 * must have `restore` (the plain store's: `simStore`).
 */
export declare function resumeSimWorld<S extends SimStore>(build: (now: () => number) => S, from: WorldSnapshot, options?: SimWorldOptions): SimWorld<S>;
/**
 * A store for the sim: the game on plain data (`createPlainStore`), reading `now`, its draws seeded so one seed
 * is one run. Nothing is saved, and a pass costs the game's own code and little else. The state it hands back is
 * changed in place: copy what a sample must keep.
 */
export declare function simStore<G extends AnyGame>(game: G, now: () => number, seed?: string | number): PlainStore<StateOf<G["features"]>>;
/**
 * The real store for a sim, when a run must go through the very code the browser runs (immer, zustand, the save's
 * middleware) and not only the same game: storage that never writes, reading `now`, seeded. Several times slower
 * than `simStore`, and the same in every result.
 */
export declare function realSimStore<G extends AnyGame>(game: G, now: () => number, seed?: string | number): IdleStore<StateOf<G["features"]>>;
