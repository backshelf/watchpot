import { type AwayGap } from "../core/clock-feature";
import type { RootActions } from "../core/store";
/** What `useGameClock` returns. */
export interface GameClockState {
    /** Another tab of the game wrote the save: the clock has stopped and this one writes nothing until a reload. */
    taken: boolean;
}
/** Options of `useGameClock`. */
export interface GameClockHookOptions {
    /**
     * Told of each absence before the clock credits it; return `"hold"` to take it (`GameClockOptions.away` in
     * `watchpot/core`). The latest function given is the one called.
     */
    away?: (gap: AwayGap) => unknown;
}
/**
 * The clock alone, for a game that draws its own page: live ticks, catch-ups and the hide flush (`startGameClock`),
 * and the watch on other tabs. It starts in a layout effect, so the first catch-up lands before any child's passive
 * effect reads the store. A clock that gives up is thrown from the render, for the game's error boundary.
 * `useGameRuntime` is this plus `usePageRuntime` (the kit's motion, colour scheme and sound). `options.away` lets the
 * game take an absence instead of the catch-up.
 */
export declare function useGameClock(store: {
    getState(): RootActions;
}, options?: GameClockHookOptions): GameClockState;
