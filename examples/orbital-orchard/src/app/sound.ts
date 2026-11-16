import { type Cue as CueDef, createSound, type DefaultBus } from "watchpot/sound";
import type { SkyTokenId } from "../content/shower";
import type { Rarity } from "../content/words";

/**
 * The game's sounds: zzfx voices only, no recorded files. Soft and low, the station's hum under them; the one loud
 * cue is the heirloom's bloom. A cue is a list of layered voices (`watchpot` README › Sound); tune by ear in the dev
 * panel's sound view or by editing the numbers. Screens call the named functions below, never a key.
 *
 * The mix: everything the caretaker does plays on `sfx`, which sends a little to `room` (the station's reverb); the
 * long swells play on `ambience`, which ducks under `sfx` so a bloom lands on top of the hum it rose out of. What
 * happens at a place on the screen (a tree planted, a module raised, a catch) is heard from there. Planting faster
 * than eight a second becomes one roll.
 *
 * The clock: the transport runs from the first line below at 72 bpm, in C pentatonic. `hum` is one sequence on it, a
 * sparse figure of the `common` chime on the scale's degrees, quiet under everything; a screen can print its steps
 * (`HUM_STEPS`, `onHumStep`). The station has two moods, scenes of the mix the screens fade between with `setMood`.
 * zzfx voices have no recorded root, so the key changes nothing: a degree is the chime's own 523 Hz (a C) moved up the
 * scale's steps.
 */
type Bus = DefaultBus | "room";

const CUES = {
  /** A tree in the ground: a soft wooden pluck. */
  plant: {
    placed: true,
    roll: { above: 8 },
    voices: [
      {
        voice: { frequency: 392, attack: 0.002, sustain: 0.01, release: 0.12, wave: "triangle", volume: 0.7 },
      },
      { voice: { frequency: 784, attack: 0.002, release: 0.06, wave: "sine", volume: 0.25 }, at: 0.01 },
    ],
  },
  /** A module raised: a latch and a hum coming up. */
  raise: {
    placed: true,
    voices: [
      { voice: { volume: 0.5, noise: 0.4, attack: 0.001, release: 0.04, wave: "square", filter: -2200 } },
      {
        voice: { frequency: 110, slide: 0.4, attack: 0.03, sustain: 0.12, release: 0.25, wave: "sine" },
        at: 0.03,
      },
    ],
  },
  /** The graft kit opening: a seal, then air. */
  kit: {
    voices: [
      { voice: { frequency: 220, slide: 3, attack: 0.01, sustain: 0.06, release: 0.18, wave: "sine" } },
      {
        voice: { volume: 0.35, noise: 0.25, attack: 0.02, release: 0.3, wave: "noise", filter: -1200 },
        at: 0.04,
      },
    ],
  },
  common: {
    ladder: "scale",
    voices: [{ voice: { frequency: 523, attack: 0.005, sustain: 0.03, release: 0.18, wave: "sine" } }],
  },
  rare: {
    voices: [
      { voice: { frequency: 587, attack: 0.005, sustain: 0.05, release: 0.25, wave: "sine" } },
      { voice: { frequency: 880, attack: 0.005, sustain: 0.06, release: 0.3, wave: "sine" }, at: 0.08 },
    ],
  },
  exotic: {
    voices: [
      { voice: { frequency: 659, attack: 0.01, sustain: 0.08, release: 0.35, wave: "sine" } },
      { voice: { frequency: 988, attack: 0.01, sustain: 0.08, release: 0.4, wave: "sine" }, at: 0.09 },
      {
        voice: { frequency: 1319, attack: 0.01, sustain: 0.1, release: 0.5, wave: "triangle", volume: 0.6 },
        at: 0.18,
      },
    ],
  },
  /** The bloom: a slow major chord opening over a low root, then a high shimmer. */
  heirloom: {
    voices: [
      { voice: { frequency: 131, attack: 0.25, sustain: 0.8, release: 1.4, wave: "sine", volume: 0.8 } },
      {
        voice: { frequency: 523, attack: 0.2, sustain: 0.6, release: 1.2, wave: "sine", volume: 0.5 },
        at: 0.05,
      },
      {
        voice: { frequency: 659, attack: 0.2, sustain: 0.6, release: 1.2, wave: "sine", volume: 0.45 },
        at: 0.15,
      },
      {
        voice: { frequency: 784, attack: 0.2, sustain: 0.6, release: 1.3, wave: "sine", volume: 0.4 },
        at: 0.25,
      },
      {
        voice: {
          frequency: 1568,
          attack: 0.05,
          sustain: 0.3,
          release: 1,
          wave: "triangle",
          volume: 0.2,
          tremolo: 0.3,
        },
        at: 0.5,
      },
    ],
  },
  /** Under a big face before it turns: the room swelling. */
  charge: {
    bus: "ambience",
    voices: [
      {
        voice: {
          frequency: 98,
          slide: 0.6,
          attack: 0.8,
          sustain: 0.4,
          release: 0.3,
          wave: "sine",
          volume: 0.6,
        },
      },
    ],
  },
  /** A net thrown: a hiss out into the dark. */
  cast: {
    voices: [
      {
        voice: {
          volume: 0.4,
          noise: 0.6,
          attack: 0.02,
          release: 0.22,
          wave: "noise",
          filter: -3000,
          slide: -1,
        },
      },
    ],
  },
  /** What came back: a ping for a shard, a chime for a seed pod, a low thud and sparkle for a fireball. */
  shard: {
    placed: true,
    voices: [{ voice: { frequency: 1175, attack: 0.002, release: 0.15, wave: "sine", volume: 0.6 } }],
  },
  pod: {
    placed: true,
    voices: [
      { voice: { frequency: 784, attack: 0.005, release: 0.2, wave: "sine" } },
      { voice: { frequency: 1047, attack: 0.005, release: 0.3, wave: "sine" }, at: 0.07 },
    ],
  },
  fireball: {
    placed: true,
    voices: [
      { voice: { frequency: 65, slide: -0.3, attack: 0.005, sustain: 0.1, release: 0.6, wave: "sine" } },
      { voice: { volume: 0.4, noise: 0.5, attack: 0.005, release: 0.4, wave: "noise", filter: -900 } },
      { voice: { frequency: 1760, attack: 0.002, release: 0.25, wave: "sine", volume: 0.3 }, at: 0.12 },
    ],
  },
  claim: {
    placed: true,
    voices: [
      { voice: { frequency: 440, attack: 0.005, sustain: 0.04, release: 0.2, wave: "triangle" } },
      { voice: { frequency: 660, attack: 0.005, sustain: 0.06, release: 0.3, wave: "triangle" }, at: 0.1 },
    ],
  },
  /** A new orbit: the burn, long and falling away. */
  orbit: {
    bus: "ambience",
    voices: [
      {
        voice: {
          frequency: 160,
          slide: 1.5,
          attack: 0.08,
          sustain: 0.5,
          release: 0.8,
          wave: "saw",
          filter: -700,
        },
      },
      {
        voice: {
          volume: 0.4,
          noise: 0.3,
          attack: 0.1,
          sustain: 0.4,
          release: 0.8,
          wave: "noise",
          filter: -600,
        },
        at: 0.05,
      },
      {
        voice: { frequency: 330, slide: 1.5, attack: 0.08, sustain: 0.4, release: 0.8, wave: "sine" },
        at: 0.1,
      },
    ],
  },
} as const satisfies Record<string, CueDef<Bus>>;

