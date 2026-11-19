import {
  type Cue,
  createSound,
  type DefaultBus,
  type MusicSection,
  type PackManifest,
  type PackSample,
  type SceneDef,
} from "watchpot/sound";

/** The three loops of the score. A stem a section leaves out is silent. */
export const STEMS = ["pad", "bass", "drums"] as const;
export type Stem = (typeof STEMS)[number];

/** The game's three tiers. One section and one scene per tier, and nothing else differs between them. */
export const TIERS = ["quiet", "busy", "peak"] as const;
export type Tier = (typeof TIERS)[number];

/** One loop, as `buildPack` cuts it: a whole number of bars at the pack's tempo. */
const loop = (url: string, seconds: number): PackSample => ({
  url,
  seconds,
  channels: 1,
  lufs: -20,
  peak: 0.7,
  kind: "loop",
  bars: 1,
});

/** The pack as `pack.ts` writes it: its tempo, its key, and every loop by the stem it carries. */
export const packOf = (urls: Record<Stem, string>, seconds: number): PackManifest => ({
  name: "score",
  tempo: 100,
  key: "Am",
  samples: Object.fromEntries(STEMS.map((stem) => [stem, loop(urls[stem], seconds)])),
});

/** A section per tier: the stems it brings in, and how loud each one plays. */
export const SECTIONS: Record<Tier, MusicSection> = {
  quiet: { stems: { pad: 0.7 } },
  busy: { stems: { pad: 0.7, bass: 0.8 } },
  peak: { stems: { pad: 0.6, bass: 0.9, drums: 0.9 } },
};

/** A scene per tier: the same mix, the room opened as the tier rises. A scene says only what it changes. */
export const SCENES: Record<Tier, SceneDef<"room">> = {
  quiet: { buses: { room: { level: -16 } } },
  busy: { buses: { room: { level: -9 } } },
  peak: { buses: { room: { level: -3 } } },
};

/** The mix the score plays into: the music bus, and a room for the loops to ring in. */
export const BUSES = {
  music: { sends: { room: 0.2 } },
  room: { level: -9, fx: [{ kind: "reverb", id: "hall", size: 0.7, decay: 3, mix: 1 }] },
} as const;

/** A bell over the score when the tier changes: a cue on its own bus, played by the music. */
const CUES = {
  bell: {
    bus: "ui",
    voices: [
      { voice: { wave: "triangle", frequency: 880, attack: 0.01, sustain: 0.05, release: 0.4, volume: 0.3 } },
    ],
  },
} as const satisfies Record<string, Cue<DefaultBus>>;

/** The sound and its score: the pack's loops, the tiers' sections, and the transport they run on. */
export function makeSound(urls: Record<Stem, string>, seconds: number) {
  const sound = createSound({
    cues: CUES,
    packs: { score: packOf(urls, seconds) },
    buses: BUSES,
    scenes: SCENES,
    volume: 0.3,
  });
  const music = sound.music({ pack: "score", stems: STEMS, sections: SECTIONS });
  return { sound, music };
}

export type TierRig = ReturnType<typeof makeSound>;
