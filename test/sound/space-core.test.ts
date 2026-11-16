// Space on the committed WebAssembly build: the place of a voice, the morphing reverb and the convolver, driven
// through their commands where the worklet runs them.
import { describe, expect, test } from "bun:test";
import { type CommandFields, FX_KIND, FX_PARAMS, SPACE_MODE } from "../../src/sound/protocol";
import { loadCore, rms } from "./harness";

const voice = (fields: Partial<CommandFields<"VOICE_START">>): CommandFields<"VOICE_START"> => ({
  voice: 1,
  sample: 1,
  bus: 1,
  gain: 1,
  pan: 0,
  rate: 1,
  offset: 0,
  loopStart: 0,
  loopEnd: 0,
  attack: 0,
  release: 0,
  sendBus1: 0,
  send1: 0,
  sendBus2: 0,
  send2: 0,
  priority: 0,
  flags: 0,
  ...fields,
});

/** White noise as 16-bit mono PCM, from a seed. */
function noisePcm(frames: number, level = 0.5, seed = 1): Int16Array {
  const pcm = new Int16Array(frames);
  let s = seed;
  for (let i = 0; i < frames; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    pcm[i] = Math.round((s / 2 ** 32 - 0.5) * 2 * level * 32767);
  }
  return pcm;
}

/** The RMS of the first difference over the RMS: higher is brighter. */
function brightness(samples: Float32Array): number {
  const diff = new Float32Array(samples.length - 1);
  for (let i = 1; i < samples.length; i++) diff[i - 1] = (samples[i] ?? 0) - (samples[i - 1] ?? 0);
  return rms(diff) / rms(samples);
}

const firstSound = (samples: Float32Array) => samples.findIndex((s) => Math.abs(s) > 1e-4);

describe("space on the core", () => {
  test("a voice placed far away is quieter and darker than one placed near", () => {
    const placed = (distance: number, mode: number) => {
      const core = loadCore();
      core.loadSample(1, noisePcm(48000));
      core.command("SPACE_SET", { atFrame: 0, mode });
      core.command("VOICE_START", voice({}));
      core.command("VOICE_PLACE", { atFrame: 0, voice: 1, pan: 0, distance, occlusion: 0, slew: 0 });
      const [left] = core.render(9600);
      return { level: rms(left), bright: brightness(left) };
    };
    for (const mode of [SPACE_MODE.speakers, SPACE_MODE.headphones]) {
      const near = placed(0, mode);
      const far = placed(1, mode);
      expect(far.level).toBeLessThan(near.level * 0.2);
      expect(far.bright).toBeLessThan(near.bright * 0.7);
    }
  });

  test("the reverb on a bus rings on after its sound has ended", () => {
    const tail = (kind: number) => {
      const core = loadCore();
      core.loadSample(1, noisePcm(2400));
      core.command("FX_DEFINE", { atFrame: 0, bus: 1, slot: 0, kind, key: 0 });
      core.command("VOICE_START", voice({}));
      const [left] = core.render(48000);
      return rms(left.subarray(9600));
    };
    expect(tail(FX_KIND.none)).toBe(0);
    expect(tail(FX_KIND.fdn)).toBeGreaterThan(1e-3);
  });

  test("a larger room rings longer", () => {
    const late = (size: number) => {
      const core = loadCore();
      core.loadSample(1, noisePcm(2400));
      core.command("FX_DEFINE", { atFrame: 0, bus: 1, slot: 0, kind: FX_KIND.fdn, key: 0 });
      core.command("FX_SET", {
        atFrame: 0,
        bus: 1,
        slot: 0,
        param: FX_PARAMS.fdn.size,
        value: size,
        slew: 0,
        curve: 0,
      });
      core.command("VOICE_START", voice({}));
      const [left] = core.render(72000);
      return rms(left.subarray(48000)) / rms(left.subarray(0, 4800));
    };
    expect(late(0.8)).toBeGreaterThan(10 * late(0.2));
  });

  test("the convolver hears its response from an uploaded sample and adds 256 frames to the wet path", () => {
    const onset = (convolve: boolean) => {
      const core = loadCore();
      const click = new Int16Array(64);
      click[0] = 16000;
      core.loadSample(1, click);
      core.loadSample(2, new Int16Array([32767]), { rate: 48000 });
      core.render(128);
      if (convolve) {
        core.command("FX_DEFINE", { atFrame: 0, bus: 1, slot: 0, kind: FX_KIND.conv, key: 0 });
        core.command("IR_LOAD", { atFrame: 0, bus: 1, slot: 0, sample: 2 });
      }
      core.command("VOICE_START", voice({}));
      return firstSound(core.render(4096)[0]);
    };
    expect(onset(true) - onset(false)).toBe(256);
  });
});
