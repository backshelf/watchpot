// Shorthand cues and mix presets: `resolveCue` on each string form, the preset bank and the mix files, and a sound
// built on shorthand cues playing through the core (the committed WebAssembly as the worklet, as engine.test.ts
// drives it).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type CoreBoot, createSoundWith } from "../../src/sound/engine";
import { mixPresets, PRESET_VOICE_NAMES, presetVoices, resolveCue } from "../../src/sound/presets";
import { decodeCommands, type SoundCommand, type SoundEvent } from "../../src/sound/protocol";
import type { Cue, CueShorthand } from "../../src/sound/types";
import { loadCore, peak } from "./harness";

const RATE = 48000;
const realContext = globalThis.AudioContext;

const ctx = {
  state: "running" as AudioContextState,
  currentTime: 1,
  sampleRate: RATE,
  destination: {},
  resume: async () => undefined,
};

beforeAll(async () => {
  // zzfx opens a context when it loads; the engine then plays through the one put in its place below.
  globalThis.AudioContext = class {
    state = "running";
    resume = async () => undefined;
  } as unknown as typeof AudioContext;
  const { ZZFX } = await import("zzfx");
  ZZFX.audioContext = ctx as unknown as AudioContext;
});
afterAll(() => {
  globalThis.AudioContext = realContext;
});

/** The harness as the worklet: every record kept, events handed back on each `pump`. */
function fakeWorklet() {
  const core = loadCore({ sampleRate: RATE });
  const sent: SoundCommand[] = [];
  let hear: (events: SoundEvent[]) => void = () => undefined;
  const boot: CoreBoot = {
    supported: () => true,
    boot: async () => ({
      send(records) {
        sent.push(...decodeCommands(records));
        core.send(records);
      },
      upload(pcm, record) {
        const load = decodeCommands(record)[0];
        if (load?.op !== "SAMPLE_LOAD") throw new Error("not a SAMPLE_LOAD");
        sent.push(load);
        core.loadSample(load.sample, pcm, { channels: load.channels as 1 | 2, rate: load.rate });
      },
      onEvent: (listener) => {
        hear = listener;
      },
      onError: () => undefined,
      dispose: () => undefined,
    }),
  };
  return {
    boot,
    /** Renders a few blocks and hands the events to the shell; returns the loudest sample heard. */
    pump(frames = 512) {
      const [left] = core.render(frames);
      hear(core.events());
      return peak(left);
    },
    starts: () => sent.filter((c) => c.op === "VOICE_START"),
  };
}

describe("resolveCue", () => {
  test("an object cue is returned as it is", () => {
    const cue = { voices: [{ voice: { frequency: 440 } }], bus: "ui" } satisfies Cue;
    expect(resolveCue(cue, "hit")).toBe(cue);
  });

  test("a preset voice name plays that voice on its bus", () => {
    expect(resolveCue("ui.click", "tap")).toEqual({ bus: "ui", voices: presetVoices["ui.click"] });
    expect(resolveCue("sfx.coin", "coin")).toEqual({ bus: "sfx", voices: presetVoices["sfx.coin"] });
  });

  test("a sample key plays that one recording", () => {
    expect(resolveCue("doors/creak", "door")).toEqual({ takes: [{ sample: "doors/creak" }] });
  });

  test("any other string throws, naming the key", () => {
    const notACue: string = "nope";
    expect(() => resolveCue(notACue as CueShorthand, "bad")).toThrow(
      'watchpot/sound: cue "bad" is "nope", which is neither a preset voice nor a "<pack>/<sample>" key: use one of PRESET_VOICE_NAMES, a sample key, or a full cue object',
    );
  });
});

describe("the preset bank", () => {
  test("every preset voice name has at least one layer", () => {
    expect(PRESET_VOICE_NAMES.length).toBeGreaterThan(0);
    for (const name of PRESET_VOICE_NAMES) expect(presetVoices[name].length).toBeGreaterThan(0);
  });
});

describe("mixPresets", () => {
  test("each is a version 2 file whose mix layer holds only level: keys", () => {
    for (const file of Object.values(mixPresets)) {
      expect(file.version).toBe(2);
      const mix = file.layers?.mix ?? {};
      expect(Object.keys(mix).length).toBeGreaterThan(0);
      for (const key of Object.keys(mix)) expect(key.startsWith("level:")).toBe(true);
    }
  });

  test("the named levels", () => {
    expect(mixPresets.balanced.layers?.mix).toEqual({ "level:music": -8, "level:ambience": -12 });
    expect(mixPresets.quietMusic.layers?.mix).toEqual({ "level:music": -14, "level:ambience": -18 });
    expect(mixPresets.softUi.layers?.mix).toEqual({
      "level:ui": -6,
      "level:music": -8,
      "level:ambience": -12,
    });
  });
});

describe("a sound built on shorthand cues", () => {
  test("does not throw and plays a preset cue on its bus through the core", async () => {
    const worklet = fakeWorklet();
    const sound = createSoundWith({ cues: { a: "ui.click", b: "pack/x" } }, worklet.boot);
    await sound.unlock();
    expect(sound.mode()).toBe("core");
    expect(sound.play("a")).not.toBeNull();
    const [start] = worklet.starts();
    expect(start?.bus).toBe(2); // ui
    expect(start?.atFrame).toBe(0);
    expect(Math.abs((start?.rate ?? 0) - 1)).toBeLessThanOrEqual(0.05);
    expect(worklet.pump(4096)).toBeGreaterThan(0.01);
  });
});
