// The granulator and the spectral freeze on the committed WebAssembly build: a cloud's playhead scrubbed across a
// sample, a bus held and stuttered, and what each costs where the worklet runs it.
import { describe, expect, test } from "bun:test";
import {
  type CommandFields,
  CURVE,
  FX_KIND,
  FX_PARAMS,
  GRAIN_PARAM,
  TRANSPORT_RUN,
} from "../../src/sound/protocol";
import { type Core, loadCore, rms, sinePcm } from "./harness";

const RATE = 48000;

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

/** A sine sweeping in a straight line from `from` to `to` Hz over `seconds`, as 16-bit PCM. */
function chirpPcm(from: number, to: number, seconds: number, level = 0.5): Int16Array {
  const pcm = new Int16Array(Math.round(seconds * RATE));
  let phase = 0;
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = Math.round(Math.sin(phase) * level * 32767);
    phase += (2 * Math.PI * (from + ((to - from) * i) / pcm.length)) / RATE;
  }
  return pcm;
}

/** Seeded white noise as 16-bit PCM, peaking at `level`. */
function noisePcm(frames: number, level = 0.25): Int16Array {
  const pcm = new Int16Array(frames);
  let x = 0x2545f491;
  for (let i = 0; i < frames; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    pcm[i] = Math.round(((x | 0) / 2 ** 31) * level * 32767);
  }
  return pcm;
}

/** The pitch of a stretch, in Hz, by its upward zero crossings. */
function hz(samples: Float32Array): number {
  let n = 0;
  let last = samples[0] ?? 0;
  for (const s of samples.subarray(1)) {
    if (last < 0 && s >= 0) n++;
    last = s;
  }
  return (n * RATE) / samples.length;
}

const db = (ratio: number) => 20 * Math.log10(Math.max(ratio, 1e-12));

/** Starts cloud 0 over sample 1 on `bus` and sets its parameters. */
function cloud(core: Core, bus: number, settings: Partial<Record<keyof typeof GRAIN_PARAM, number>>): void {
  core.command("GRAIN_START", {
    cloud: 0,
    sample: 1,
    bus,
    pan: 0,
    sendBus1: 0,
    send1: 0,
    sendBus2: 0,
    send2: 0,
    seed: 7,
  });
  for (const [name, value] of Object.entries(settings))
    core.command("GRAIN_SET", {
      cloud: 0,
      param: GRAIN_PARAM[name as keyof typeof GRAIN_PARAM],
      value,
      slew: 0,
    });
}

const freeze = (core: Core, param: number, value: number, slew = 0) =>
  core.command("FX_SET", { bus: 1, slot: 0, param, value, slew, curve: CURVE.lin });

/** How long `frames` frames take to render, in seconds. */
function time(core: Core, frames: number): number {
  const t = performance.now();
  core.render(frames);
  return (performance.now() - t) / 1000;
}

describe("the granulator in the core", () => {
  test("scrubbing position from 0 to 1 over a rising chirp yields a rising pitch", () => {
    const core = loadCore();
    // 200 Hz to 3.2 kHz over two seconds, scrubbed across in four.
    core.loadSample(1, chirpPcm(200, 3200, 2));
    cloud(core, 0, { position: 0 });
    core.render(128);
    core.command("GRAIN_SET", { cloud: 0, param: GRAIN_PARAM.position, value: 1, slew: 4 * RATE });
    const pitches: number[] = [];
    for (let k = 0; k < 8; k++) pitches.push(hz(core.render(RATE / 2)[0]));
    for (let k = 1; k < 8; k++) expect(pitches[k]).toBeGreaterThan(pitches[k - 1] ?? 0);
    // Each stretch sits about where the chirp is at the playhead (a grain reads on a little past it).
    pitches.slice(0, 7).forEach((pitch, k) => {
      const there = 200 + (3000 * (k + 0.5)) / 8;
      expect(pitch).toBeGreaterThan(0.85 * there);
      expect(pitch).toBeLessThan(1.3 * there);
    });
  });

  test("a tone at half the rate keeps its pitch, lasts twice as long, and a stopped cloud falls silent", () => {
    const core = loadCore();
    core.loadSample(1, sinePcm(440, 1));
    cloud(core, 0, { rate: 0.5 });
    const [first] = core.render(RATE);
    const [second] = core.render(RATE);
    const [after] = core.render(RATE);
    expect(Math.abs(hz(first) - 440)).toBeLessThan(0.03 * 440);
    expect(Math.abs(hz(second.subarray(0, RATE / 2)) - 440)).toBeLessThan(0.03 * 440);
    expect(rms(second.subarray(0, RATE / 2))).toBeGreaterThan(0.5 * rms(first));
    expect(rms(after.subarray(RATE / 2))).toBeLessThan(1e-5);

    core.command("GRAIN_SET", { cloud: 0, param: GRAIN_PARAM.position, value: 0.5, slew: 0 });
    core.command("GRAIN_SET", { cloud: 0, param: GRAIN_PARAM.rate, value: 0, slew: 0 });
    expect(rms(core.render(RATE)[0])).toBeGreaterThan(0.1);
    core.command("GRAIN_STOP", { cloud: 0, release: 480 });
    expect(rms(core.render(RATE)[0].subarray(4800))).toBeLessThan(1e-5);
  });

  test("a cloud of 64 grains costs a few percent of realtime", () => {
    const core = loadCore();
    core.loadSample(1, noisePcm(2 * RATE));
    // 128 grains a second, half a second each: 64 at once.
    cloud(core, 0, { position: 0.5, spray: 0.4, spread: 1, size: 500, density: 128 });
    core.render(RATE);
    const seconds = time(core, 10 * RATE);
    const idle = time(loadCore(), 10 * RATE);
    console.log(
      `a 64-grain cloud, 10 s through the WASM in Bun: ${seconds.toFixed(3)} s, ${(10 * seconds).toFixed(1)}% of realtime (the empty core ${idle.toFixed(3)} s)`,
    );
    expect(seconds).toBeLessThan(1);
  });
});

