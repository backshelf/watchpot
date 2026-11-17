/**
 * The quick path: preset voice names a cue table may name as a string, and starting mixes to pass as
 * `createSound({ mix })`. `resolveCue` turns a shorthand cue into a full one; `engine.ts` resolves the whole table
 * on the way in, so everything below sees plain cues.
 */
import type { MixFile } from "./desk";
import type { Cue, CueShorthand } from "./types";
import type { Layer } from "./voice";

/** Every preset voice name: a cue may be one of these strings instead of a `Cue`. */
export const PRESET_VOICE_NAMES = [
  "ui.click",
  "ui.hover",
  "ui.open",
  "ui.close",
  "ui.toggle",
  "ui.confirm",
  "ui.error",
  "ui.notify",
  "sfx.coin",
  "sfx.gem",
  "sfx.pop",
  "sfx.buy",
  "sfx.hit",
  "sfx.levelup",
  "sfx.unlock",
  "sfx.prestige",
  "sfx.tick",
  "sfx.whoosh",
] as const;

/** A preset voice's name. */
export type PresetVoiceName = (typeof PRESET_VOICE_NAMES)[number];

/**
 * The default voices a shorthand cue plays: short, soft, and built to sit together. UI voices are dry, quiet and
 * never random (the same press sounds the same); game voices vary a little. Two-note voices climb for something
 * gained or opened and fall for something closed or refused.
 */
export const presetVoices: Readonly<Record<PresetVoiceName, readonly Layer[]>> = {
  // UI: quiet, short, no randomness.
  "ui.click": [
    { voice: { wave: "sine", frequency: 1500, release: 0.03, volume: 0.45, randomness: 0, shapeCurve: 2 } },
    { voice: { wave: "noise", frequency: 3000, release: 0.008, volume: 0.08, randomness: 0, filter: 2500 } },
  ],
  "ui.hover": [{ voice: { wave: "sine", frequency: 2200, release: 0.02, volume: 0.15, randomness: 0 } }],
  "ui.open": [
    { voice: { wave: "triangle", frequency: 523, release: 0.06, volume: 0.35, randomness: 0 } },
    { at: 0.045, voice: { wave: "triangle", frequency: 784, release: 0.09, volume: 0.35, randomness: 0 } },
  ],
  "ui.close": [
    { voice: { wave: "triangle", frequency: 784, release: 0.06, volume: 0.35, randomness: 0 } },
    { at: 0.045, voice: { wave: "triangle", frequency: 523, release: 0.09, volume: 0.35, randomness: 0 } },
  ],
  "ui.toggle": [
    { voice: { wave: "sine", frequency: 660, sustain: 0.01, release: 0.04, volume: 0.4, randomness: 0 } },
    { voice: { wave: "noise", frequency: 2000, release: 0.006, volume: 0.06, randomness: 0, filter: 1500 } },
  ],
  "ui.confirm": [
    { voice: { wave: "triangle", frequency: 659, release: 0.08, volume: 0.4, randomness: 0 } },
    { at: 0.07, voice: { wave: "triangle", frequency: 988, release: 0.14, volume: 0.4, randomness: 0 } },
  ],
  "ui.error": [
    {
      voice: {
        wave: "square",
        frequency: 220,
        sustain: 0.05,
        release: 0.06,
        volume: 0.25,
        randomness: 0,
        filter: -1200,
      },
    },
    {
      at: 0.1,
      voice: {
        wave: "square",
        frequency: 185,
        sustain: 0.06,
        release: 0.1,
        volume: 0.25,
        randomness: 0,
        filter: -1200,
      },
    },
  ],
  "ui.notify": [
    { voice: { wave: "sine", frequency: 1047, release: 0.3, volume: 0.35, randomness: 0 } },
    { at: 0.08, voice: { wave: "sine", frequency: 1568, release: 0.35, volume: 0.3, randomness: 0 } },
  ],

  // Game: brighter, a little random so repeats don't machine-gun.
  "sfx.coin": [
    {
      voice: {
        wave: "square",
        frequency: 988,
        sustain: 0.03,
        release: 0.2,
        pitchJump: 331,
        pitchJumpTime: 0.06,
        volume: 0.25,
        randomness: 0.02,
        filter: -6000,
      },
    },
  ],
  "sfx.gem": [
    { voice: { wave: "sine", frequency: 1568, release: 0.22, volume: 0.3, randomness: 0.03 } },
    { at: 0.05, voice: { wave: "sine", frequency: 2093, release: 0.22, volume: 0.25, randomness: 0.03 } },
    { at: 0.1, voice: { wave: "sine", frequency: 2637, release: 0.3, volume: 0.2, randomness: 0.03 } },
  ],
  "sfx.pop": [
    { voice: { wave: "sine", frequency: 300, slide: 8, release: 0.06, volume: 0.5, randomness: 0.08 } },
    { voice: { wave: "noise", frequency: 2500, release: 0.01, volume: 0.1, filter: 2000 } },
  ],
  "sfx.buy": [
    { voice: { wave: "triangle", frequency: 784, release: 0.06, volume: 0.4, randomness: 0.03 } },
    { at: 0.06, voice: { wave: "triangle", frequency: 1175, release: 0.14, volume: 0.4, randomness: 0.03 } },
    { at: 0.06, voice: { wave: "noise", frequency: 4000, release: 0.12, volume: 0.08, filter: 3000 } },
  ],
  "sfx.hit": [
    { voice: { wave: "noise", frequency: 800, release: 0.08, volume: 0.45, randomness: 0.1, filter: -2500 } },
    { voice: { wave: "sine", frequency: 150, slide: -3, release: 0.12, volume: 0.6, randomness: 0.05 } },
  ],
  "sfx.levelup": [
    { voice: { wave: "triangle", frequency: 523, release: 0.08, volume: 0.35 } },
    { at: 0.07, voice: { wave: "triangle", frequency: 659, release: 0.08, volume: 0.35 } },
    { at: 0.14, voice: { wave: "triangle", frequency: 784, release: 0.08, volume: 0.35 } },
    { at: 0.21, voice: { wave: "triangle", frequency: 1047, sustain: 0.05, release: 0.35, volume: 0.4 } },
  ],
  "sfx.unlock": [
    { voice: { wave: "noise", frequency: 1500, release: 0.02, volume: 0.2, filter: 1200 } },
    { at: 0.04, voice: { wave: "triangle", frequency: 659, release: 0.1, volume: 0.35 } },
    { at: 0.11, voice: { wave: "triangle", frequency: 1319, release: 0.3, volume: 0.35 } },
  ],
  "sfx.prestige": [
    {
      voice: {
        wave: "saw",
        frequency: 131,
        attack: 0.05,
        sustain: 0.3,
        release: 0.6,
        slide: 1,
        volume: 0.3,
        randomness: 0,
        filter: -1500,
      },
    },
    { at: 0.1, voice: { wave: "sine", frequency: 523, release: 0.8, volume: 0.25, randomness: 0 } },
    { at: 0.2, voice: { wave: "sine", frequency: 784, release: 0.8, volume: 0.25, randomness: 0 } },
    { at: 0.3, voice: { wave: "sine", frequency: 1047, release: 1, volume: 0.25, randomness: 0 } },
  ],
  "sfx.tick": [
    { voice: { wave: "triangle", frequency: 1200, release: 0.015, volume: 0.15, randomness: 0.05 } },
  ],
  "sfx.whoosh": [
    {
      voice: {
        wave: "noise",
        frequency: 400,
        slide: 3,
        attack: 0.08,
        sustain: 0.05,
        release: 0.15,
        volume: 0.35,
        filter: -1800,
      },
    },
  ],
};

