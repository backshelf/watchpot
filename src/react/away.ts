import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { AWAY_REPORT_MIN_MS } from "../core/clock";
import { type ClockLens, readClock } from "../core/clock-feature";
import type { Decimal } from "../core/decimal";
import { clockLens } from "./clock";
import { useIdleStore } from "./store";

/**
 * A return, noticed. The engine credits an absence in one catch-up pass (on load, and on coming back to a hidden
 * tab): the clock's `lastSeen` jumps by the time away. `watchAway` hears that jump and hands the game the state
 * before it and the state after, for the game to say what changed while the player was gone. An import or a fresh
 * profile is not a return: its `lastSeen` lands on now from nothing (or from a moment ago), so it never passes.
 */

/** What a return hands the game: the state before the catch-up, the state after, and the time away. */
export interface AwayReturn<S> {
  before: S;
  after: S;
  /** Game time the catch-up credited the gap for, ms. */
  ms: number;
}

/** Options of `watchAway` and `useAwayReport`. */
export interface AwayOptions {
  /** A shorter absence is not reported, ms. Default `AWAY_REPORT_MIN_MS`. */
  minMs?: number;
  /**
   * How many more changes to wait for after the catch-up before reporting, for a game whose tallies settle on the
   * pass after it. Default 0: the state the catch-up left.
   */
  settlePasses?: number;
  /** Where the clock is kept. Default the store's own (`clockLens`). */
  lens?: ClockLens;
}

/** Anything with zustand's `subscribe(listener(next, prev))`. */
interface Subscribable<S> {
  subscribe(listener: (next: S, prev: S) => void): () => void;
}

/** Calls `onReturn` after each catch-up over at least `minMs`; returns the unsubscribe. */
export function watchAway<S extends object>(
  store: Subscribable<S>,
  onReturn: (away: AwayReturn<S>) => void,
  options: AwayOptions = {},
): () => void {
  const lens = options.lens ?? clockLens(store);
  const minMs = options.minMs ?? AWAY_REPORT_MIN_MS;
  const settle = Math.max(0, Math.floor(options.settlePasses ?? 0));
  let pending: { before: S; ms: number; left: number } | null = null;
  return store.subscribe((next, prev) => {
    if (pending) {
      pending.left -= 1;
      if (pending.left > 0) return;
      const { before, ms } = pending;
      pending = null;
      onReturn({ before, after: next, ms });
      return;
    }
    const was = readClock(prev, lens).lastSeen;
    const ms = readClock(next, lens).lastSeen - was;
    if (was <= 0 || ms < minMs) return;
    if (settle === 0) onReturn({ before: prev, after: next, ms });
    else pending = { before: prev, ms, left: settle };
  });
}

/** What `useAwayReport` returns: the game's report of the last return (null for none) and its dismissal. */
export interface AwayReport<R> {
  report: R | null;
  dismiss(): void;
}

/**
 * The last return as the game's own report, held until dismissed: `summarize` turns the states into it (null for a
 * return not worth telling). Listens from a layout effect, so it hears the first catch-up a parent's runtime makes.
 * Reads the store in context.
 */
export function useAwayReport<S extends object, R>(
  summarize: (away: AwayReturn<S>) => R | null,
  options: AwayOptions = {},
): AwayReport<R> {
  const store = useIdleStore() as unknown as Subscribable<S>;
  const [report, setReport] = useState<R | null>(null);
  const latest = useRef(summarize);
  latest.current = summarize;
  const { minMs, settlePasses, lens } = options;
  useLayoutEffect(
    () =>
      watchAway(
        store,
        (away) => {
          const r = latest.current(away);
          if (r !== null) setReport(r);
        },
        { minMs, settlePasses, lens },
      ),
    [store, minMs, settlePasses, lens],
  );
  const dismiss = useCallback(() => setReport(null), []);
  return { report, dismiss };
}

/** One figure that went up while away: its id and the gain. */
export interface AwayGain {
  id: string;
  gain: Decimal;
}

/**
 * The figures that went up from `before` to `after`, in `reads`' order: `reads` names each figure and how to read it
 * (a balance, a lifetime tally). A figure that fell (a reset ran while away) or stood still is left out. Pure.
 */
export function awayGains<S>(
  before: S,
  after: S,
  reads: Readonly<Record<string, (state: S) => Decimal>>,
): AwayGain[] {
  const out: AwayGain[] = [];
  for (const [id, read] of Object.entries(reads)) {
    const gain = read(after).sub(read(before));
    if (gain.gt(0)) out.push({ id, gain });
  }
  return out;
}
