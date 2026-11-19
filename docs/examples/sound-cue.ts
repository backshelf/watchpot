import { type Cue, createSound, type DefaultBus } from "watchpot/sound";

/**
 * Simmer's three sounds as one table: every cue by key, each made of zzfx voices and numbers, with no recording
 * behind any of them. `createSound` reads the whole table at once and plays it by key.
 */
const CUES = {
  /** The pot's tap: one short high note, a little different each press, heard where on the screen it was pressed. */
  bubble: {
    placed: true,
    vary: { cents: 20, db: 1.5, startMs: 4 },
    voices: [{ voice: { frequency: 1760, sustain: 0.01, release: 0.06, wave: "square", volume: 0.4 } }],
  },
  /** Bubbles in a row: one note climbing a ladder, a step for each press. */
  stir: {
    ladder: [1, 1.122, 1.26, 1.335, 1.498],
    voices: [{ voice: { frequency: 220, sustain: 0.04, release: 0.12, wave: "sine" } }],
  },
  /** The pot boils over: two notes a fifth apart, the second a moment after the first. */
  overflow: {
    priority: 2,
    voices: [
      { voice: { frequency: 440, attack: 0.01, sustain: 0.1, release: 0.3, wave: "sine" } },
      { voice: { frequency: 660, attack: 0.01, sustain: 0.1, release: 0.4, wave: "sine" }, at: 0.08 },
    ],
  },
} as const satisfies Record<string, Cue<DefaultBus>>;

/** Everything the table can be played by: a typo in `play` is a type error, not a silent press. */
export type CueKey = keyof typeof CUES;

/** The game's sound over that table. Nothing loads or plays until `unlock()`, on the reader's first press. */
export const sound = createSound({ cues: CUES, volume: 0.3 });

/** A game wraps the engine in named cue functions, so a screen never spells a key. */
export const playBubble = (at?: Element, hard = false) =>
  sound.play("bubble", { at, velocity: hard ? 0.9 : 0.4 });
export const playStir = (step: number) => sound.play("stir", { step });
export const playOverflow = () => sound.play("overflow", { mine: true });

/** Whether a cue plays a recording or its zzfx voices now, and for how long. There is no pack here. */
export const info = (key: CueKey) => sound.soundInfo(key);
