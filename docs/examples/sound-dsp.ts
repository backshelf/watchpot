import { useRef } from "react";
import { type ShaderHandle, useAudioUniforms } from "watchpot/shader";
import { type Cue, capture, createSound, type DefaultBus, syllables } from "watchpot/sound";

const CUES = {
  kick: {
    bus: "sfx",
    voices: [
      { voice: { frequency: 60, slide: -0.4, attack: 0.002, sustain: 0.05, release: 0.2, wave: "sine" } },
    ],
  },
} as const satisfies Record<string, Cue<DefaultBus | "glass">>;

export const sound = createSound({
  cues: CUES,
  packs: {
    ui: {
      name: "ui",
      tempo: 120,
      samples: {
        bed: {
          url: "/audio/ui/bed.opus",
          seconds: 8,
          channels: 2,
          lufs: -20,
          peak: 0.7,
          kind: "loop",
          bars: 4,
        },
      },
    },
  },
  buses: {
    // A freeze on a bus holds what the bus is playing. It does nothing until `sound.freeze` moves it.
    glass: { out: "ambience", fx: [{ kind: "freeze" }, { kind: "reverb", size: 0.7, decay: 5, mix: 0.4 }] },
  },
  volume: 0.3,
});

// ---- The granulator: a cloud of grains over a recording, its playhead a number the game drives.

/** A cloud over the pack's loop. `position` is 0..1 through the sample: set it every frame and the sample is scrubbed. */
export function openCloud() {
  const cloud = sound.grain("ui/bed", { bus: "ambience", size: 120, density: 30, spray: 0.1, spread: 0.6 });
  return {
    scrub: (position: number) => cloud.set({ position }, 40),
    /** Slower without lower: the playhead's own speed, apart from the grains' pitch. */
    slow: (rate: number) => cloud.set({ rate, pitch: 1 }),
    close: () => cloud.stop(400),
  };
}

// ---- The freeze: a wash held from the bus, or the last slice of the bar repeated.

/** Holds `glass` as a wash over a second; 0 lets it go. */
export const hold = (on: boolean) => sound.freeze("glass", on ? 1 : 0, 1000);

/** Instead of the wash, repeat the last sixteenth of the bar (0 turns the stutter off). */
export const stutter = (division: 0 | 8 | 16 | 32) => sound.mixer.bus("glass").fx(0).set("stutter", division);

// ---- Babble: a line spoken as syllables of shaped buzz, with a call as each one starts.

const voice = sound.babble({ bus: "voice", level: -6, rate: 9 });

/** Speaks `text` and prints it along: each call shows the text up to the end of the syllable that just started. */
export function say(text: string, show: (shown: string) => void) {
  const parts = syllables(text);
  return voice.say(text, {
    onChar: (index) => {
      const at = parts.findIndex((part) => part.index === index);
      show(text.slice(0, parts[at + 1]?.index ?? text.length));
    },
  });
}

// ---- The generators: sounds with no recording behind them, driven by numbers.

/** A pulse motor from a slow tick to a whine: `rate` is pulses a second, 0.5 to 2,000. */
export function startMotor() {
  const motor = sound.gen("motor", {
    bus: "ambience",
    level: -12,
    params: { rate: 6, duty: 0.3, load: 0.2 },
  });
  return { rate: (hz: number) => motor.set({ rate: hz }, 120), stop: () => motor.stop(300) };
}

/** Noise in a band, gated into eight bursts a second. `color` 0 is white, 1 pink. */
export const startRain = () =>
  sound.gen("noise", {
    bus: "ambience",
    level: -18,
    params: { color: 0, centre: 2000, width: 1500, grid: 8, duty: 0.4 },
  });

/** A struck bank: three resonators. `strike: 1` is a hard hit, a negative value a soft scrape. */
export function startBell() {
  const bell = sound.gen("modal", {
    bus: "sfx",
    modes: [
      { freq: 440, decay: 1.5, gain: 1 },
      { freq: 1213, decay: 0.8, gain: 0.5 },
      { freq: 2378, decay: 0.4, gain: 0.3 },
    ],
  });
  return { hit: (force = 1) => bell.set({ strike: force }), stop: () => bell.stop(300) };
}

// ---- The tap: what the master sounds like now, five numbers to draw with.

/** A backdrop's ref, fed `u_level`, `u_bass`, `u_mid`, `u_high` and `u_flux` each frame. Give it to a `ShaderCanvas`. */
export function useBackdrop() {
  const ref = useRef<ShaderHandle>(null);
  useAudioUniforms(ref, sound.tap);
  return ref;
}

// ---- Capture (development): the output as a WAV, to measure a mix in a build nobody is listening to.

export async function record(seconds = 4) {
  const wav = await capture(sound, seconds);
  return URL.createObjectURL(wav);
}
