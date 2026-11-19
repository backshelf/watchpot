import { type Cue, createSound, type DefaultBus, type Wave } from "watchpot/sound";

/**
 * A voice as a table writes it: the numbers zzfx reads. A wave, a pitch in Hz, and the shape of its envelope in
 * seconds (attack, sustain at full level, release).
 */
export interface Numbers {
  wave: Wave;
  frequency: number;
  sustain: number;
  release: number;
}

/** Where this page's sliders start: a short, plain pluck. */
export const VOICE: Numbers = { wave: "triangle", frequency: 660, sustain: 0.08, release: 0.25 };

/** One voice in one cue: the shape every sounded cue in a table has, down to its numbers. */
export function cueOf(numbers: Numbers): Cue<DefaultBus> {
  return {
    voices: [{ voice: { ...numbers, attack: 0.005, volume: 0.5 } }],
  };
}

/** The sound over one voice. The table is read when the sound is made, so new numbers are a new `createSound`. */
export const makeSound = (numbers: Numbers) => createSound({ cues: { voice: cueOf(numbers) }, volume: 0.3 });
