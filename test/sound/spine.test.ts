// The core's spine on the committed WebAssembly build: the ceiling, the timing and the speed the native tests
// prove, held again where the worklet runs it.
import { describe, expect, test } from "bun:test";
import type { CommandFields } from "../../src/sound/protocol";
import { loadCore, peak, sinePcm } from "./harness";

const voice = (fields: Partial<CommandFields<"VOICE_START">>): CommandFields<"VOICE_START"> => ({
  voice: 0,
  sample: 1,
  bus: 0,
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

/** -1 dBFS, the limiter's default ceiling. */
const CEILING = 10 ** (-1 / 20);

const dcPcm = (frames: number, level: number) => new Int16Array(frames).fill(Math.round(level * 32767));

const firstSound = (samples: Float32Array) => samples.findIndex((s) => s !== 0);

describe("the core's spine in Bun", () => {
  test("200 full-scale voices never pass the ceiling", () => {
    const core = loadCore({ voices: 64 });
    for (let k = 0; k < 8; k++) core.loadSample(k + 1, sinePcm(55 * (k + 1), 1, 48000, 1));
    for (let i = 0; i < 200; i++)
      core.command("VOICE_START", voice({ voice: i + 1, sample: (i % 8) + 1, pan: i / 100 - 1 }));
    const [left, right] = core.render(24000);
    expect(Math.max(peak(left), peak(right))).toBeLessThanOrEqual(CEILING);
    expect(peak(left)).toBeGreaterThan(0.5 * CEILING);
  });

  test("a voice starts on its frame, every frame of it as late as the limiter's lookahead", () => {
    const at = (frame: number) => {
      const core = loadCore();
      core.loadSample(1, dcPcm(4800, 0.25));
      core.render(384);
      core.command("VOICE_START", voice({ atFrame: 384 + frame }));
      return firstSound(core.render(2048)[0]);
    };
    const now = (() => {
      const core = loadCore();
      core.loadSample(1, dcPcm(4800, 0.25));
      core.render(384);
      core.command("VOICE_START", voice({ atFrame: 100 }));
      return firstSound(core.render(2048)[0]);
    })();
    // A start already past sounds on the block's first frame, after the lookahead (5 ms: 240 frames at 48 kHz).
    expect(now).toBe(240);
    expect(at(37) - now).toBe(37);
    expect(at(37 + 128 * 3) - now).toBe(37 + 128 * 3);
  });

  test("a stolen voice fades rather than steps, and its handle ends", () => {
    const core = loadCore({ voices: 1 });
    core.loadSample(1, dcPcm(96000, 0.5));
    core.loadSample(2, dcPcm(96000, 0));
    core.command("VOICE_START", voice({ voice: 1, sample: 1 }));
    core.render(4800);
    core.events();
    core.command("VOICE_START", voice({ voice: 2, sample: 2 }));
    const [left] = core.render(4800);
    let step = 0;
    for (let i = 1; i < left.length; i++)
      step = Math.max(step, Math.abs((left[i] ?? 0) - (left[i - 1] ?? 0)));
    expect(left[0]).toBeGreaterThan(0.3);
    expect(left[left.length - 1]).toBe(0);
    expect(step).toBeLessThan(0.05);
    expect(core.events().filter((e) => e.op === "VOICE_ENDED")).toMatchObject([{ voice: 1 }]);
  });

  test("meters arrive about 60 times a second", () => {
    const core = loadCore();
    core.loadSample(1, sinePcm(1000, 2));
    core.command("VOICE_START", voice({ bus: 2 }));
    core.render(48000);
    const meters = core.events().filter((e) => e.op === "METERS");
    expect(meters.length).toBeGreaterThanOrEqual(55);
    expect(meters.length).toBeLessThanOrEqual(61);
    const last = meters[meters.length - 1];
    if (last?.op !== "METERS") throw new Error("no meters");
    expect(last.peak[2]).toBeGreaterThan(0.3);
    expect(last.peak[0]).toBeLessThanOrEqual(CEILING);
    expect(last.loudness).toBeGreaterThan(-12);
    expect(last.loudness).toBeLessThan(-6);
  });

  test("64 voices render ten seconds at 20x realtime or better", () => {
    const core = loadCore({ voices: 64 });
    for (let k = 0; k < 8; k++) core.loadSample(k + 1, sinePcm(110 * (k + 1), 2, 48000, 0.3));
    core.command("BUS_DEFINE", { bus: 1, out: 0, gain: 0.5 });
    core.command("BUS_DEFINE", { bus: 2, out: 1, gain: 0.8 });
    for (let i = 0; i < 64; i++)
      core.command(
        "VOICE_START",
        voice({
          voice: i + 1,
          sample: (i % 8) + 1,
          gain: 0.1,
          pan: i / 32 - 1,
          rate: 0.5 + (i % 16) / 10,
          bus: i % 3,
          sendBus1: 2,
          send1: i % 4 === 0 ? 0.2 : 0,
          loopStart: 4000,
          loopEnd: 90000,
        }),
      );
    core.render(128);
    const t = performance.now();
    core.render(480000);
    const seconds = (performance.now() - t) / 1000;
    console.log(
      `64 voices, 10 s through the WASM in Bun: ${seconds.toFixed(3)} s, ${(10 / seconds).toFixed(0)}x realtime`,
    );
    expect(seconds).toBeLessThan(0.5);
    expect(core.events().filter((e) => e.op === "VOICE_ENDED")).toHaveLength(0);
  });
});