/** The bus a preset voice plays on: `"ui"` for `ui.*`, else `"sfx"`. */
export function presetBus(name: PresetVoiceName): "ui" | "sfx" {
  return name.startsWith("ui.") ? "ui" : "sfx";
}

/**
 * A shorthand cue as a full one. An object is returned as it is; a preset voice name plays that voice on its bus;
 * a `"<pack>/<sample>"` key plays that one recording; any other string throws.
 */
export function resolveCue<B extends string, F extends string>(
  entry: Cue<B, F> | CueShorthand,
  key: string,
): Cue<B, F> {
  if (typeof entry !== "string") return entry;
  if ((PRESET_VOICE_NAMES as readonly string[]).includes(entry)) {
    const name = entry as PresetVoiceName;
    return { bus: presetBus(name) as B, voices: presetVoices[name] };
  }
  if (entry.includes("/")) return { takes: [{ sample: entry }] };
  throw new Error(
    `watchpot/sound: cue "${key}" is "${entry}", which is neither a preset voice nor a "<pack>/<sample>" key: use one of PRESET_VOICE_NAMES, a sample key, or a full cue object`,
  );
}

/**
 * Three starting mixes, to pass as `createSound({ mix })`: a place to begin, not a tuned mix. Each sets bus levels
 * in dB and leaves the rest as declared.
 */
export const mixPresets: Readonly<Record<"balanced" | "quietMusic" | "softUi", MixFile>> = {
  balanced: { version: 2, layers: { mix: { "level:music": -8, "level:ambience": -12 } } },
  quietMusic: { version: 2, layers: { mix: { "level:music": -14, "level:ambience": -18 } } },
  softUi: { version: 2, layers: { mix: { "level:ui": -6, "level:music": -8, "level:ambience": -12 } } },
};