export type Cue = keyof typeof CUES;

export const sound = createSound({
  cues: CUES,
  volume: 0.3,
  buses: {
    room: { level: -6, fx: [{ kind: "reverb", size: 0.55, decay: 2.4, damping: 0.5, mix: 1 }] },
    sfx: { sends: { room: 0.18 } },
    ambience: {
      sends: { room: 0.3 },
      fx: [
        { kind: "compressor", key: "sfx", threshold: -32, ratio: 4, attack: 0.01, release: 0.25, range: 9 },
      ],
    },
  },
  scenes: {
    /** The mix as declared above: a small, close room. */
    dusk: {
      buses: {
        room: { level: -6, fx: { 0: { size: 0.55, decay: 2.4 } } },
        sfx: { sends: { room: 0.18 } },
        ambience: { level: 0 },
      },
    },
    /** The room opens: a longer tail, more of everything sent to it, the swells up. */
    bloom: {
      buses: {
        room: { level: -3, fx: { 0: { size: 0.8, decay: 4.5 } } },
        sfx: { sends: { room: 0.3 } },
        ambience: { level: 2 },
      },
    },
  },
});

sound.transport.set({ bpm: 72, beatsPerBar: 4 });
sound.transport.start();
sound.harmony.set({ key: "C", scale: "pentatonic" });

/** The hum's pattern, one character an eighth over two bars: `1` sounds the chime, `0` rests. */
export const HUM_STEPS = "1000001010000100";

/** A sparse figure of the `common` chime on the scale, 16 dB down: the station's pulse. */
export const hum = sound.sequence({
  cue: "common",
  grid: "8",
  steps: HUM_STEPS,
  degrees: [0, 2, 4, 2],
  level: -16,
});

/** Calls `fn` with the index into `HUM_STEPS` of each step as it sounds, rests included; returns what stops it. */
export const onHumStep = (fn: (index: number) => void) => hum.onStep(fn);

/** The two moods of the mix. */
export type Mood = "dusk" | "bloom";

/** Fades the mix to a mood over `fadeMs` (default 1.2 seconds). */
export const setMood = (mood: Mood, fadeMs = 1200) => sound.mixer.scene(mood, { fadeMs });

/** Where on the screen a sound happened: the element the player touched. */
type At = Element | undefined;

/** Not marked as the hand's own: planting faster than eight a second is allowed to become a roll. */
export const playPlant = (at?: At) => sound.play("plant", { at });
export const playRaise = (at?: At) => sound.play("raise", { at, mine: true });
export const playKit = () => sound.play("kit");
export const playReveal = (rarity: Rarity) => sound.play(rarity);
export const playCharge = () => sound.play("charge");
export const playCast = () => sound.play("cast");
/** What a net brought back: the dark is silent. */
export const playCatch = (token: SkyTokenId, at?: At) => {
  if (token === "fireball") sound.play("fireball", { at });
  else if (token === "pod") sound.play("pod", { at });
  else if (token !== "dark") sound.play("shard", { at });
};
export const playClaim = (at?: At) => sound.play("claim", { at, mine: true });
export const playOrbit = () => sound.play("orbit");
