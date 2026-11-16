// The player's own settings for the view, beyond the quality tier: the picture's brightness, its film grain, depth
// of field, and how far the camera leans with the pointer. A device pref; a game adds fields of its own (a line of
// guidance on or off) through `extra`.
import { type Prefs, prefs, readPrefs } from "../core/prefs";
import type { StorageBackend } from "../core/storage";

/** The view settings the stage and the camera rig read. */
export interface View {
  /** Exposure as a multiple of the picture's own, `BRIGHTNESS_MIN` to `BRIGHTNESS_MAX`. */
  brightness: number;
  /** Film grain over the picture. */
  grain: boolean;
  /** Depth of field where the game uses it. Off: everything sharp everywhere. */
  depthOfField: boolean;
  /** How far the view leans toward the pointer: 0 holds still, 1 is the rig's full lean. */
  sway: number;
}

/** The darkest brightness the setting allows. */
export const BRIGHTNESS_MIN = 0.6;
/** The brightest. */
export const BRIGHTNESS_MAX = 1.4;

/** The view settings on a first run. */
export const VIEW_DEFAULT: Readonly<View> = { brightness: 1, grain: true, depthOfField: true, sway: 1 };

function within(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

/** The view a stored or half-given value means: each field kept if it is sound and in range, else `initial`'s. */
export function readView(raw: unknown, initial: View = VIEW_DEFAULT): View {
  const v = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<Record<keyof View, unknown>>;
  return {
    brightness: within(v.brightness, BRIGHTNESS_MIN, BRIGHTNESS_MAX, initial.brightness),
    grain: typeof v.grain === "boolean" ? v.grain : initial.grain,
    depthOfField: typeof v.depthOfField === "boolean" ? v.depthOfField : initial.depthOfField,
    sway: within(v.sway, 0, 1, initial.sway),
  };
}

/** The definition `viewPrefs` takes. */
export interface ViewPrefsDef<E extends object> {
  /** The storage key (`mygame.view`). */
  readonly key: string;
  /** First-run values for the view's own fields. */
  readonly initial?: Partial<View>;
  /** The game's own fields and their first-run values; a stored value of another type reads as this one. */
  readonly extra?: E;
  /** Where it is kept. Default localStorage. */
  readonly backend?: StorageBackend | null;
}

/** The view settings as a prefs store, with the game's own fields beside them. */
export function viewPrefs<E extends object = Record<never, never>>(def: ViewPrefsDef<E>): Prefs<View & E> {
  const base = readView(def.initial ?? {});
  const initial = { ...(def.extra ?? ({} as E)), ...base } as View & E;
  return prefs<View & E>({
    key: def.key,
    initial,
    backend: def.backend,
    read: (raw, init) => ({ ...readPrefs(raw, init), ...readView(raw, init) }),
  });
}
