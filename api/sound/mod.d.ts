/**
 * The mod matrix: named sources a game sets to 0..1, routed through a curve and a slew onto the mix.
 *
 * It writes through the mixer (`MixerCore.drive`), so the mixer is the one place that knows a target's value. While
 * any route drives a target, the routes' sum is its value; the scene's or the handle's value waits underneath and
 * returns when the last route goes. The mixer gathers writes and sends them once in a microtask, so ten sets of a
 * source in a row send one record.
 */
import type { MixerCore } from "./mixer";
import type { CorePort } from "./port";
import type { ModMatrix, ModRoute } from "./types";
/** The mod matrix as `engine.ts` holds it. */
export interface ModCore<B extends string> {
    /** What a game sees: `sound.mod`. */
    api: ModMatrix<B>;
    /** Sends every routed target as it stands. Called each time the core comes up, after the mixer's `boot()`. */
    boot(): void;
}
/**
 * A source's 0..1 mapped onto `[a, b]` along a curve. `exp` over a range above zero is geometric (equal ratios per
 * step: the natural path of a frequency), else an exponential ease; `log` is its mirror; `s` eases in and out.
 */
export declare function mapRoute(curve: ModRoute["curve"], t: number, [a, b]: readonly [number, number]): number;
/** Builds the mod matrix over a mixer. Throws on a route whose target does not exist. */
export declare function createMod<B extends string>(options: {
    routes?: readonly ModRoute<B>[];
}, mixer: MixerCore<B>, _port: CorePort): ModCore<B>;