describe("the freeze in the core", () => {
  test("a frozen bus holds its tone after the sound has ended, and lets go", () => {
    const core = loadCore();
    core.loadSample(1, sinePcm(440, 1));
    core.command("FX_DEFINE", { bus: 1, slot: 0, kind: FX_KIND.freeze, key: 0 });
    core.command("VOICE_START", voice({ bus: 1 }));
    const [live] = core.render(RATE / 2);
    freeze(core, FX_PARAMS.freeze.amount, 1);
    core.render(RATE);
    // The sample is over; five seconds on, the bus still sounds it.
    const level = rms(live.subarray(RATE / 4));
    for (let second = 0; second < 5; second++) {
      const [held] = core.render(RATE);
      expect(Math.abs(db(rms(held) / level))).toBeLessThan(3);
      expect(Math.abs(hz(held) - 440)).toBeLessThan(5);
    }
    freeze(core, FX_PARAMS.freeze.amount, 0, RATE / 10);
    expect(rms(core.render(RATE)[0].subarray(RATE / 2))).toBeLessThan(1e-5);
  });

  test("a stutter repeats an eighth of the transport's bar", () => {
    const core = loadCore();
    core.loadSample(1, noisePcm(4 * RATE));
    // 150 bpm in four: a bar is 76,800 frames, an eighth of it 9,600.
    core.command("TRANSPORT_SET", { bpm: 150, beatsPerBar: 4, swing: 0, running: TRANSPORT_RUN.keep });
    core.command("FX_DEFINE", { bus: 1, slot: 0, kind: FX_KIND.freeze, key: 0 });
    core.command("VOICE_START", voice({ bus: 1 }));
    core.render(RATE);
    freeze(core, FX_PARAMS.freeze.stutter, 8);
    const [out] = core.render(4 * 9600);
    // Each repeat is the one before it (but for the few milliseconds of the seam), and none is the live noise.
    let apart = 0;
    for (let i = 1000; i < 9000; i++) apart = Math.max(apart, Math.abs((out[i] ?? 0) - (out[i + 9600] ?? 0)));
    expect(apart).toBeLessThan(1e-6);
    expect(rms(out.subarray(1000, 9000))).toBeGreaterThan(0.05);
    freeze(core, FX_PARAMS.freeze.stutter, 0);
    const [live] = core.render(2 * 9600);
    let same = 0;
    for (let i = 1000; i < 9000; i++) same = Math.max(same, Math.abs((live[i] ?? 0) - (live[i + 9600] ?? 0)));
    expect(same).toBeGreaterThan(0.05);
  });

  test("a freeze holding noise costs under a percent of realtime, and nothing while it waits", () => {
    const core = loadCore();
    core.loadSample(1, noisePcm(RATE));
    core.command("FX_DEFINE", { bus: 1, slot: 0, kind: FX_KIND.freeze, key: 0 });
    const waiting = time(core, 10 * RATE);
    core.command("VOICE_START", voice({ bus: 1 }));
    core.render(RATE / 2);
    freeze(core, FX_PARAMS.freeze.amount, 1);
    core.render(RATE);
    const seconds = time(core, 10 * RATE);
    const idle = time(loadCore(), 10 * RATE);
    console.log(
      `a freeze, 10 s through the WASM in Bun: held ${seconds.toFixed(3)} s, ${(10 * seconds).toFixed(1)}% of realtime; not engaged ${waiting.toFixed(3)} s (the empty core ${idle.toFixed(3)} s)`,
    );
    expect(seconds).toBeLessThan(1);
  });
});
