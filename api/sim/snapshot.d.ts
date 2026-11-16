/**
 * Snapshots: a sim's whole state at a moment of play, as plain data, so a later run can start there instead of from
 * nothing and play on exactly as the run that took it would have.
 *
 * A snapshot holds the world (the plain store's data and the sim clock: the rng's position is in the data, since every
 * draw is seeded from the state), the auto-player's memory, a fit's progress when a fit took it, and whatever the
 * game's own run keeps beside them (`extra`). The engine never chooses a file or reads one: `encodeSnapshot` gives
 * the text and `decodeSnapshot` reads it back, and the caller puts it where it likes.
 */
import type { AutoPlayer, AutoPlayerMemory } from "./auto";
import type { FitProgress } from "./fit";
import type { SimWorld, WorldSnapshot } from "./world";
/** The format a snapshot is written in; `decodeSnapshot` refuses another. */
export declare const SNAPSHOT_FORMAT = 1;
/** A sim stopped at a moment of play. Plain data: Decimals and all, it survives `encodeSnapshot` exactly. */
export interface SimSnapshot<X = unknown> {
    readonly format: typeof SNAPSHOT_FORMAT;
    /** Ms of play when it was taken (the caller's played clock, not the world's wall). */
    readonly atMs: number;
    /** The store's data and the sim clock. */
    readonly world: WorldSnapshot;
    /** The auto-player's memory, when the run has one. */
    readonly player?: AutoPlayerMemory;
    /** A fit's own progress, when a fit took it. */
    readonly fit?: FitProgress;
    /** What the game's own run keeps besides (its records, its pilot's memory, a fit's holdings): plain data. */
    readonly extra?: X;
}
/** The parts of a snapshot a run gives: everything but the format, the moment and a fit's progress. */
export interface SnapshotParts<X = unknown> {
    world: WorldSnapshot;
    player?: AutoPlayerMemory;
    extra?: X;
}
/**
 * A snapshot of a run now: `world.snapshot()`, the player's memory, and `extra`, at `atMs` of play. The world's store
 * must be a plain store (`simStore`).
 */
export declare function takeSnapshot<X = unknown>(parts: {
    atMs: number;
    world: SimWorld;
    player?: AutoPlayer<never>;
    extra?: X;
}): SimSnapshot<X>;
/** A snapshot as text, to write wherever the caller keeps them. Exact: `decodeSnapshot` gives back the same run. */
export declare function encodeSnapshot<X>(snapshot: SimSnapshot<X>): string;
/** Reads `encodeSnapshot`'s text back; throws on text that is not a snapshot of this format. */
export declare function decodeSnapshot<X = unknown>(text: string): SimSnapshot<X>;
/**
 * Where two values differ, as paths (`.world.state.wallet.gold: 12 against 13`), at most `limit` of them. Decimals
 * compare by value, and a key holding `undefined` is the same as no key. Empty when they are the same.
 */
export declare function snapshotDiff(a: unknown, b: unknown, limit?: number): string[];
/** A snapshot every `everyMs` of play: `due(playedMs)` is true once a mark is passed, and moves to the next. */
export interface SnapshotCadence {
    /** Whether a mark has been reached since the last true; the marks it skipped over count as this one. */
    due(playedMs: number): boolean;
    /** The next mark, in ms of play. */
    next(): number;
}
/** Marks every `everyMs` of play after `fromMs` (default 0): a run resumed at hour 6 takes its next at the mark after. */
export declare function snapshotCadence(everyMs: number, fromMs?: number): SnapshotCadence;
/**
 * The latest snapshot taken at or before `atMs` that `holds` accepts (default every one), or undefined: how a script
 * picks where to carry on from among those it kept.
 */
export declare function latestSnapshot<X>(snapshots: Iterable<SimSnapshot<X>>, atMs: number, holds?: (snapshot: SimSnapshot<X>) => boolean): SimSnapshot<X> | undefined;
