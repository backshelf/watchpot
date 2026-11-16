// The 0.6 path: what plays where the core cannot start.
import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { createSound } from "watchpot/sound";
import { playFallback } from "../../src/sound/fallback";
import type { Zzfx } from "../../src/sound/gate";
import type { Decoded } from "../../src/sound/samples";

const real = globalThis.AudioContext;
beforeAll(() => {
  globalThis.AudioContext = class {
    state = "running";
    resume = async () => undefined;
  } as unknown as typeof AudioContext;
});
afterAll(() => {
  globalThis.AudioContext = real;
});

/** Just enough of zzfx to watch what the fallback asks of it. */
function fakeZzfx() {
  const started: { rate: number; gain: number; at: number }[] = [];
  const played: Float32Array[][] = [];
  const context = {
    state: "running",
    resume: async () => undefined,
    currentTime: 2,
    destination: {},
    createBufferSource() {
      const source = {
        buffer: null as unknown,
        playbackRate: { value: 1 },
        connect: (gain: { gain: { value: number } }) => {
          source.gain = gain;
        },
        gain: null as { gain: { value: number } } | null,
        start: (at: number) =>
          started.push({ rate: source.playbackRate.value, gain: source.gain?.gain.value ?? 0, at }),
      };
      return source;
    },
    createGain: () => ({ gain: { value: 0 }, connect: () => undefined }),
  };
  const zzfx = {
    ZZFX: {
      volume: 0.5,
      sampleRate: 100,
      audioContext: context,
      buildSamples: () => new Float32Array(10).fill(0.25),
      playSamples: (channels: Float32Array[]) => played.push(channels),
    },
  } as unknown as Zzfx;
  return { zzfx, started, played };
}

const clip: Decoded = {
  buffer: {
    duration: 0.1,
    length: 10,
    sampleRate: 100,
    getChannelData: () => new Float32Array(10).fill(0.5),
  },
  peak: 0.5,
  rms: 0.5,
} as unknown as Decoded;

test("decoded clips play as buffer sources at their rate, gain and offset", () => {
  const { zzfx, started, played } = fakeZzfx();
  const ready = [
    { layer: { file: "a", level: 0.2 }, clip },
    { layer: { file: "a", level: 0.1, at: 0.5, playbackRate: 2 }, clip },
  ];
  playFallback(zzfx, [], ready);
  expect(played).toHaveLength(0);
  expect(started.map((s) => s.rate)).toEqual([1, 2]);
  expect(started.map((s) => s.at)).toEqual([2, 2.5]);
  // The layer's level over the clip's RMS, times the master volume.
  expect(started[0]?.gain).toBeCloseTo(0.4 * 0.5, 6);
});

test("a cue without decoded clips mixes its zzfx voices into one buffer", () => {
  const { zzfx, played } = fakeZzfx();
  playFallback(zzfx, [{ voice: {} }, { voice: {}, at: 0.05 }], null);
  expect(played).toHaveLength(1);
  expect(played[0]?.[0]).toHaveLength(15);
});

test("where the core cannot run the sound falls back quietly and plays the 0.6 way", async () => {
  const warn = spyOn(console, "warn").mockImplementation(() => undefined);
  const { ZZFX } = await import("zzfx");
  const own = ZZFX.audioContext;
  const { zzfx, played } = fakeZzfx();
  ZZFX.audioContext = zzfx.ZZFX.audioContext;
  const playSamples = spyOn(ZZFX, "playSamples").mockImplementation((channels) => {
    played.push(channels);
    return {} as AudioBufferSourceNode;
  });
  try {
    const sound = createSound({ cues: { tick: { voices: [{ voice: { frequency: 880 } }] } } });
    await sound.unlock();
    expect(sound.mode()).toBe("fallback");
    expect(sound.play("tick")).toBeNull();
    expect(played).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  } finally {
    ZZFX.audioContext = own;
    playSamples.mockRestore();
    warn.mockRestore();
  }
});
