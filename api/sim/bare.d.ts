/** A sim world over bare rules, and a straight sitting. */
import type { SimStore, SimWorld } from "./world";
/**
 * A `SimStore` over bare rules, with no store behind it: `tick` and `catchUp` call the rules, and `now` is the sim's
 * clock. `catchUp` credits `rules.away` the time since the last tick or catch-up, so the world's opening catch-up
 * credits nothing.
 */
export declare function bareSimStore(now: () => number, rules: {
    tick(dtMs: number): void;
    away(ms: number): void;
}): SimStore;
/** Options for `playStraight`: the world, the length, the look cadence and the callbacks. */
export interface PlayStraightOptions<W extends SimWorld> {
    world: W;
    /** How long to sit, in ms. */
    ms: number;
    /** Time between looks; the last stretch is the remainder. */
    lookEveryMs: number;
    /** The longest tick, in ms. Default: the world's. */
    tickMs?: number;
    /** One look at the game, before each stretch is played. */
    look(): void;
    /** After a stretch is played (a sampler's `look`). */
    afterLook?(): void;
    /** Ends the sitting early once it holds, checked before each look. */
    until?(): boolean;
}
/** One unbroken sitting with the tab open: looks every `lookEveryMs`, the time between played, until `ms` or `until()`. */
export declare function playStraight<W extends SimWorld>({ world, ms, lookEveryMs, tickMs, look, afterLook, until, }: PlayStraightOptions<W>): void;
