import { createSound } from "watchpot/sound";

/**
 * The game's sounds: zzfx voices only, no recorded files. A cue is a list of layered voices (`watchpot` README ›
 * Sound); tune by ear in the dev panel's sound view or by editing the numbers. They are placeholders: the feel pass
 * designs this game's own, from packs of recordings (`node_modules/watchpot/docs/sound-packs.md`: `takes` on a cue, the
 * voices kept as the fallback).
 *
 * The mix: five buses exist already (`sfx`, `ui`, `music`, `ambience`, `voice`); `buy` and `press` play on `ui`, the
 * rest on `sfx`, and both send a little to `room`, a reverb that hears only what is sent to it (`sound-mix.md`, beside `sound-packs.md`).
 */
export const sound = createSound({
  cues: {
    buy: { bus: "ui", voices: [{ voice: { frequency: 520, attack: 0.005, sustain: 0.02, release: 0.08, wave: "triangle" } }] },
    // @if clicker
    // A press can come twenty times a second: one sound per 50 ms keeps a fast hand from stacking into a buzz.
    press: { bus: "ui", cooldownMs: 50, voices: [{ voice: { frequency: 340, attack: 0.002, sustain: 0.01, release: 0.05, wave: "sine" } }] },
    crit: {
      voices: [
        { voice: { frequency: 440, attack: 0.002, sustain: 0.02, release: 0.1, wave: "triangle" } },
        { voice: { frequency: 880, attack: 0.002, sustain: 0.03, release: 0.14, wave: "sine" }, at: 0.04 },
      ],
    },
    // @end
    // @if gacha
    pull: {
      voices: [
        { voice: { frequency: 300, slide: 4, attack: 0.01, sustain: 0.08, release: 0.15, wave: "sine" } },
        { voice: { volume: 0.4, noise: 0.2, attack: 0.01, release: 0.2, wave: "noise", filter: -1500 }, at: 0.02 },
      ],
    },
    rare: {
      voices: [
        { voice: { frequency: 660, attack: 0.01, sustain: 0.1, release: 0.3, wave: "sine" } },
        { voice: { frequency: 990, attack: 0.01, sustain: 0.1, release: 0.4, wave: "sine" }, at: 0.09 },
        { voice: { frequency: 1320, attack: 0.01, sustain: 0.15, release: 0.5, wave: "sine" }, at: 0.18 },
      ],
    },
    // @end
    // @if prestige
    ascend: {
      voices: [
        { voice: { frequency: 180, slide: 2, attack: 0.05, sustain: 0.4, release: 0.6, wave: "saw", filter: -900 } },
        { voice: { frequency: 360, slide: 2, attack: 0.05, sustain: 0.4, release: 0.6, wave: "sine" }, at: 0.05 },
      ],
    },
    // @end
    // @if achievements
    earned: {
      voices: [
        { voice: { frequency: 784, attack: 0.01, sustain: 0.06, release: 0.25, wave: "sine" } },
        { voice: { frequency: 1175, attack: 0.01, sustain: 0.08, release: 0.35, wave: "sine" }, at: 0.07 },
      ],
    },
    // @end
    // @if visitor
    catch: {
      voices: [
        { voice: { frequency: 260, slide: 3, attack: 0.01, sustain: 0.05, release: 0.2, wave: "triangle" } },
        { voice: { frequency: 520, slide: 2, attack: 0.01, sustain: 0.05, release: 0.25, wave: "sine" }, at: 0.06 },
      ],
    },
    // @end
  },
  buses: {
    room: { level: -6, fx: [{ kind: "reverb", size: 0.5, decay: 2, damping: 0.5, mix: 1 }] },
    sfx: { sends: { room: 0.15 } },
    ui: { sends: { room: 0.08 } },
  },
  volume: 0.3,
});

export type Cue = Parameters<typeof sound.play>[0];
