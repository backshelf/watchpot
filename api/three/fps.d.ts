import { type Prefs } from "../core/prefs";
import type { StorageBackend } from "../core/storage";
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
export declare function createFrameCap(): (nowMs: number, limit: number | null) => boolean;
/** A frame-rate store under `key`. */
export declare function createFrameRate(def: FrameRateDef): FrameRate;
/** The measured fps in React, refreshed once a second. */
export declare function useMeasuredFps(rate: FrameRate): number;
/** The frame-rate prefs in React. */
export declare function useFrameRatePrefs(rate: FrameRate): FrameRatePrefs;
