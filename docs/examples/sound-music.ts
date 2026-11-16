import { createElement, useEffect, useState } from "react";
import { type Cue, createSound, type DefaultBus, type MusicSection, type PackManifest } from "watchpot/sound";
import { Checker } from "watchpot/ui";
import type { Rarity } from "./vocab";

/** A loop of the pack: a whole number of bars at the pack's tempo, as `buildPack` cuts it. */
const loop = (file: string, bars: number, rootHz?: number) => ({
  url: `/audio/score/${file}.opus`,
  seconds: bars * 2.4,
  channels: 2 as const,
  lufs: -20,
  peak: 0.7,
  kind: "loop" as const,
  bars,
  ...(rootHz ? { rootHz } : {}),
});

/** Stands for `import { pack } from "./audio/packs/score/pack"` (docs/sound-packs.md). */
const score: PackManifest = {
  name: "score",
  tempo: 100,
  key: "Am",
  samples: { pad: loop("pad", 4, 220), bass: loop("bass", 4, 55), drums: loop("drums", 2) },
};

const CUES = {
  hat: {
    bus: "sfx",
    level: -6,
    voices: [
      { voice: { frequency: 6000, noise: 0.5, attack: 0.001, release: 0.04, wave: "noise", volume: 0.3 } },
    ],
  },
  /** On a scale ladder: `play("stab", { step: 3 })` is the scale's fourth degree, in the key now. */
  stab: {
    bus: "sfx",
    ladder: "scale",
    voices: [{ voice: { frequency: 262, attack: 0.002, sustain: 0.03, release: 0.15, wave: "triangle" } }],
  },
} as const satisfies Record<string, Cue<DefaultBus>>;

export const sound = createSound({ cues: CUES, packs: { score }, volume: 0.3 });

/** One section per rung of the game's ladder: which stems are heard, and the harmony it moves to. */
const SECTIONS: Record<Rarity, MusicSection> = {
  common: { stems: { pad: 0.7 } },
  rare: { stems: { pad: 0.7, bass: 0.8 }, harmony: { key: "Am", chord: [0, 2, 4] } },
  epic: { stems: { pad: 0.6, bass: 0.9, drums: 1 }, harmony: { key: "F", scale: "major", chord: [0, 2, 4] } },
};

/** The score: stems from one pack, kept in step with the transport, changing sections on the bar. */
export const music = sound.music({ pack: "score", stems: ["pad", "bass", "drums"], sections: SECTIONS });

/** The best rung found so far decides the section; it lands on the next bar line and fades over a bar. */
export const hear = (best: Rarity) => music.section(best);

/** A moment of the game: the stems it has drawn on, and a riser that builds with `tension` (0 lets it go). */
export const brace = (tension: number) => music.tension(tension);

/** The pattern, `1` a hit and `0` a rest. One string drives the sequence and the strip printed from it. */
export const PATTERN = "1011101011101111";

/** A sixteenth-note hat figure, and a line on the scale's degrees: one step each, in key, on the grid. */
export const hats = sound.sequence({ cue: "hat", grid: "16", steps: PATTERN, level: -3 });
export const line = sound.sequence({
  cue: "stab",
  grid: "8",
  steps: "1010110110101101",
  degrees: [0, 2, 4, 2, 3, 2, 0, 4],
});

/** The transport's tempo and meter (the swing bends the off sixteenths), then the clock. Sequences hold while it is stopped. */
sound.transport.set({ bpm: 100, beatsPerBar: 4, swing: 0.2 });
sound.transport.start();

/** The key and scale every pitched cue and every degree is read in; `when` waits for the next bar line. */
export const modulate = () => sound.harmony.set({ key: "C", scale: "dorian", chord: [0, 2, 4] }, "bar");

/** The step the hats are on, for a printed playhead; -1 before the first. */
export function useHatStep(): number {
  const [step, setStep] = useState(-1);
  useEffect(() => hats.onStep(setStep), []);
  return step;
}

/** The strip the hats print: a clock track over the pattern, with the playhead on the step that sounds. */
export function HatStrip() {
  return createElement(Checker, { bits: PATTERN, head: useHatStep() });
}
