/**
 * A snapshot cache that knows which knobs each snapshot depends on, so a fit can resume from the latest snapshot that
 * is still exactly valid after a change, and play on as the fresh run would have.
 *
 * Three things can change between runs, and each invalidates what it must and no more. The game's code (anything not
 * a tunable) is in the cache's key (`sourceKey`), so a change to it leaves nothing to resume. The plan is checked by
 * `fitHolds`: a gate moved before a snapshot invalidates it. A tunable is read through `tunables`, which notes the
 * play time of each key's first read; changing that key invalidates only the snapshots taken after it.
 *
 * Files only: `simCache` keeps one JSON file per snapshot under `<dir>/<key>/`, and every function that touches disk
 * is async (Bun's file APIs, so the sim stays browser-safe).
 */
import { type FitGate } from "./fit";
import { type SimSnapshot } from "./snapshot";
/** A tunable's value: the knobs a game lets a run turn. */
export type TunableValue = number | string | boolean;
/** Tunables as a fit reads them: a read-only view that notes when each key was first read. */
export interface Tunables<T extends Record<string, TunableValue>> {
    /** Read-only: each key's first read records the play clock's time; a write throws. */
    readonly values: Readonly<T>;
    /** The play clock (a fit passes its `playedMs`). Reads before it is set record 0. */
    setClock(clock: () => number): void;
    /** Each key read so far, with the play time of its first read (a copy). */
    firstRead(): Record<string, number>;
    /** The values as they are (a copy). */
    current(): T;
}
/**
 * Tunables over `values`. `clock` (or `setClock` later) gives the play time a first read is noted at; `from.firstRead`
 * starts the map where a resumed run left it, so the run does not under-record.
 */
export declare function tunables<T extends Record<string, TunableValue>>(values: T, clock?: () => number, from?: {
    firstRead?: Record<string, number>;
}): Tunables<T>;
/**
 * The key of a game's code: a hex SHA-256 over every file the glob `patterns` match (under `cwd`, sorted by path; each
 * path and its contents hashed), and `extra` (a version, a flag). Any change to a matched file gives another key.
 */
export declare function sourceKey(patterns: string[], options?: {
    cwd?: string;
    extra?: string;
}): Promise<string>;
/** A snapshot to resume from, with the first-read map to start the run's `tunables` from. */
export interface Resumed<X = unknown> {
    snapshot: SimSnapshot<X>;
    firstRead: Record<string, number>;
}
/** A cache of one game's snapshots under one source key. */
export interface SimCache<X = unknown> {
    /**
     * Writes `snapshot` with the tunables' values and the first reads made by its moment, so it can be saved as it is
     * taken or after the run.
     */
    save(snapshot: SimSnapshot<X>, t: Tunables<Record<string, TunableValue>>): Promise<void>;
    /**
     * The latest cached snapshot still exactly valid: the plan holds before it (`fitHolds`), and every tunable whose
     * value differs from the one it was taken with (or was not there) was not yet read when it was taken. With the
     * first-read map to start the resumed run's tunables from. Undefined when none is.
     */
    resume(gates: readonly FitGate[], t: Tunables<Record<string, TunableValue>>): Promise<Resumed<X> | undefined>;
    /** Deletes the snapshots after `atMs` (a run that resumes there replaces them). */
    dropAfter(atMs: number): Promise<void>;
    /** Deletes every snapshot under this key. */
    clear(): Promise<void>;
}
/** The cache for `key` (a `sourceKey`) under `dir` (default `.watchpot/sim-cache`): `<dir>/<key>/snap-<atMs>.json`. */
export declare function simCache<X = unknown>(options: {
    key: string;
    dir?: string;
}): SimCache<X>;
