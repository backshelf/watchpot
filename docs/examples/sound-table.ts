import { type Cue, createSound, type DefaultBus, type PackManifest, type PackSample } from "watchpot/sound";
import type { Rarity } from "./vocab";

/** One shot of the pack, as `buildPack` measures it. A real game imports the manifest it writes instead. */
const shot = (file: string, seconds: number, rootHz?: number): PackSample => ({
  url: `/audio/ui/${file}.opus`,
  seconds,
  channels: 1,
  lufs: -18,
  peak: 0.7,
  kind: "shot",
  ...(rootHz ? { rootHz } : {}),
});

/** Stands for `import { pack } from "./audio/packs/ui/pack"` (docs/sound-packs.md). */
const ui: PackManifest = {
  name: "ui",
  tempo: 120,
  key: "Am",
  samples: {
    kick: shot("kick", 0.35, 55),
    hat: shot("hat", 0.12),
    "hat-open": shot("hat-open", 0.4),
    chord: shot("chord", 1.2, 220),
  },
};

/**
 * Every cue by key. `takes` are recordings from a pack, `voices` are zzfx layers: what plays until the pack has
 * loaded, and the whole cue if it never does.
 */
const CUES = {
  /** Two hats by how hard the press was: one is picked per play and never the same twice in a row. */
  gold: {
    takes: [
      { sample: "ui/hat", velocity: [0, 0.6] },
      { sample: "ui/hat-open", velocity: [0.6, 1] },
    ],
    vary: { cents: 20, db: 1.5, startMs: 4 },
    cooldownMs: 40,
    placed: true,
    voices: [{ voice: { frequency: 1760, sustain: 0.01, release: 0.06, wave: "square", volume: 0.4 } }],
  },
  /** One kick climbing a ladder, and past eight plays a second it becomes one sustained voice. */
  gems: {
    takes: [{ sample: "ui/kick", level: -2 }],
    ladder: [1, 1.122, 1.26, 1.335, 1.498],
    roll: { above: 8 },
    voices: [{ voice: { frequency: 220, sustain: 0.04, release: 0.12, wave: "sine" } }],
  },
  /** A chord moved onto the harmony clock, started on the next beat, a little of it sent to the room. */
  reveal: {
    takes: [{ sample: "ui/chord" }],
    pitched: true,
    quantise: "4",
    bus: "ui",
    sends: { ambience: 0.2 },
    priority: 2,
    loudness: 66,
    voices: [
      { voice: { frequency: 440, attack: 0.01, sustain: 0.1, release: 0.3, wave: "sine" } },
      { voice: { frequency: 660, attack: 0.01, sustain: 0.1, release: 0.4, wave: "sine" }, at: 0.08 },
    ],
  },
} as const satisfies Record<string, Cue<DefaultBus>>;

export type CueKey = keyof typeof CUES;

export const sound = createSound({ cues: CUES, packs: { ui }, volume: 0.3 });

/** The chord's scale degree for each rung of the game's ladder. */
const DEGREE: Record<Rarity, number> = { common: 0, rare: 2, epic: 4 };

/** A game wraps the engine in named cue functions, so a screen never spells a key. */
export const playGold = (at?: Element, hard = false) =>
  sound.play("gold", { at, velocity: hard ? 0.9 : 0.4 });
export const playGems = (streak: number) => sound.play("gems", { step: streak });
export const playReveal = (rarity: Rarity) => sound.play("reveal", { degree: DEGREE[rarity] });

/** Browsers start audio suspended: arm the unlock once at boot, on the first gesture. */
export const arm = () => sound.armUnlock();

/** Asks for the pack's samples; safe before the first gesture (they load when the core comes up). */
export const warm = () => sound.loadPack("ui");
