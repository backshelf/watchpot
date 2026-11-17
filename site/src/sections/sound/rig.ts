// The instrument behind the sound sheet, made on the visitor's first press: the sound over the cues in `score.ts`,
// a mix with three live settings, three step sequences on the engine's transport and a babble voice. The section
// imports this module with `import()` from the press, so the engine (and its committed core) is fetched only then
// where the bundler splits; `createSound` itself loads nothing, and `unlock()` makes the AudioContext and adds the core.
import { type Babble, createSound, type Scale, type Sequence } from "watchpot/sound";
import type { PresetName } from "./score";
import { CUES, DEGREES, type MixSettings, PRESET_NAMES, TRACKS } from "./score";

function build(mix: MixSettings) {
  return createSound({
    // A preset name is its own shorthand cue; typed per name so `sound.play("sfx.coin")` checks beside the
    // section's own cues.
    cues: {
      ...CUES,
      ...(Object.fromEntries(PRESET_NAMES.map((n) => [n, n] as const)) as {
        [N in PresetName]: N;
      }),
    },
    volume: 0.3,
    buses: {
      sfx: {
        fx: [
          { kind: "filter", id: "tone", mode: "low", cutoff: mix.cutoff, q: 0.9 },
          { kind: "crush", id: "grit", bits: 5, rate: 7000, mix: mix.crush },
        ],
        sends: { room: 0.3 },
      },
      room: {
        level: -4,
        fx: [{ kind: "reverb", id: "hall", size: mix.size, decay: 1.6, damping: 0.55, mix: 1 }],
      },
    },
  });
}

export type Rig = {
  sound: ReturnType<typeof build>;
  tracks: Sequence[];
  voice: Babble;
};

/** The sound, its sequences and its voice. Before `unlock()` each remembers what it is told. */
export function createRig(
  pattern: readonly (readonly number[])[],
  { bpm, scale, mix }: { bpm: number; scale: Scale; mix: MixSettings },
): Rig {
  const sound = build(mix);
  sound.transport.set({ bpm, beatsPerBar: 4, swing: 0 });
  sound.harmony.set({ key: "A", scale });
  const tracks = TRACKS.map((track, i) =>
    sound.sequence({
      cue: track.cue,
      grid: "16",
      steps: pattern[i] ?? [],
      level: track.level,
      ...(track.cue === "blip" ? { degrees: DEGREES } : {}),
    }),
  );
  const voice = sound.babble({ bus: "voice", level: -8, rate: 9 });
  return { sound, tracks, voice };
}
