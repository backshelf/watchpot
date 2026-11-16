import { describe, expect, spyOn, test } from "bun:test";
import { createHarmony } from "../../src/sound/music/harmony";
import { createSequence, parsePattern } from "../../src/sound/music/sequence";
import { createTransport } from "../../src/sound/music/transport";
import type { CueVoice, SoundHost } from "../../src/sound/port";
import { GRID, LIMITS, STEP_SOURCE } from "../../src/sound/protocol";
import { fakePort } from "./fake-port";

function stage({ ready = true }: { ready?: boolean } = {}) {
  const fake = fakePort();
  fake.bringUp();
  const transport = createTransport(fake.port);
  const harmony = createHarmony(transport, fake.port);
  const voices = new Map<string, CueVoice>(
    ready
      ? [
          ["snap", { sample: 5, gain: 0.5, rate: 1.25, bus: 2, sends: [{ bus: 4, level: 0.25 }] }],
          ["kick", { sample: 6, gain: 1, rate: 1, bus: 2, sends: [] }],
        ]
      : [],
  );
  const host: SoundHost = {
    port: fake.port,
    bus: () => 1,
    held: () => null,
    manifest: () => null,
    loadPack: async () => undefined,
    play: () => null,
    voice: (key) => voices.get(key) ?? null,
    place: () => ({ pan: 0, distance: 0, occlusion: 0 }),
    gen: () => ({ set() {}, stop() {} }),
    transport,
    harmony,
  };
  return { fake, host, voices, harmony };
}

describe("sequence", () => {
  test("a pattern string becomes the velocities sent, on the cue's voice and the grid", () => {
    const { fake, host } = stage();
    createSequence({ cue: "snap", steps: "1000 1010|0010 0001", level: -6 }, host);
    const define = fake.of("SEQ_DEFINE").at(-1);
    expect(define).toMatchObject({ track: 0, sample: 5, bus: 2, grid: GRID.n16, sendBus1: 4, sendBus2: 0 });
    expect(define?.gain).toBeCloseTo(0.5 * 10 ** (-6 / 20), 5);
    expect(define?.send1).toBeCloseTo(0.25, 6);
    const steps = fake.of("SEQ_STEPS").at(-1);
    expect(steps?.count).toBe(16);
    expect(steps?.now).toBe(0);
    expect(steps?.velocity.slice(0, 17)).toEqual([1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
    // The cue's own rate rides on every step.
    expect(steps?.rate.slice(0, 16).every((r) => Math.abs(r - 1.25) < 1e-6)).toBe(true);
  });

  test("onStep hears its own track only", () => {
    const { fake, host } = stage();
    const one = createSequence({ cue: "snap", steps: "1111" }, host);
    createSequence({ cue: "kick", steps: "1000" }, host);
    expect(fake.of("SEQ_DEFINE").map((d) => d.track)).toEqual([0, 1]);
    const heard: number[] = [];
    const off = one.onStep((index) => heard.push(index));
    fake.emit({ op: "STEP", frame: 0, source: STEP_SOURCE.seq, track: 0, index: 2 });
    fake.emit({ op: "STEP", frame: 0, source: STEP_SOURCE.seq, track: 1, index: 3 });
    fake.emit({ op: "STEP", frame: 0, source: STEP_SOURCE.babble, track: 0, index: 4 });
    off();
    fake.emit({ op: "STEP", frame: 0, source: STEP_SOURCE.seq, track: 0, index: 5 });
    expect(heard).toEqual([2]);
  });

  test("steps replaces the pattern from the next bar; an array is velocities", () => {
    const { fake, host } = stage();
    const seq = createSequence({ cue: "snap", steps: "10" }, host);
    fake.clear();
    seq.steps([1, 0.5, 2, -1, Number.NaN]);
    expect(fake.of("SEQ_DEFINE")).toHaveLength(0);
    const steps = fake.of("SEQ_STEPS").at(-1);
    expect(steps).toMatchObject({ count: 5, now: 0 });
    expect(steps?.velocity.slice(0, 5)).toEqual([1, 0.5, 1, 0, 0]);
  });

  test("a cue that cannot sound yet is asked again when a sample comes ready", () => {
    const { fake, host, voices } = stage({ ready: false });
    createSequence({ cue: "snap", steps: "1" }, host);
    expect(fake.sent()).toHaveLength(0);
    voices.set("snap", { sample: 9, gain: 1, rate: 1, bus: 2, sends: [] });
    fake.emit({ op: "SAMPLE_READY", frame: 0, sample: 9 });
    expect(fake.of("SEQ_DEFINE").at(-1)?.sample).toBe(9);
    expect(fake.of("SEQ_STEPS")).toHaveLength(1);
    // Its pack's take arriving later moves the track onto it.
    voices.set("snap", { sample: 12, gain: 1, rate: 1, bus: 2, sends: [] });
    fake.emit({ op: "SAMPLE_READY", frame: 0, sample: 12 });
    expect(fake.of("SEQ_DEFINE").at(-1)?.sample).toBe(12);
    // A sample that changes nothing sends nothing.
    fake.clear();
    fake.emit({ op: "SAMPLE_READY", frame: 0, sample: 13 });
    expect(fake.sent()).toHaveLength(0);
  });

  test("what is asked before the core is up is sent when it comes up", () => {
    const { host } = stage();
    const fake = fakePort();
    createSequence({ cue: "snap", steps: "11" }, { ...host, port: fake.port });
    expect(fake.sent()).toHaveLength(0);
    fake.bringUp();
    expect(fake.sent().map((c) => c.op)).toEqual(["SEQ_DEFINE", "SEQ_STEPS"]);
  });

  test("degrees put each step on the harmony clock, and a change of harmony sends them again", () => {
    const { fake, host, harmony } = stage();
    createSequence({ cue: "kick", steps: "1111", degrees: [0, 2, 4] }, host);
    const rates = () => fake.of("SEQ_STEPS").at(-1)?.rate.slice(0, 4) ?? [];
    expect(rates().map((r) => Math.round(12 * Math.log2(r)))).toEqual([0, 4, 7, 0]);
    harmony.api.set({ key: "Am" });
    expect(rates().map((r) => Math.round(12 * Math.log2(r)))).toEqual([0, 3, 7, 0]);
  });

  test("set redefines the track; stop removes it and frees it", () => {
    const { fake, host } = stage();
    const seq = createSequence({ cue: "snap", steps: "1" }, host);
    seq.set({ cue: "kick", grid: "8" });
    expect(fake.of("SEQ_DEFINE").at(-1)).toMatchObject({ sample: 6, grid: GRID.n8 });
    seq.stop();
    expect(fake.of("SEQ_DEFINE").at(-1)).toMatchObject({ track: 0, sample: 0 });
    fake.clear();
    seq.steps("11");
    expect(fake.sent()).toHaveLength(0);
    createSequence({ cue: "snap", steps: "1" }, host);
    expect(fake.of("SEQ_DEFINE").at(-1)?.track).toBe(0);
  });

  test("past the core's tracks a sequence warns and does nothing", () => {
    const { fake, host } = stage();
    for (let i = 0; i < LIMITS.SEQ_TRACKS; i++) createSequence({ cue: "snap", steps: "1" }, host);
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    fake.clear();
    const spare = createSequence({ cue: "snap", steps: "1" }, host);
    spare.steps("1");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(fake.sent()).toHaveLength(0);
    warn.mockRestore();
  });

  test("a pattern string is 0 and 1, at most 64 steps", () => {
    expect(parsePattern("1".repeat(80))).toHaveLength(64);
    expect(() => parsePattern("10x1")).toThrow(/x/);
  });
});
