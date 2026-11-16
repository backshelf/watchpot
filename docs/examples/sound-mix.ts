import { type Cue, createSound, type DefaultBus, soundPrefs } from "watchpot/sound";

/** The buses this game declares beside the five defaults (`sfx`, `ui`, `music`, `ambience`, `voice`). */
type Bus = DefaultBus | "room" | "crunch";

const CUES = {
  kick: {
    bus: "sfx",
    placed: true,
    voices: [
      { voice: { frequency: 60, slide: -0.4, attack: 0.002, sustain: 0.05, release: 0.2, wave: "sine" } },
    ],
  },
  /** Plays on `crunch`, which grinds it and passes it on to `sfx`. */
  hat: {
    bus: "crunch",
    voices: [
      { voice: { frequency: 6000, noise: 0.5, attack: 0.001, release: 0.05, wave: "noise", volume: 0.4 } },
    ],
  },
  pad: {
    bus: "ambience",
    voices: [
      { voice: { frequency: 131, attack: 0.6, sustain: 0.8, release: 1.2, wave: "sine", volume: 0.6 } },
    ],
  },
} as const satisfies Record<string, Cue<Bus>>;

export const sound = createSound({
  cues: CUES,
  volume: 0.3,
  buses: {
    // A return bus: the reverb starts fully wet, so it only ever hears what other buses send to it.
    room: { level: -6, fx: [{ kind: "reverb", size: 0.5, decay: 2, damping: 0.5, mix: 1 }] },
    sfx: { sends: { room: 0.2 } },
    // A duck: the compressor listens to `sfx` instead of its own bus, so every hit pushes the pad down by up to 9 dB.
    ambience: {
      sends: { room: 0.35 },
      fx: [
        { kind: "compressor", key: "sfx", threshold: -30, ratio: 4, attack: 0.01, release: 0.25, range: 9 },
      ],
    },
    // A bus with its own chain, summing into `sfx`.
    crunch: {
      out: "sfx",
      fx: [
        { kind: "saturator", drive: 12, mix: 0.6 },
        { kind: "filter", mode: "low", cutoff: 6000 },
        { kind: "delay", beats: 0.75, feedback: 0.4, pingpong: true, mix: 0.25 },
      ],
    },
  },
  // A scene says what it changes: anything it leaves out stays as the mix has it.
  scenes: {
    open: { buses: { room: { level: -4, fx: { 0: { size: 0.8, decay: 4 } } } } },
    tight: { buses: { room: { level: -14, fx: { 0: { size: 0.2, decay: 0.6 } } }, music: { level: -6 } } },
  },
  // Numbers the game feeds in, mapped onto the mix.
  routes: [
    { from: "heat", to: { bus: "crunch", fx: 0, param: "drive" }, range: [0, 30], curve: "exp" },
    { from: "danger", to: { bus: "music", level: true }, range: [0, -12], slewMs: 200 },
  ],
});

/** The mix follows the game. Called as often as it likes: a frame's sets are sent once. */
export function feed(heat: number, danger: number) {
  sound.mod.source("heat").set(heat);
  sound.mod.source("danger").set(danger);
}

/** Fades the mix to the scene for the screen that is open. */
export const enterRoom = (name: "open" | "tight") => sound.mixer.scene(name, { fadeMs: 600 });

/** Lays a scene over whatever is current (a dialog); the returned function takes it off again. */
export const overlay = () => sound.mixer.scene.push("tight", { fadeMs: 300 });

/** Plays a swell, then lets the room grow while it sounds: no pitch swoop, the room just gets bigger. */
export function swell() {
  sound.play("pad");
  sound.mixer.bus("room").fx(0).set("size", 0.9, 1500);
  sound.mixer.bus("sfx").send("room", 0.3, 800);
}

/** A sound is heard where it happened. Plays placed at anything inside a closed drawer are muffled. */
export function place(drawer: Element, button: Element) {
  sound.space.place(drawer, { occluded: 0.6 });
  sound.play("kick", { at: button });
}

/** The player's settings, kept on the device: a volume per bus, and speakers or headphones. */
export const prefs = soundPrefs("game:sound", sound);
export const setMusicVolume = (v: number) => prefs.setBusVolume("music", v);
export const setHeadphones = (on: boolean) => prefs.setHeadphones(on);
