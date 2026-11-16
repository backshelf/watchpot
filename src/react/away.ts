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
  /**
   * The time away, ms: the whole jump in the clock's `lastSeen` across the catch-up. The offline cap may have
   * credited less of it; the states say what was paid.
   */
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
  return listenAway(store, onReturn, options, null);
}

/** The two states either side of a catch-up. */
interface Jump<S> {
  before: S;
  after: S;
}

/**
 * `watchAway`, starting from a catch-up that came before the subscription (`opening`), heard as if it came after.
 */
function listenAway<S extends object>(
  store: Subscribable<S>,
  onReturn: (away: AwayReturn<S>) => void,
  options: AwayOptions,
  opening: Jump<S> | null,
): () => void {
  const lens = options.lens ?? clockLens(store);
  const minMs = options.minMs ?? AWAY_REPORT_MIN_MS;
  const settle = Math.max(0, Math.floor(options.settlePasses ?? 0));
  let pending: { before: S; ms: number; left: number } | null = null;
  const jumped = (before: S, after: S) => {
    const was = readClock(before, lens).lastSeen;
    const ms = readClock(after, lens).lastSeen - was;
    if (was <= 0 || ms < minMs) return;
    if (settle === 0) onReturn({ before, after, ms });
    else pending = { before, ms, left: settle };
  };
  const off = store.subscribe((next, prev) => {
    if (pending) {
      pending.left -= 1;
      if (pending.left > 0) return;
      const { before, ms } = pending;
      pending = null;
      onReturn({ before, after: next, ms });
      return;
    }
    jumped(prev, next);
  });
  if (opening) jumped(opening.before, opening.after);
  return off;
}

/**
 * The states either side of each store's opening catch-up, the one `useGameClock` makes as it starts: kept for a
 * `useAwayReport` that begins listening just after it (later in the same component).
 */
const openings = new WeakMap<object, Jump<object>>();

/**
 * Keeps the states either side of `store`'s opening catch-up: `before` from just ahead of it, the store's state now
 * after it. `useGameClock` calls this; a game has no need to.
 * @internal
 */
export function noteOpening(store: { getState(): object }, before: object): void {
  openings.set(store, { before, after: store.getState() });
}

/** The opening catch-up of `store`, while it is the last thing to have happened to it (null after any change). */
function freshOpening<S extends object>(store: { getState(): object }): Jump<S> | null {
  const opening = openings.get(store);
  return opening && opening.after === store.getState() ? (opening as Jump<S>) : null;
}

/** What `useAwayReport` returns: the game's report of the last return (null for none) and its dismissal. */
export interface AwayReport<R> {
  report: R | null;
  dismiss(): void;
}

/**
 * The last return as the game's own report, held until dismissed: `summarize` turns the states into it (null for a
 * return not worth telling). It hears the clock's opening catch-up wherever it is called: in a child of the
 * component that starts the clock, or after `useGameClock` or `useGameRuntime` in that same component. Reads the
 * store in context.
 */
export function useAwayReport<S extends object, R>(
  summarize: (away: AwayReturn<S>) => R | null,
  options: AwayOptions = {},
): AwayReport<R> {
  const store = useIdleStore("useAwayReport");
  const [report, setReport] = useState<R | null>(null);
  const latest = useRef(summarize);
  latest.current = summarize;
  const { minMs, settlePasses, lens } = options;
  // The state after the last return this hook heard: StrictMode's second run of the effect must not hear it again.
  const heard = useRef<object | null>(null);
  // A child's layout effect runs before its parent's, so it subscribes before the clock's catch-up; a hook after the
  // clock's in one component subscribes after it, and starts from the catch-up it missed.
  useLayoutEffect(() => {
    const opening = freshOpening<S>(store);
    return listenAway(
      store as unknown as Subscribable<S>,
      (away) => {
        heard.current = away.after;
        const r = latest.current(away);
        if (r !== null) setReport(r);
      },
      { minMs, settlePasses, lens },
      opening && opening.after !== heard.current ? opening : null,
    );
  }, [store, minMs, settlePasses, lens]);
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
