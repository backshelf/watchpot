// The effect units on the committed WebAssembly build: an effect defined on the master and set through
// `FX_SET` moves the rendered spectrum the way it should.
import { describe, expect, test } from "bun:test";
import { type CommandFields, CURVE, FX_KIND, FX_PARAMS } from "../../src/sound/protocol";
import { type Core, loadCore, rms, sinePcm } from "./harness";

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

/** Seeded white noise as 16-bit PCM, peaking at a quarter of full scale. */
function noisePcm(frames: number): Int16Array {
  const pcm = new Int16Array(frames);
  let x = 0x2545f491;
  for (let i = 0; i < frames; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    pcm[i] = Math.round(((x | 0) / 2 ** 31) * 0.25 * 32767);
  }
  return pcm;
}

/** How bright a signal is: the RMS of its first difference over its RMS (0 for DC, 2 at Nyquist). */
function brightness(samples: Float32Array): number {
  const diff = new Float32Array(samples.length - 1);
  let last = samples[0] ?? 0;
  samples.subarray(1).forEach((s, i) => {
    diff[i] = s - last;
    last = s;
  });
  return rms(diff) / rms(samples);
}

/** Upward zero crossings. */
function crossings(samples: Float32Array): number {
  let n = 0;
  let last = samples[0] ?? 0;
  for (const s of samples.subarray(1)) {
    if (last < 0 && s >= 0) n++;
    last = s;
  }
  return n;
}

/** A core playing sample 1 on the master, with `effect` in the master's first slot set to `params`. */
function render(
  pcm: Int16Array,
  kind: number,
  params: Readonly<Record<number, number>>,
  frames: number,
): Float32Array {
  const core: Core = loadCore();
  core.loadSample(1, pcm);
  if (kind) core.command("FX_DEFINE", { bus: 0, slot: 0, kind, key: 0 });
  for (const [param, value] of Object.entries(params))
    core.command("FX_SET", { bus: 0, slot: 0, param: Number(param), value, slew: 0, curve: CURVE.lin });
  core.command("VOICE_START", voice({ gain: 0.5 }));
  return core.render(frames)[0].subarray(frames / 2);
}

describe("effects in the core", () => {
  test("a low-pass darkens noise and a high-pass brightens it", () => {
    const pcm = noisePcm(48000);
    const { cutoff, mode } = FX_PARAMS.svf;
    const plain = brightness(render(pcm, 0, {}, 24000));
    const low = brightness(render(pcm, FX_KIND.svf, { [cutoff]: 500, [mode]: 0 }, 24000));
    const high = brightness(render(pcm, FX_KIND.svf, { [cutoff]: 5000, [mode]: 1 }, 24000));
    expect(low).toBeLessThan(0.3 * plain);
    expect(high).toBeGreaterThan(1.1 * plain);
  });

  test("the tape at half speed plays a tone an octave down, and stopped it is silent", () => {
    const pcm = sinePcm(1000, 1);
    const { speed, wow, flutter, hiss } = FX_PARAMS.tape;
    const still = { [wow]: 0, [flutter]: 0, [hiss]: 0 };
    const normal = crossings(render(pcm, FX_KIND.tape, still, 24000));
    const half = crossings(render(pcm, FX_KIND.tape, { ...still, [speed]: 0.5 }, 24000));
    const stopped = render(pcm, FX_KIND.tape, { ...still, [speed]: 0 }, 24000);
    // A quarter of a second of 1 kHz.
    expect(normal).toBeGreaterThanOrEqual(248);
    expect(normal).toBeLessThanOrEqual(252);
    expect(half).toBeGreaterThanOrEqual(0.47 * normal);
    expect(half).toBeLessThanOrEqual(0.53 * normal);
    expect(rms(stopped)).toBeLessThan(1e-4);
  });
});

describe("FX_ON", () => {
  /** A core holding a 1 kHz tone on the master through a 100 Hz low-pass, which all but silences it. */
  function filtered(): Core {
    const core = loadCore();
    core.loadSample(1, sinePcm(1000, 1));
    core.command("FX_DEFINE", { bus: 0, slot: 0, kind: FX_KIND.svf, key: 0 });
    core.command("FX_SET", {
      bus: 0,
      slot: 0,
      param: FX_PARAMS.svf.cutoff,
      value: 100,
      slew: 0,
      curve: CURVE.lin,
    });
    core.command("VOICE_START", voice({ gain: 0.5 }));
    return core;
  }

  test("off passes the tone, back on filters it, and the switch never steps", () => {
    const core = filtered();
    const on = core.render(4800)[0];
    core.command("FX_ON", { bus: 0, slot: 0, value: 0, slew: 480 });
    const off = core.render(4800)[0];
    core.command("FX_ON", { bus: 0, slot: 0, value: 1, slew: 480 });
    const back = core.render(4800)[0];
    expect(rms(on.subarray(2400))).toBeLessThan(0.02);
    expect(rms(off.subarray(2400))).toBeGreaterThan(0.1);
    expect(rms(back.subarray(2400))).toBeLessThan(0.02);
    // The tone peaks at 0.177 (0.25 panned centre), so its own steepest step is about 0.023.
    const all = [...on.subarray(2400), ...off, ...back];
    let jump = 0;
    for (let i = 1; i < all.length; i++) jump = Math.max(jump, Math.abs((all[i] ?? 0) - (all[i - 1] ?? 0)));
    expect(jump).toBeLessThan(0.03);
  });

  test("FX_DEFINE brings a slot that was off back on", () => {
    const core = filtered();
    core.command("FX_ON", { bus: 0, slot: 0, value: 0, slew: 0 });
    expect(rms(core.render(4800)[0].subarray(2400))).toBeGreaterThan(0.1);
    core.command("FX_DEFINE", { bus: 0, slot: 0, kind: FX_KIND.svf, key: 0 });
    core.command("FX_SET", {
      bus: 0,
      slot: 0,
      param: FX_PARAMS.svf.cutoff,
      value: 100,
      slew: 0,
      curve: CURVE.lin,
    });
    expect(rms(core.render(4800)[0].subarray(2400))).toBeLessThan(0.02);
  });
});

describe("the reduction meter", () => {
  const reductions = (core: Core): number[][] =>
    core.events().flatMap((e) => (e.op === "METERS" ? [[...e.reduction]] : []));

  test("a pushed compressor reports on its own bus only; silence and an off compressor report none", () => {
    const core = loadCore();
    core.loadSample(1, sinePcm(200, 1, 48000, 0.9));
    core.command("BUS_DEFINE", { bus: 2, out: 0, gain: 1 });
    core.command("BUS_DEFINE", { bus: 3, out: 0, gain: 1 });
    core.command("FX_DEFINE", { bus: 2, slot: 0, kind: FX_KIND.comp, key: 0 });
    core.command("FX_DEFINE", { bus: 3, slot: 0, kind: FX_KIND.eq, key: 0 });
    core.render(4800);
    const quiet = reductions(core);
    expect(quiet.length).toBeGreaterThan(0);
    expect(quiet.every((r) => r.every((v) => v === 0))).toBe(true);

    core.command("VOICE_START", voice({ bus: 2 }));
    core.command("VOICE_START", voice({ bus: 3 }));
    core.render(9600);
    const loud = reductions(core).at(-1) ?? [];
    expect(loud[2]).toBeGreaterThan(6);
    expect(loud.every((v, bus) => bus === 2 || v === 0)).toBe(true);

    core.command("FX_ON", { bus: 2, slot: 0, value: 0, slew: 0 });
    core.render(4800);
    expect(reductions(core).at(-1)?.[2]).toBe(0);
  });
});
