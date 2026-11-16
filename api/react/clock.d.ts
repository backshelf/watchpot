import { type ClockLens } from "../core/clock-feature";
import { type RuntimeStore } from "./store";
/**
 * The game clock, two ways. Anything that moves with the store's own tick follows `useTickNow` (the clock's
 * `lastSeen`), so a test drives it with `store.tick`. Countdowns read `useClockNow`, which reads the store's
 * `gameNow()`: the wall plus the clock's offset, what the game's actions check. Neither reads the wall.
 */
/** Where the store keeps its clock: the game's lens, or the built-in clock for a store `createIdleStore` did not make. */
export declare function clockLens(store: object): ClockLens;
/** The game clock at the tick's resolution, for anything that moves between seconds. */
export declare function useTickNow(): number;
/**
 * The game clock (`gameNow()`) as React state, re-read every `intervalMs` while mounted, on one timer shared by every
 * reader of that store and interval, and at once when the offset moves. Pass `override` to pin it (tests, a parent
 * that already ticks): then nothing ticks and the override is returned as is.
 */
export declare function useClockNow(intervalMs?: number, override?: number): number;
/**
 * Moves the game clock `ms` forward by growing the clock's offset. The running clock sees the gap on its next step
 * and catches up over it, as on a return; `catchUp: true` catches up at once (a store with no clock running).
 * Backwards is refused: the game's windows and `lastSeen` only run forward.
 */
export declare function warpClock(store: RuntimeStore, ms: number, options?: {
    catchUp?: boolean;
}): void;
