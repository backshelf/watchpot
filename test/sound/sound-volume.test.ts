import { afterAll, beforeAll, expect, test } from "bun:test";
import { createSound } from "watchpot/sound";

const real = globalThis.AudioContext;
beforeAll(() => {
  // zzfx opens a context when it loads; a running one is all the engine asks of it.
  globalThis.AudioContext = class {
    state = "running";
    resume = async () => undefined;
  } as unknown as typeof AudioContext;
});
afterAll(() => {
  globalThis.AudioContext = real;
});

test("setVolume holds before the unlock and moves the master after it", async () => {
  const sound = createSound({ cues: {}, samples: {}, volume: 0.3 });
  sound.setVolume(0.2);
  await sound.unlock();
  const { ZZFX } = await import("zzfx");
  expect(ZZFX.volume).toBe(0.2);
  sound.setVolume(0.05);
  expect(ZZFX.volume).toBe(0.05);
});
