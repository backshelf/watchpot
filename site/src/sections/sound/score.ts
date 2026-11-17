// What the sound sheet plays, as plain data: the cues (zzfx voices, numbers only), the tracks, the opening pattern,
// the blip's scale degrees and the mix's starting settings. Types alone come from `watchpot/sound`, so the page can
// draw the instrument before the engine itself is loaded (`rig.ts` is imported on the visitor's press).
import type { Cue, DefaultBus, PresetVoiceName, Scale } from "watchpot/sound";

export type Bus = DefaultBus | "room";

/**
 * The engine's 18 preset voice names, copied in `PRESET_VOICE_NAMES`'s order (a test in `site/test` keeps the copy
 * true). A cue may be just one of these strings; the engine resolves it to that voice on its bus.
 */
export const PRESET_NAMES = [
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
] as const satisfies readonly PresetVoiceName[];

export type PresetName = (typeof PRESET_NAMES)[number];

/** Every cue is zzfx voices: numbers, no recording. Short envelopes, quiet. */
export const CUES = {
  thump: {
    voices: [
      {
        voice: {
          frequency: 70,
          slide: -0.35,
          attack: 0.002,
          sustain: 0.04,
          release: 0.18,
          wave: "sine",
          volume: 0.9,
        },
      },
    ],
  },
  tick: {
    voices: [
      { voice: { frequency: 7000, noise: 0.5, attack: 0.001, release: 0.03, wave: "noise", volume: 0.22 } },
    ],
  },
  /** On a scale ladder: `play("blip", { step })` is a degree of the harmony clock. */
  blip: {
    ladder: "scale",
    voices: [
      {
        voice: {
          frequency: 440,
          attack: 0.002,
          sustain: 0.02,
          release: 0.12,
          wave: "triangle",
          volume: 0.45,
        },
      },
    ],
  },
} as const satisfies Record<string, Cue<Bus>>;

export type CueKey = keyof typeof CUES;

export interface Track {
  cue: CueKey;
  /** dB on every step. */
  level: number;
  /** What it is, in a few words. */
  line: string;
}

export const TRACKS: readonly Track[] = [
  { cue: "thump", level: 0, line: "sine, 70 Hz, sliding down" },
  { cue: "blip", level: -5, line: "triangle, on scale degrees" },
  { cue: "tick", level: -7, line: "noise, 30 ms" },
];

export const STEPS = 16;

/** The pattern the page opens on, a row of 0 and 1 per track. */
export const DEFAULT_PATTERN: readonly (readonly number[])[] = [
  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
  [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
  [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0],
];

/** The blip's scale degree on each step (0 is the tonic; past the scale's length it climbs an octave). */
export const DEGREES: readonly number[] = [0, 0, 0, 2, 0, 0, 4, 0, 0, 0, 3, 0, 0, 5, 0, 0];

export const SCALES: readonly { value: Scale; label: string }[] = [
  { value: "minorPentatonic", label: "minor pentatonic" },
  { value: "dorian", label: "dorian" },
  { value: "major", label: "major" },
];

/** The mix the controls move: a low-pass and a crush on `sfx`, which sends to a reverb on `room`. */
export interface MixSettings {
  cutoff: number;
  crush: number;
  size: number;
}

export const DEFAULT_MIX: MixSettings = { cutoff: 5000, crush: 0, size: 0.5 };

export const LINE = "Every sound on this sheet is made from numbers.";
