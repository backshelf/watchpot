/**
 * The quick path: preset voice names a cue table may name as a string, and starting mixes to pass as
 * `createSound({ mix })`. `resolveCue` turns a shorthand cue into a full one; `engine.ts` resolves the whole table
 * on the way in, so everything below sees plain cues.
 */
import type { MixFile } from "./desk";
import type { Cue, CueShorthand } from "./types";
import type { Layer } from "./voice";
/** Every preset voice name: a cue may be one of these strings instead of a `Cue`. */
export declare const PRESET_VOICE_NAMES: readonly ["ui.click", "ui.hover", "ui.open", "ui.close", "ui.toggle", "ui.confirm", "ui.error", "ui.notify", "sfx.coin", "sfx.gem", "sfx.pop", "sfx.buy", "sfx.hit", "sfx.levelup", "sfx.unlock", "sfx.prestige", "sfx.tick", "sfx.whoosh"];
/** A preset voice's name. */
export type PresetVoiceName = (typeof PRESET_VOICE_NAMES)[number];
/**
 * The default voices a shorthand cue plays: short, soft, and built to sit together. UI voices are dry, quiet and
 * never random (the same press sounds the same); game voices vary a little. Two-note voices climb for something
 * gained or opened and fall for something closed or refused.
 */
export declare const presetVoices: Readonly<Record<PresetVoiceName, readonly Layer[]>>;
/** The bus a preset voice plays on: `"ui"` for `ui.*`, else `"sfx"`. */
export declare function presetBus(name: PresetVoiceName): "ui" | "sfx";
/**
 * A shorthand cue as a full one. An object is returned as it is; a preset voice name plays that voice on its bus;
 * a `"<pack>/<sample>"` key plays that one recording; any other string throws.
 */
export declare function resolveCue<B extends string, F extends string>(entry: Cue<B, F> | CueShorthand, key: string): Cue<B, F>;
/**
 * Three starting mixes, to pass as `createSound({ mix })`: a place to begin, not a tuned mix. Each sets bus levels
 * in dB and leaves the rest as declared.
 */
export declare const mixPresets: Readonly<Record<"balanced" | "quietMusic" | "softUi", MixFile>>;
