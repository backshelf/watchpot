import { type Cue, createSound, type DefaultBus } from "watchpot/sound";

/** Two cues with nothing to render but their voices: what the core turns into samples and mixes. */
const CUES = {
  thump: {
    bus: "sfx",
    voices: [
      { voice: { wave: "sine", frequency: 70, attack: 0.002, sustain: 0.04, release: 0.2, volume: 0.6 } },
    ],
  },
  bell: {
    bus: "sfx",
    voices: [
      {
        voice: { wave: "triangle", frequency: 1046, attack: 0.002, sustain: 0.06, release: 0.5, volume: 0.3 },
      },
    ],
  },
} as const satisfies Record<string, Cue<DefaultBus>>;

export type CueKey = keyof typeof CUES;

/** The sound over those cues. Nothing is loaded or played until `unlock()`. */
export const sound = createSound({ cues: CUES, volume: 0.3 });

/** What the tap reads, five numbers about the master: its level, three bands of it, and its flux. */
export const FIGURES = ["level", "bass", "mid", "high", "flux"] as const;
export type Figure = (typeof FIGURES)[number];

/** A thump for the meter to catch, and the bell after it: the player's own hand, so nothing is held back. */
export const playThump = () => sound.play("thump", { mine: true });
export const playBell = () => sound.play("bell", { mine: true });
