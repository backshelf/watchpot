import { type Prefs } from "../core/prefs";
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
export declare const BRIGHTNESS_MIN = 0.6;
/** The brightest. */
export declare const BRIGHTNESS_MAX = 1.4;
/** The view settings on a first run. */
export declare const VIEW_DEFAULT: Readonly<View>;
/** The view a stored or half-given value means: each field kept if it is sound and in range, else `initial`'s. */
export declare function readView(raw: unknown, initial?: View): View;
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
export declare function viewPrefs<E extends object = Record<never, never>>(def: ViewPrefsDef<E>): Prefs<View & E>;
