/**
 * Plan-and-fit: price each gate at what a pilot holds when its planned minute comes.
 *
 * A plan names the minute each gate should open. `runFit` blocks every gate, plays the pilot, and as each minute comes
 * asks the gate for a price; the first price it gives is fixed, and the run carries on with it. One pass prices the
 * game. What a gate is, and what its price is written into, stays the game's: the loop calls `block()` and `price()`.
 */
import { Decimal } from "../core";
/** A price nothing can pay: what an unfitted gate costs until a fit has priced it. */
export declare const BLOCKED = "1e999999999";
/** A reader over a fitted table: the gate's fitted price, or `BLOCKED` for a gate the table does not hold. */
export declare function fitReader<K extends string>(table: Partial<Record<K, string>>): (key: K) => string;
/**
 * A price a player can read, never above `x`: null below 1 or not finite, whole below 100, else rounded down to two
 * figures off `steps` (ascending, from 1), written out below a million and as `<step>e<exponent>` from there.
 */
export declare function nicePrice(x: Decimal, steps?: readonly number[]): string | null;
/** What a pilot has held of each ref: a window of recent samples and the peak ever seen. */
export interface Holdings<R extends string> {
    /** Reads every ref once and keeps it (call it once a step, in `afterStep`). */
    sample(): void;
    /** The most held in the last `last` samples (default: the whole window); 0 before any sample. */
    held(ref: R, last?: number): Decimal;
    /** The most ever sampled; 0 before any sample. */
    peak(ref: R): Decimal;
    /**
     * A check that fixes its bar at `peak(ref) × margin` on its first call and is true once `held(ref)` reaches it:
     * a price set after it passes is above anything held before, whatever was reset in between.
     */
    ratchet(ref: R, margin?: number): () => boolean;
}
/** Holdings over `refs`, read through `read`, keeping the last `window` samples (default 90). */
export declare function holdings<R extends string>(refs: readonly R[], read: (ref: R) => Decimal, window?: number): Holdings<R>;
/** A gate in the plan. The game writes both calls: the loop never writes a definition. */
export interface FitGate {
    /** The plan's key for the gate; the table's key. */
    readonly key: string;
    /** The planned minute, in ms of play. */
    readonly atMs: number;
    /** Makes the gate unpayable (set its price to `BLOCKED`); called once, before the run. */
    block(): void;
    /**
     * Prices the gate if it can be priced now, writes the price where the game reads it, and returns it (after a space,
     * a note for the report); null to be asked again next step.
     */
    price(): string | null;
}
/** A gate after the fit: when it opened and the value its `price()` gave, if it did. */
export interface FittedGate {
    readonly key: string;
    readonly atMs: number;
    openedMs?: number;
    value?: string;
}
/** What `runFit` plays: the gates, the game's step and pilot, and the clock. */
export interface FitOptions {
    gates: readonly FitGate[];
    /** Advances the game `dtMs`. */
    step(dtMs: number): void;
    /** One look by the pilot: buys what it would buy. */
    look(): void;
    /** Ms of play so far. */
    playedMs(): number;
    /** The game is finished. */
    done(): boolean;
    /** The run stops here, finished or not (ms of play). */
    limitMs: number;
    /** Ms per step. Default 1000. */
    stepMs?: number;
    /** A look every this many steps. Default 3. */
    lookEvery?: number;
    /** After each step, before the gates are asked (sample the holdings here). */
    afterStep?(): void;
}
/** A fit's outcome: the gates in plan order, whether the run finished with every gate open, and its length. */
export interface FitResult {
    gates: FittedGate[];
    finished: boolean;
    playedMs: number;
}
/**
 * Prices a game in one pass. Blocks every gate, orders them by `atMs` (the plan's order between equals), then steps:
 * every `lookEvery`th step `look()` first, `step(stepMs)`, `afterStep()`, then each unopened gate whose minute has come
 * is asked `price()`, and a string opens it at `playedMs()`. Ends on `done()` or at `limitMs`.
 */
export declare function runFit(options: FitOptions): FitResult;
/** The fit's report: a markdown table of gate, planned minute, the minute it opened (or "never"), and its value. */
export declare function formatFit(result: FitResult): string;
/**
 * The text of a generated table module: `header` as a line comment, a type import of `keyType` from `planImport`,
 * and `export const FIT: Partial<Record<keyType, string>>` with a line per opened gate holding its price (never
 * the note). Read it back with `fitReader(FIT)`; an unopened gate is left out, so it reads as `BLOCKED`.
 */
export declare function fitTableSource(result: FitResult, options: {
    header: string;
    planImport: string;
    keyType: string;
}): string;
