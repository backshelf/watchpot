import type { Clock, ClockOptions } from "./clock";
import { type FeatureSpec, type FeatureSteps, type SavedOf } from "./feature";
import type { RootActions } from "./store";
/**
 * The engine's clock: when the profile was made, when it was last seen, and the offset that turns the wall into
 * game time. A game that says nothing gets `clockFeature` under the key `clock`; a game that already saves the
 * three fields points the engine at them with a `ClockSpec`, and nothing moves in its save.
 */
export interface ClockState {
    lastSeen: number;
    createdAt: number;
    offsetMs: number;
}
/** The key the built-in clock feature saves under. */
export declare const CLOCK_KEY = "clock";
/** The built-in clock. A run reset keeps the offset; a profile reset zeroes it. */
export declare const clockFeature: import("./feature").Feature<"clock", ClockState, Record<never, never>>;
/** The type of the built-in clock feature. */
export type ClockFeature = typeof clockFeature;
type NumberKeys<T> = {
    [P in keyof T]: T[P] extends number ? P & string : never;
}[keyof T];
/** Where a game that already saves them keeps the clock's three fields: a feature's key and three of its number keys. */
export type ClockSpec<F extends readonly FeatureSpec[]> = {
    [K in keyof SavedOf<F> & string]: {
        readonly feature: K;
        readonly lastSeen: NumberKeys<SavedOf<F>[K]>;
        readonly createdAt: NumberKeys<SavedOf<F>[K]>;
        readonly offset: NumberKeys<SavedOf<F>[K]>;
    };
}[keyof SavedOf<F> & string];
/** The resolved spec: plain strings, the same for the built-in feature and a game's own fields. */
export interface ClockLens {
    readonly feature: string;
    readonly lastSeen: string;
    readonly createdAt: string;
    readonly offset: string;
}
/** The lens onto the built-in clock feature's fields. */
export declare const BUILT_IN_CLOCK: ClockLens;
/** Reads the clock's `createdAt`, `lastSeen` and offset from a state through its lens. */
export declare const readClock: (state: object, lens: ClockLens) => ClockState;
/** Writes some of the clock's fields into a draft through its lens. */
export declare function writeClock(draft: object, lens: ClockLens, next: Partial<ClockState>): void;
/**
 * The clock's steps, run under the id prefix `clock` whichever feature holds the fields. A live tick with no time
 * (the hide flush) does nothing but commit; a catch-up always syncs to `now` (the first load brings the calendar,
 * the windows and the rates up to date) and produces only over a gap.
 */
export declare const clockSteps: (lens: ClockLens) => FeatureSteps<object>;
/** Handler throws in a row the clock survives: about a second of live ticks. At the limit it stops. */
export declare const CLOCK_FAILURE_LIMIT = 10;
/** Options for `startGameClock`: the engine clock's, plus `onFail` when it gives up. */
export interface GameClockOptions extends Partial<ClockOptions> {
    /** Called once when the clock stops at `CLOCK_FAILURE_LIMIT` throws in a row. */
    onFail?: (error: unknown) => void;
}
/**
 * Binds the engine clock to a store: live ticks, and a hidden spell up to `awayAfterMs`, call `tick`; a longer gap
 * calls the store's `catchUp` and flushes the save; hiding the tab flushes the save. The shell calls this once at
 * start; the returned clock stops it. It runs on the store's game clock, read on every call so an offset that moves
 * is seen at the next step. Every handler runs through one guard: a
 * throw is logged and counted, a success resets the count, and at the limit the clock stops and `onFail` is told.
 * The first catch-up and flush stay unguarded, so the caller sees their throw.
 */
export declare function startGameClock(store: {
    getState(): RootActions;
}, options?: GameClockOptions): Clock;
export {};
