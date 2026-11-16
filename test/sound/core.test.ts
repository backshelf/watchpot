// The committed WebAssembly build, driven as the worklet drives it: the ABI and the protocol end to end.
import { describe, expect, test } from "bun:test";
import { loadCore, peak, sinePcm } from "./harness";

describe("the core in Bun", () => {
  test("an uploaded sample is announced, plays and ends", () => {
    const core = loadCore();
    core.loadSample(1, sinePcm(440, 0.1));
    core.command("VOICE_START", {
      voice: 9,
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
    });
    const [left, right] = core.render(48000);
    expect(peak(left)).toBeGreaterThan(0.1);
    expect(peak(right)).toBeGreaterThan(0.1);
    expect(peak(left)).toBeLessThanOrEqual(1);
    expect(left.every(Number.isFinite)).toBe(true);
    const events = core.events();
    expect(events.find((e) => e.op === "SAMPLE_READY")).toMatchObject({ sample: 1 });
    expect(events.find((e) => e.op === "VOICE_ENDED")).toMatchObject({ voice: 9 });
  });

  test("a start for a sample the core does not hold is ignored", () => {
    const core = loadCore();
    core.command("VOICE_START", {
      voice: 1,
      sample: 77,
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
    });
    const [left] = core.render(4800);
    expect(peak(left)).toBe(0);
  });

  test("the clock can be set, and a start for a later frame is silent until it", () => {
    const core = loadCore();
    core.loadSample(1, sinePcm(440, 0.1));
    core.command("CLOCK_SET", { frame: 1_000_000 });
    core.render(128);
    core.command("VOICE_START", {
      atFrame: 1_000_128 + 2000,
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
    });
    const [left] = core.render(9600);
    expect(peak(left.subarray(0, 2000))).toBe(0);
    expect(peak(left.subarray(2000))).toBeGreaterThan(0.1);
  });

  test("a freed sample's memory is reused: loading and freeing over and over does not grow the core", () => {
    const core = loadCore();
    const pcm = sinePcm(220, 2);
    core.loadSample(1, pcm);
    core.render(128);
    const settled = core.memoryBytes();
    for (let i = 0; i < 50; i++) {
      core.command("SAMPLE_FREE", { sample: 1 });
      core.render(1024);
      core.loadSample(1, pcm);
      core.render(128);
    }
    expect(core.memoryBytes()).toBe(settled);
  });
});
