import { type Context, type ReactNode } from "react";
/**
 * A slow read of a fast store. Decorative read-outs (a margin's figures, a level strip, a frame counter) want the
 * state a few times a second, not on every tick: `useSampled` reads the store on a fixed interval into a snapshot
 * the caller derives, and hands React a new one only when it differs from the last, so a selector never builds an
 * object on a tick and a mark re-renders a few times a second at most. With `fps` it also counts the page's frames
 * between reads.
 */
/** What a sample sees besides the state: its own last result, and the frames a second since the last read. */
export interface SampleContext<T> {
    /** The last snapshot handed out (`initial` at first): carry a trail or a running figure through it. */
    prev: T;
    /** Frames a second over the last interval, whole; 0 without `fps`, at the first read and in a hidden tab. */
    fps: number;
}
/** Options of `useSampled` and `createSampler`: the sample, its start, its rate and its equality. */
export interface SamplerOptions<S, T> {
    /** The snapshot from the state. Plain numbers and strings keep `same` cheap. */
    sample: (state: S, ctx: SampleContext<T>) => T;
    /** The snapshot before the first read. */
    initial: T;
    /** Between reads, ms. Default 250. */
    everyMs?: number;
    /** Count frames with `requestAnimationFrame` and pass the rate to `sample`. Default false (no frame loop). */
    fps?: boolean;
    /** Whether two snapshots read the same; the new one is dropped when they do. Default `sameShallow`. */
    same?: (a: T, b: T) => boolean;
    /** A duration clock for the frame rate. Default `performance.now`. */
    now?: () => number;
}
/** Frames a second from `frames` counted over `ms`, whole; 0 over less than a millisecond. Pure. */
export declare function frameRate(frames: number, ms: number): number;
/**
 * Two snapshots read the same: the same value, or two arrays or plain objects whose entries are the same value
 * (an array entry one level down is compared entry by entry, so a trail rebuilt each read is not news). Pure.
 */
export declare function sameShallow(a: unknown, b: unknown): boolean;
/**
 * Reads `store` every `everyMs` into `sample`'s snapshot, and re-renders only when the snapshot changes. Reads once
 * at mount. `store` null holds `initial`. The options are read through a ref: a new `sample` each render costs
 * nothing; a new `store`, `everyMs` or `fps` restarts the reads.
 */
export declare function useSampled<S, T>(store: {
    getState(): S;
} | null, options: SamplerOptions<S, T>): T;
/** A shared sampler from `createSampler`: its options and the context its snapshot travels in. */
export interface Sampler<S, T> {
    readonly options: SamplerOptions<S, T>;
    readonly context: Context<T>;
}
/**
 * One sampler shared by every reader under its `SampleProvider`: a page's margin marks, its counters and a debug
 * strip all read the same snapshot from one interval. Made once, at module level, with the game's state type.
 */
export declare function createSampler<S, T>(options: SamplerOptions<S, T>): Sampler<S, T>;
/** Props of `SampleProvider`: the sampler, the store it reads (default: the store in context) and the readers. */
export interface SampleProviderProps<S, T> {
    sampler: Sampler<S, T>;
    store?: {
        getState(): S;
    } | null;
    children?: ReactNode;
}
/** Reads the store for every `useSample(sampler)` inside it. */
export declare function SampleProvider<S, T>({ sampler, store, children }: SampleProviderProps<S, T>): import("react").JSX.Element;
/** The sampler's snapshot; `initial` outside its provider. */
export declare function useSample<S, T>(sampler: Sampler<S, T>): T;
