import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { BUILT_IN_CLOCK, type ClockLens, readClock, writeClock } from "../core/clock-feature";
import { storeMeta } from "../core/persist";
import { type RuntimeStore, useIdleStore } from "./store";

/**
 * The game clock, two ways. Anything that moves with the store's own tick follows `useTickNow` (the clock's
 * `lastSeen`), so a test drives it with `store.tick`. Countdowns read `useClockNow`, which reads the store's
 * `gameNow()`: the wall plus the clock's offset, what the game's actions check. Neither reads the wall.
 */

/** Where the store keeps its clock: the game's lens, or the built-in clock for a store `createIdleStore` did not make. */
export function clockLens(store: object): ClockLens {
  return storeMeta(store)?.game.clock ?? BUILT_IN_CLOCK;
}

/** The game clock at the tick's resolution, for anything that moves between seconds. */
export function useTickNow(): number {
  const store = useIdleStore();
  const lens = clockLens(store);
  return useStore(store as never, (s: object) => readClock(s, lens).lastSeen);
}

interface Ticker {
  readers: Set<(now: number) => void>;
  stop: () => void;
}

/** One timer per store and interval; each fire reads `gameNow()` once for every reader. */
const tickers = new WeakMap<RuntimeStore, Map<number, Ticker>>();

/**
 * Joins the store's ticker for `intervalMs`, starting it for the first reader. It also re-reads at once when the
 * clock's offset moves (a skip, an import, a reset, a time warp), so no reader shows the old time until its next
 * fire. Returns the leave; the last reader to leave stops the timer and the subscription.
 */
function joinTicker(store: RuntimeStore, intervalMs: number, reader: (now: number) => void): () => void {
  let byInterval = tickers.get(store);
  if (!byInterval) {
    byInterval = new Map();
    tickers.set(store, byInterval);
  }
  const intervals = byInterval;
  let ticker = intervals.get(intervalMs);
  if (!ticker) {
    const lens = clockLens(store);
    const readers = new Set<(now: number) => void>();
    const read = () => {
      const now = store.getState().gameNow();
      for (const r of readers) r(now);
    };
    const id = setInterval(read, intervalMs);
    const unsubscribe = store.subscribe((s, prev) => {
      if (readClock(s, lens).offsetMs !== readClock(prev, lens).offsetMs) read();
    });
    ticker = {
      readers,
      stop: () => {
        clearInterval(id);
        unsubscribe();
      },
    };
    intervals.set(intervalMs, ticker);
  }
  const joined = ticker;
  joined.readers.add(reader);
  return () => {
    joined.readers.delete(reader);
    if (joined.readers.size > 0) return;
    joined.stop();
    intervals.delete(intervalMs);
  };
}

/**
 * The game clock (`gameNow()`) as React state, re-read every `intervalMs` while mounted, on one timer shared by every
 * reader of that store and interval, and at once when the offset moves. Pass `override` to pin it (tests, a parent
 * that already ticks): then nothing ticks and the override is returned as is.
 */
export function useClockNow(intervalMs = 1000, override?: number): number {
  const store = useIdleStore();
  const [now, setNow] = useState(() => override ?? store.getState().gameNow());
  useEffect(() => {
    if (override !== undefined) return;
    setNow(store.getState().gameNow());
    return joinTicker(store, Math.max(100, intervalMs), setNow);
  }, [store, intervalMs, override]);
  return override ?? now;
}

/**
 * Moves the game clock `ms` forward by growing the clock's offset. The running clock sees the gap on its next step
 * and catches up over it, as on a return; `catchUp: true` catches up at once (a store with no clock running).
 * Backwards is refused: the game's windows and `lastSeen` only run forward.
 */
export function warpClock(store: RuntimeStore, ms: number, options: { catchUp?: boolean } = {}): void {
  if (!(ms > 0)) return;
  const lens = clockLens(store);
  store.setState((draft: object) => {
    writeClock(draft, lens, { offsetMs: readClock(draft, lens).offsetMs + ms });
  });
  if (options.catchUp) store.getState().catchUp();
}
