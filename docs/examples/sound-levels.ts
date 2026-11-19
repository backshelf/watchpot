import { type Cue, createSound, type DefaultBus, type SoundOptions } from "watchpot/sound";

/** The three buses this table plays on: the mixer's groups, the faders a desk shows as columns. */
export const GROUPS = ["sfx", "ui", "ambience"] as const;
export type Group = (typeof GROUPS)[number];

/** Where each bus's fader starts, in dB, before anyone opens the desk. The default is 0. */
export const LEVELS: Record<Group, number> = { sfx: 0, ui: -4, ambience: -10 };

/** A cue per bus, so every fader has something under it. */
const CUES = {
  tap: {
    bus: "ui",
    voices: [{ voice: { wave: "sine", frequency: 2400, release: 0.02, volume: 0.3 } }],
  },
  pop: {
    bus: "sfx",
    voices: [
      { voice: { wave: "sine", frequency: 220, attack: 0.002, sustain: 0.02, release: 0.12, volume: 0.5 } },
    ],
  },
  swell: {
    bus: "ambience",
    voices: [
      {
        voice: { wave: "triangle", frequency: 196, attack: 0.4, sustain: 0.6, release: 1.2, volume: 0.35 },
      },
    ],
  },
} as const satisfies Record<string, Cue<DefaultBus>>;

export type CueKey = keyof typeof CUES;

/**
 * The mix those cues play into: a level on each bus, and a `room` bus that nothing plays on: a reverb every other
 * bus sends a little of itself to, so all three share one space.
 */
export const BUSES = {
  sfx: { level: LEVELS.sfx, sends: { room: 0.15 } },
  ui: { level: LEVELS.ui },
  ambience: { level: LEVELS.ambience, sends: { room: 0.45 } },
  room: { level: -8, fx: [{ kind: "reverb", id: "hall", size: 0.6, decay: 2.4, mix: 1 }] },
} as const satisfies NonNullable<SoundOptions<CueKey, string, "room">["buses"]>;

/** The mix as a desk changes it: `mix.json` is this object, saved, and handed back as `createSound({ mix })`. */
export const sound = createSound({ cues: CUES, buses: BUSES, volume: 0.3 });
