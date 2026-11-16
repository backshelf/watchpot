import { afterAll, beforeAll, expect, test } from "bun:test";
import { createSound } from "watchpot/sound";

const realContext = globalThis.AudioContext;
const realFetch = globalThis.fetch;

/** The few AudioContext parts a clip touches, recording each source's rate. */
function fakeContext() {
  const rates: number[] = [];
  const ctx = {
    state: "running",
    currentTime: 0,
    destination: {},
    resume: async () => undefined,
    createGain: () => ({ gain: { value: 0 }, connect: () => undefined }),
    createBufferSource: () => {
      const source = {
        buffer: null as unknown,
        playbackRate: { value: 1 },
        connect: () => undefined,
        start: () => rates.push(source.playbackRate.value),
      };
      return source;
    },
    // A one-second clip at 8 samples a second, a ramp so the waveform view can be checked.
    decodeAudioData: async () => {
      const data = Float32Array.from({ length: 8 }, (_, i) => (i + 1) / 8);
      return { duration: 1, length: 8, sampleRate: 8, numberOfChannels: 1, getChannelData: () => data };
    },
  };
  return { ctx, rates };
}

beforeAll(() => {
  globalThis.AudioContext = class {
    state = "running";
    resume = async () => undefined;
  } as unknown as typeof AudioContext;
  globalThis.fetch = (async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(1),
  })) as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.AudioContext = realContext;
  globalThis.fetch = realFetch;
});

test("a clip plays at its playbackRate (1 by default, a bad rate at 1) and lasts as long as it sounds", async () => {
  const sound = createSound({
    cues: {
      plain: { voices: [], clips: [{ file: "hit", level: 0.2 }] },
      up: { voices: [], clips: [{ file: "hit", level: 0.2, playbackRate: 2 }] },
      bad: { voices: [], clips: [{ file: "hit", level: 0.2, playbackRate: Number.NaN }] },
    },
    samples: { hit: "/hit.ogg" },
  });
  const { ZZFX } = await import("zzfx");
  const { ctx, rates } = fakeContext();
  const own = ZZFX.audioContext;
  ZZFX.audioContext = ctx as unknown as AudioContext;
  try {
    await sound.unlock();
    await sound.loadSamples();
    sound.play("plain");
    sound.play("up");
    sound.play("bad");
    expect(rates).toEqual([1, 2, 1]);
    expect(sound.soundInfo("up")).toEqual({ source: "sample", seconds: 0.5 });
  } finally {
    ZZFX.audioContext = own;
  }
});
