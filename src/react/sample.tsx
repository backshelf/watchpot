import { type Context, createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { IdleStoreContext } from "./store";

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
export function frameRate(frames: number, ms: number): number {
  return ms >= 1 && frames > 0 ? Math.round((frames * 1000) / ms) : 0;
}

const sameArray = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * Two snapshots read the same: the same value, or two arrays or plain objects whose entries are the same value
 * (an array entry one level down is compared entry by entry, so a trail rebuilt each read is not news). Pure.
 */
export function sameShallow(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return sameArray(a, b);
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  return ka.every((k) => {
    const va = ra[k];
    const vb = rb[k];
    if (Object.is(va, vb)) return true;
    return Array.isArray(va) && Array.isArray(vb) && sameArray(va, vb);
  });
}

/**
 * Reads `store` every `everyMs` into `sample`'s snapshot, and re-renders only when the snapshot changes. Reads once
 * at mount. `store` null holds `initial`. The options are read through a ref: a new `sample` each render costs
 * nothing; a new `store`, `everyMs` or `fps` restarts the reads.
 */
export function useSampled<S, T>(store: { getState(): S } | null, options: SamplerOptions<S, T>): T {
  const [shown, setShown] = useState<T>(options.initial);
  const latest = useRef(options);
  latest.current = options;
  const current = useRef(shown);
  const { everyMs = 250, fps = false } = options;

  useEffect(() => {
    if (!store) return;
    const now = latest.current.now ?? (() => performance.now());
    let frames = 0;
    let raf = 0;
    const counting = fps && typeof requestAnimationFrame === "function";
    if (counting) {
      const count = () => {
        frames += 1;
        raf = requestAnimationFrame(count);
      };
      raf = requestAnimationFrame(count);
    }
    let last = now();
    const read = () => {
      const t = now();
      const rate = counting ? frameRate(frames, t - last) : 0;
      frames = 0;
      last = t;
      const { sample, same = sameShallow } = latest.current;
      const next = sample(store.getState(), { prev: current.current, fps: rate });
      if (same(current.current, next)) return;
      current.current = next;
      setShown(next);
    };
    read();
    const id = setInterval(read, Math.max(16, everyMs));
    return () => {
      clearInterval(id);
      if (counting) cancelAnimationFrame(raf);
    };
  }, [store, everyMs, fps]);

  return shown;
}

/** A shared sampler from `createSampler`: its options and the context its snapshot travels in. */
export interface Sampler<S, T> {
  readonly options: SamplerOptions<S, T>;
  readonly context: Context<T>;
}

/**
 * One sampler shared by every reader under its `SampleProvider`: a page's margin marks, its counters and a debug
 * strip all read the same snapshot from one interval. Made once, at module level, with the game's state type.
 */
export function createSampler<S, T>(options: SamplerOptions<S, T>): Sampler<S, T> {
  return { options, context: createContext<T>(options.initial) };
}

/** Props of `SampleProvider`: the sampler, the store it reads (default: the store in context) and the readers. */
export interface SampleProviderProps<S, T> {
  sampler: Sampler<S, T>;
  store?: { getState(): S } | null;
  children?: ReactNode;
}

/** Reads the store for every `useSample(sampler)` inside it. */
export function SampleProvider<S, T>({ sampler, store, children }: SampleProviderProps<S, T>) {
  const inContext = useContext(IdleStoreContext) as { getState(): S } | null;
  const value = useSampled(store ?? inContext, sampler.options);
  return <sampler.context.Provider value={value}>{children}</sampler.context.Provider>;
}

/** The sampler's snapshot; `initial` outside its provider. */
export function useSample<S, T>(sampler: Sampler<S, T>): T {
  return useContext(sampler.context);
}
