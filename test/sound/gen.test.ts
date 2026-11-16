// The modelled sources on the committed WebAssembly build: a motor's pitch follows `GEN_SET`, a struck bank rings
// and fades, and a babble voice answers each syllable with a `STEP` on its frame.
import { describe, expect, test } from "bun:test";
import { GEN_KIND, GEN_PARAMS, type SoundEvent, STEP_SOURCE } from "../../src/sound/protocol";
import { loadCore, rms } from "./harness";

/** The magnitude of `x` at `hz` under a Hann window. */
function magnitude(x: Float32Array, hz: number, rate: number): number {
  let re = 0;
  let im = 0;
  const w = (2 * Math.PI * hz) / rate;
  for (let i = 0; i < x.length; i++) {
    const s = (x[i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (x.length - 1)));
    re += s * Math.cos(w * i);
    im -= s * Math.sin(w * i);
  }
  return Math.hypot(re, im);
}

function start(kind: keyof typeof GEN_KIND) {
  const core = loadCore();
  core.command("GEN_START", {
    slot: 0,
    kind: GEN_KIND[kind],
    bus: 0,
    gain: 0.5,
    pan: 0,
    sendBus1: 0,
    send1: 0,
    sendBus2: 0,
    send2: 0,
    seed: 1,
  });
  return core;
}

describe("generators on the core", () => {
  test("GEN_SET moves the motor's pitch", () => {
    const core = start("motor");
    core.command("GEN_SET", { slot: 0, param: GEN_PARAMS.motor.rate, value: 220, slew: 0 });
    core.render(4800);
    const [low] = core.render(8192);
    core.command("GEN_SET", { slot: 0, param: GEN_PARAMS.motor.rate, value: 330, slew: 480 });
    core.render(4800);
    const [high] = core.render(8192);
    const rate = core.sampleRate;
    // At 220 the motor sounds 220 and not 330; at 330 the other way about (neither is a harmonic of the other).
    expect(magnitude(low, 220, rate)).toBeGreaterThan(30 * magnitude(low, 330, rate));
    expect(magnitude(high, 330, rate)).toBeGreaterThan(30 * magnitude(high, 220, rate));
  });

  test("a struck bank rings and fades, and strikes again", () => {
    const core = start("modal");
    const [quiet] = core.render(2400);
    expect(rms(quiet)).toBe(0);
    core.command("GEN_SET", { slot: 0, param: GEN_PARAMS.modal.mode, value: 600, slew: 0 });
    core.command("GEN_SET", { slot: 0, param: GEN_PARAMS.modal.mode + 1, value: 0.2, slew: 0 });
    core.command("GEN_SET", { slot: 0, param: GEN_PARAMS.modal.mode + 2, value: 1, slew: 0 });
    core.command("GEN_SET", { slot: 0, param: GEN_PARAMS.modal.strike, value: 1, slew: 0 });
    const [ring] = core.render(24000);
    expect(rms(ring.subarray(0, 2400))).toBeGreaterThan(0.01);
    expect(rms(ring.subarray(19200))).toBeLessThan(1e-4);
    core.command("GEN_SET", { slot: 0, param: GEN_PARAMS.modal.strike, value: -1, slew: 0 });
    const [again] = core.render(2400);
    expect(rms(again)).toBeGreaterThan(0.005);
  });

  test("a babble voice steps through its syllables on their frames", () => {
    const core = loadCore();
    core.command("BABBLE_DEFINE", { babble: 0, sample: 0, bus: 0, gain: 0.5, pan: 0, sendBus1: 0, send1: 0 });
    for (const [index, atFrame] of [2400, 7200].entries()) {
      core.command("BABBLE_SAY", {
        atFrame,
        babble: 0,
        line: 1,
        index,
        length: 3600,
        pitch: 1,
        formant1: 700,
        formant2: 1200,
        noise: 0.2,
        level: 0.8,
      });
    }
    const [left] = core.render(12000);
    const steps = core.events().filter((e): e is Extract<SoundEvent, { op: "STEP" }> => e.op === "STEP");
    expect(steps.map((s) => [s.frame, s.source, s.track, s.index])).toEqual([
      [2400, STEP_SOURCE.babble, 0, 0],
      [7200, STEP_SOURCE.babble, 0, 1],
    ]);
    expect(rms(left.subarray(0, 2400))).toBe(0);
    expect(rms(left.subarray(2400, 6000))).toBeGreaterThan(0.01);
  });
});
