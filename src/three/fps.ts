// The frame rate: an optional cap on rendered frames per second and a measured-fps reading, both device prefs. The
// cap skips whole frames in the stage's loop (the display still ticks at its refresh rate), so it saves GPU work
// rather than slowing the game's clock.

import { useSyncExternalStore } from "react";
import { type Prefs, prefs } from "../core/prefs";
import type { StorageBackend } from "../core/storage";
import { usePrefs } from "../react/prefs";

/** The frame-rate prefs. `capped` off means one frame per screen refresh; `limit` is kept while the cap is off. */
export interface FrameRatePrefs {
  capped: boolean;
  limit: number;
  /** The measured-fps reading is shown (and counted: off, the meter does no work). */
  show: boolean;
}

/** The frame-rate prefs and the meter that reads them. */
export interface FrameRate {
  readonly prefs: Prefs<FrameRatePrefs>;
  /** The cap's range and step, frames per second. */
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** True when the frame at `nowMs` (a real clock) should render under the cap. Call once per display tick. */
  due(nowMs: number): boolean;
  /** Counts a rendered frame at `nowMs`; the reading refreshes once a second while `show` is on. */
  count(nowMs: number): void;
  /** Rendered frames over the last second; 0 while not shown. */
  measured(): number;
  /** Calls `listener` when the reading refreshes. */
  subscribe(listener: () => void): () => void;
}

/** The definition `createFrameRate` takes. */
export interface FrameRateDef {
  /** The storage key (`mygame.fps`). */
  readonly key: string;
  /** The cap's range and step. Defaults 30, 180, 10. */
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** The first-run prefs. Default: uncapped at 60, not shown. */
  readonly initial?: Partial<FrameRatePrefs>;
  /** Where the prefs are kept. Default localStorage. */
  readonly backend?: StorageBackend | null;
}

/** A frame cap on a fixed grid: true when the frame at `nowMs` is due under `limit` fps (null: every frame). */
export function createFrameCap(): (nowMs: number, limit: number | null) => boolean {
  let lastFrame = 0;
  return (nowMs, limit) => {
    if (limit === null) {
      lastFrame = nowMs;
      return true;
    }
    const interval = 1000 / limit;
    const due = lastFrame + interval;
    // Half a millisecond of slack so a cap that matches the refresh rate is not thrown off by timer jitter.
    if (nowMs < due - 0.5) return false;
    // Step along a fixed grid so a frame that lands early or late does not shift the ones after it, and the rate
    // averages out to the cap; after a long stall, restart the grid from now.
    lastFrame = nowMs - due > interval ? nowMs : due;
    return true;
  };
}

/** A frame-rate store under `key`. */
export function createFrameRate(def: FrameRateDef): FrameRate {
  const min = def.min ?? 30;
  const max = def.max ?? 180;
  const step = def.step ?? 10;
  const clampLimit = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
  const initial: FrameRatePrefs = {
    capped: def.initial?.capped ?? false,
    limit: clampLimit(def.initial?.limit, Math.min(max, Math.max(min, 60))),
    show: def.initial?.show ?? false,
  };
  const store = prefs<FrameRatePrefs>({
    key: def.key,
    initial,
    backend: def.backend,
    read: (raw, init) => {
      const v = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<
        Record<keyof FrameRatePrefs, unknown>
      >;
      return {
        capped: typeof v.capped === "boolean" ? v.capped : init.capped,
        limit: clampLimit(v.limit, init.limit),
        show: typeof v.show === "boolean" ? v.show : init.show,
      };
    },
  });
  const cap = createFrameCap();
  const listeners = new Set<() => void>();
  let measured = 0;
  let frames = 0;
  let windowStart = 0;
  return {
    prefs: store,
    min,
    max,
    step,
    due(nowMs) {
      const p = store.get();
      return cap(nowMs, p.capped ? p.limit : null);
    },
    count(nowMs) {
      if (!store.get().show) {
        frames = 0;
        windowStart = 0;
        measured = 0;
        return;
      }
      // The first frame opens the window: frames are counted between ticks, so it is not one of them.
      if (windowStart === 0) {
        windowStart = nowMs;
        return;
      }
      frames++;
      const span = nowMs - windowStart;
      if (span < 1000) return;
      measured = Math.round((frames * 1000) / span);
      frames = 0;
      windowStart = nowMs;
      for (const l of [...listeners]) l();
    },
    measured: () => measured,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** The measured fps in React, refreshed once a second. */
export function useMeasuredFps(rate: FrameRate): number {
  return useSyncExternalStore(rate.subscribe, rate.measured, () => 0);
}

/** The frame-rate prefs in React. */
export function useFrameRatePrefs(rate: FrameRate): FrameRatePrefs {
  return usePrefs(rate.prefs);
}
