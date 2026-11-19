import { type Cue, createSound, type DefaultBus, type PackManifest } from "watchpot/sound";

/**
 * A pack as `pack.ts` writes it: its tempo, its key, and every recording by name. `shot` is one sample: the file's
 * URL, how long it is, how many channels, its loudness and its peak as the build measured them.
 */
export const packOf = (url: string): PackManifest => ({
  name: "demo",
  tempo: 120,
  key: "Am",
  samples: {
    shot: { url, seconds: 0.4, channels: 1, lufs: -18, peak: 0.6, kind: "shot" },
  },
});

/**
 * One cue that can sound two ways: a recording from the pack (`takes`), and the zzfx voice it falls back to until
 * that pack has loaded, and for good if it never does.
 */
const CUES = {
  shot: {
    takes: [{ sample: "demo/shot" }],
    voices: [
      { voice: { frequency: 330, attack: 0.002, sustain: 0.05, release: 0.18, wave: "saw", volume: 0.5 } },
    ],
  },
} as const satisfies Record<string, Cue<DefaultBus>>;

export type CueKey = keyof typeof CUES;

/** The sound over that pack, its recording at `url`: the page writes the file in the browser and hands it over. */
export const makeSound = (url: string) =>
  createSound({ cues: CUES, packs: { demo: packOf(url) }, volume: 0.3 });

/** What the page holds: the sound, and the cue it plays. */
export type ShotRig = ReturnType<typeof makeSound>;
