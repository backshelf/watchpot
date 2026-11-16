/**
 * The celebration director: the size of the show matches the size of the win, and wins never pile up. Headless: it
 * decides what plays when and hands typed cues to the game's renderers; it knows tiers and kinds, never what a kind
 * means or how it looks.
 *
 * - `micro` goes straight out as a batch of one: a tick, never held or rationed.
 * - `small` never takes the stage. Smalls of one kind landing within `coalesceMs` of the first go out as one batch
 *   (ten at once are one bigger sticker, not ten). While a big show holds the stage they wait (the newest few go out
 *   after it).
 * - `medium` takes the stage one at a time, `gapMs` apart; past `maxQueue` waiting, a medium goes out as a small.
 * - `big` takes the stage at once: a medium on it is cut short (and handed to the smalls), mediums wait behind it.
 * - The machine's wins are rationed: a machine's batch of smalls goes out only when it holds a first, at most one
 *   every `machine.gapMs`, a few waiting their turn (the newest kept), and with `machine.downscale` a cue that is
 *   neither the player's (`mine`) nor a `first` drops a tier. The player's own wins are never rationed.
 */
/** How big a win is, smallest first. */
export type CueTier = "micro" | "small" | "medium" | "big";
/** A win to show: its tier, its kind (smalls coalesce by kind) and the game's data for its renderer. */
export interface Cue<D> {
    tier: CueTier;
    kind: string;
    data: D;
    /** It came from the player's own gesture. Unset, the director's `mine()` is asked at the push. */
    mine?: boolean;
    /** It is a thing happening for the first time: the machine's firsts still show. */
    first?: boolean;
}
/** A cue on the stage: an id to end it by, the tier it was pushed at, and whether motion is reduced. */
export interface StagedCue<D> extends Cue<D> {
    id: number;
    /** The tier it was pushed at, before any downscale. */
    pushed: CueTier;
    /** Reduced motion was asked for when it took the stage: the renderer shows its still. */
    reduced: boolean;
}
/** Smalls of one kind (or one micro) going out together, oldest first. */
export interface CueBatch<D> {
    kind: string;
    cues: readonly Cue<D>[];
    /** Any of them was the player's. */
    mine: boolean;
    /** Any of them was a first. */
    first: boolean;
    reduced: boolean;
}
/** What the director did with a cue or a batch: what the dev log records. */
export type CueFate = "staged" | "queued" | "shown" | "held" | "waiting" | "dropped" | "demoted" | "cut";
/** One line of the director's log. */
export interface CueLogEntry {
    kind: string;
    tier: CueTier;
    /** How many cues it was (a batch). */
    n: number;
    mine: boolean;
    first: boolean;
    fate: CueFate;
}
/** How the machine's wins are rationed. */
export interface MachineRation {
    /** A machine's batch of smalls at most once per this, ms. Default 6000. */
    gapMs?: number;
    /** How many machine batches wait their turn; the oldest gives way. Default 3. */
    waitingMost?: number;
    /** A machine's small that is not a first is dropped. Default true. */
    firstsOnly?: boolean;
    /** A machine's batch of a kind shown less than this ago is dropped, ms. Default 0 (off). */
    kindGapMs?: number;
    /**
     * A machine's cue that is not a first drops a tier (big to medium, medium to small). Default false: a delayed or
     * automated big show pushed without `first` keeps its tier; opt in to shrink the machine's shows.
     */
    downscale?: boolean;
}
/** Options of `createDirector`. */
export interface DirectorOptions {
    /** How long smalls of one kind gather into a batch, ms. Default 350. */
    coalesceMs?: number;
    /** The rest between two shows on the stage, ms. Default 900. */
    gapMs?: number;
    /** How many mediums may wait for the stage; one more goes out as a small. Default 3. */
    maxQueue?: number;
    /** How many batches wait out a big show. Default 6. */
    holdMost?: number;
    /** How many of those go out after it, the newest. Default 3. */
    releaseMost?: number;
    /** The machine's rationing, or false for none. */
    machine?: MachineRation | false;
    /** Whether a cue pushed without `mine` is the player's (a gesture tracker's `recent`). Default: never. */
    mine?: () => boolean;
    /** Whether motion is reduced, read as a cue goes out. Default `prefersReducedMotion`. */
    reduced?: () => boolean;
    /** A duration clock. Default `performance.now`. */
    now?: () => number;
    /** Runs `fn` after `ms`; returns its cancel. Default `setTimeout`. */
    schedule?: (fn: () => void, ms: number) => () => void;
    /** How many log lines are kept. Default 200. */
    logMost?: number;
}
/** What `createDirector` returns. */
export interface Director<D> {
    push(cue: Cue<D>): void;
    /** The show on the stage, or null. The same object until it changes (a `useSyncExternalStore` snapshot). */
    stage(): StagedCue<D> | null;
    /** How many shows wait for the stage. */
    waiting(): number;
    /** The show on the stage has ended. With an id, only that show: a show already cut short ends nothing. */
    done(id?: number): void;
    /** Hears the stage change. Returns the unsubscribe. */
    subscribe(fn: () => void): () => void;
    /** Hears each batch of smalls and each micro. Returns the unsubscribe. */
    onBatch(fn: (batch: CueBatch<D>) => void): () => void;
    /** Drops every show waiting, held and on the stage. */
    clear(): void;
    /** `clear()`, cancels every timer and forgets every listener. */
    dispose(): void;
    /** Development: names a cue that `replay(name)` pushes (as the player's), to look at a show without playing to it. */
    sample(name: string, make: () => Cue<D>): void;
    /** Pushes the named sample; false when there is none. */
    replay(name: string): boolean;
    /** The sample names. */
    samples(): string[];
    /** What happened to the last cues and batches, oldest first. */
    log(): readonly CueLogEntry[];
}
/** A director with its own queue, timers and log. */
export declare function createDirector<D>(options?: DirectorOptions): Director<D>;
/** The show on the director's stage, as React state. */
export declare function useStage<D>(director: Director<D>): StagedCue<D> | null;
/** Hears the director's batches while mounted; `onBatch` is read through a ref, so a new one each render is free. */
export declare function useCueBatches<D>(director: Director<D>, onBatch: (batch: CueBatch<D>) => void): void;
