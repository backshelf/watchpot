// `createSound` on the core: the committed WebAssembly (through the harness) stands in for the worklet, and every
// record the shell posts is decoded and kept, so a test reads what a play sent.
import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import type { CoreBoot } from "../../src/sound/engine";
import { createSoundWith } from "../../src/sound/engine";
import type { Admission, Governor, RollState } from "../../src/sound/governor";
import { decodeCommands, type SoundCommand, type SoundEvent } from "../../src/sound/protocol";
import type { Cue, PackManifest } from "../../src/sound/types";
import { soundSeconds } from "../../src/sound/voice";
import { loadCore, peak } from "./harness";

const RATE = 48000;
const realContext = globalThis.AudioContext;
const realFetch = globalThis.fetch;

/** A clip of 0.1 s held at 0.5: its peak and RMS are both 0.5, so a layer's `level` is its voice's gain. */
function flatBuffer(channels = 1) {
  const data = new Float32Array(RATE / 10).fill(0.5);
  return {
    duration: 0.1,
    length: data.length,
    sampleRate: RATE,
    numberOfChannels: channels,
    getChannelData: () => data,
  };
}

const ctx = {
  state: "running" as AudioContextState,
  currentTime: 1,
  sampleRate: RATE,
  destination: {},
  resume: async () => undefined,
  decodeAudioData: async () => flatBuffer(),
};

let failing = new Set<string>();

beforeAll(async () => {
  // zzfx opens a context when it loads; the engine then plays through the one put in its place below.
  globalThis.AudioContext = class {
    state = "running";
    resume = async () => undefined;
  } as unknown as typeof AudioContext;
  globalThis.fetch = (async (url: string) =>
    failing.has(url)
      ? { ok: false, status: 404 }
      : { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }) as unknown as typeof fetch;
  const { ZZFX } = await import("zzfx");
  ZZFX.audioContext = ctx as unknown as AudioContext;
});
afterEach(() => {
  ctx.state = "running";
  failing = new Set();
});
afterAll(() => {
  globalThis.AudioContext = realContext;
  globalThis.fetch = realFetch;
});

/** The harness as the worklet: every record kept, events handed back on each `pump`. */
function fakeWorklet() {
  const core = loadCore({ sampleRate: RATE });
  const sent: SoundCommand[] = [];
  let hear: (events: SoundEvent[]) => void = () => undefined;
  let fail: (fatal: boolean, reason: string) => void = () => undefined;
  let audio = 0;
  const boot: CoreBoot = {
    supported: () => true,
    boot: async () => ({
      send(records) {
        sent.push(...decodeCommands(records));
        core.send(records);
      },
      upload(pcm, record) {
        const load = decodeCommands(record)[0];
        if (load?.op !== "SAMPLE_LOAD") throw new Error("not a SAMPLE_LOAD");
        sent.push(load);
        core.loadSample(load.sample, pcm, { channels: load.channels as 1 | 2, rate: load.rate });
      },
      onEvent: (listener) => {
        hear = listener;
      },
      onError: (listener) => {
        fail = listener;
      },
      dispose: () => undefined,
    }),
  };
  return {
    boot,
    sent,
    /** Renders a few blocks and hands the events to the shell; returns the loudest sample heard. */
    pump(frames = 512) {
      const [left] = core.render(frames);
      audio = Math.max(audio, peak(left));
      hear(core.events());
      return peak(left);
    },
    fail: (fatal: boolean, reason: string) => fail(fatal, reason),
    starts: () => sent.filter((c) => c.op === "VOICE_START"),
    of: <O extends SoundCommand["op"]>(op: O) =>
      sent.filter((c): c is Extract<SoundCommand, { op: O }> => c.op === op),
  };
}

/** Lets fetches and decodes land, pumping the core between, so uploads are answered. */
async function settle(worklet: ReturnType<typeof fakeWorklet>) {
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 0));
    worklet.pump();
  }
}

const TONE = { voice: { frequency: 440, sustain: 0.05, release: 0.05 } };

const CUES = {
  hit: {
    voices: [TONE],
    clips: [
      { file: "thud", level: 0.2 },
      { file: "thud", level: 0.1, at: 0.05, playbackRate: 2 },
    ],
  },
  beep: { voices: [TONE, { ...TONE, at: 0.1 }], bus: "ui" },
  lost: { voices: [TONE], clips: [{ file: "gone", level: 0.2 }] },
  kick: { voices: [TONE], takes: [{ sample: "drums/kick", level: -6 }] },
} as const satisfies Record<string, Cue>;

function make(worklet = fakeWorklet(), packs: Record<string, PackManifest> = {}) {
  const sound = createSoundWith(
    { cues: CUES, samples: { thud: "/thud.ogg", gone: "/gone.ogg" }, packs, volume: 0.25 },
    worklet.boot,
  );
  return { sound, worklet };
}

describe("createSound on the core", () => {
  test("boots on unlock: mode is core, the buses are defined and the master takes the volume", async () => {
    const { sound, worklet } = make();
    expect(sound.mode()).toBe("locked");
    expect(sound.play("beep")).toBeNull();
    await sound.unlock();
    expect(sound.mode()).toBe("core");
    expect(worklet.of("BUS_DEFINE").map((c) => c.bus)).toEqual([1, 2, 3, 4, 5]);
    expect(worklet.of("MASTER_SET")[0]).toMatchObject({ param: 0, value: 0.25 });
  });

  test("a clip cue starts one voice per layer at its rate and gain, spaced to the frame", async () => {
    const { sound, worklet } = make();
    await sound.unlock();
    failing.add("/gone.ogg");
    await sound.loadSamples();
    await settle(worklet);
    expect(sound.soundInfo("hit")).toEqual({ source: "sample", seconds: 0.1 });
    expect(sound.play("hit")).not.toBeNull();
    const starts = worklet.starts();
    expect(starts).toHaveLength(2);
    const [a, b] = starts;
    expect(a?.rate).toBe(1);
    expect(b?.rate).toBe(2);
    expect(a?.gain).toBeCloseTo(0.2, 3);
    expect(b?.gain).toBeCloseTo(0.1, 3);
    expect(a?.bus).toBe(1);
    expect((b?.atFrame ?? 0) - (a?.atFrame ?? 0)).toBe(2400);
    const clip = worklet.of("SAMPLE_LOAD").find((c) => c.sample === a?.sample);
    expect(clip?.rate).toBe(RATE);
    // Stamped ahead of the context's frame, so the first layer is not already past.
    expect(a?.atFrame).toBeGreaterThan(ctx.currentTime * RATE);
  });

  test("an undecoded cue plays its rendered voices, at most zzfx's randomness off pitch", async () => {
    const { sound, worklet } = make();
    await sound.unlock();
    failing.add("/gone.ogg");
    await sound.loadSamples();
    expect(sound.soundInfo("lost")).toEqual({ source: "zzfx", seconds: soundSeconds(CUES.lost.voices) });
    const { ZZFX } = await import("zzfx");
    sound.play("lost");
    const [start] = worklet.starts();
    const load = worklet.of("SAMPLE_LOAD").find((c) => c.sample === start?.sample);
    expect(load?.rate).toBe(ZZFX.sampleRate);
    expect(start?.atFrame).toBe(0);
    expect(Math.abs((start?.rate ?? 0) - 1)).toBeLessThanOrEqual(0.05);
    expect(worklet.pump(4096)).toBeGreaterThan(0.01);
  });

  test("a cue's bus is its place in the default list, from 1", async () => {
    const { sound, worklet } = make();
    await sound.unlock();
    sound.play("beep");
    expect(worklet.starts()[0]?.bus).toBe(2);
  });

  test("muted or suspended sends no records", async () => {
    const { sound, worklet } = make();
    await sound.unlock();
    const before = worklet.sent.length;
    sound.setMuted(true);
    expect(worklet.of("MASTER_SET").at(-1)).toMatchObject({ param: 1, value: 1 });
    expect(sound.play("beep")).toBeNull();
    sound.setMuted(false);
    ctx.state = "suspended";
    expect(sound.play("beep")).toBeNull();
    expect(worklet.sent.slice(before).filter((c) => c.op === "VOICE_START")).toEqual([]);
  });

  test("a voice handle stops and sets its voices until the core says they ended", async () => {
    const { sound, worklet } = make();
    await sound.unlock();
    const voice = sound.play("beep");
    voice?.set("gain", 0.5, 10);
    expect(worklet.of("VOICE_SET")[0]).toMatchObject({ param: 0, value: 0.5, slew: 480 });
    voice?.stop(20);
    expect(worklet.of("VOICE_STOP")[0]).toMatchObject({ voice: worklet.starts()[0]?.voice, release: 960 });
    // One left to finish on its own: once the core says it ended, its handle sends nothing.
    const ended = sound.play("beep");
    worklet.pump(RATE);
    ended?.stop();
    ended?.set("rate", 2);
    expect(worklet.of("VOICE_STOP")).toHaveLength(1);
    expect(worklet.of("VOICE_SET")).toHaveLength(1);
  });

  test("setVolume moves the master", async () => {
    const { sound, worklet } = make();
    await sound.unlock();
    sound.setVolume(0.1);
    expect(worklet.of("MASTER_SET").at(-1)?.param).toBe(0);
    expect(worklet.of("MASTER_SET").at(-1)?.value).toBeCloseTo(0.1, 6);
  });

  test("a pack loads, plays its takes and frees its samples", async () => {
    const pack: PackManifest = {
      name: "drums",
      samples: { kick: { url: "/kick.ogg", seconds: 0.1, channels: 1, lufs: -14, peak: 0.5, kind: "shot" } },
    };
    const { sound, worklet } = make(fakeWorklet(), { drums: pack });
    await sound.unlock();
    expect(sound.packReady("drums")).toBe(false);
    const loading = sound.loadPack("drums");
    await settle(worklet);
    await loading;
    expect(sound.packReady("drums")).toBe(true);
    expect(sound.soundInfo("kick")).toEqual({ source: "sample", seconds: 0.1 });
    sound.play("kick");
    const start = worklet.starts().at(-1);
    expect(start?.gain).toBeCloseTo(0.5 * 10 ** (-6 / 20), 3);
    sound.unloadPack("drums");
    expect(worklet.of("SAMPLE_FREE").map((c) => c.sample)).toEqual([start?.sample ?? -1]);
    expect(sound.packReady("drums")).toBe(false);
  });

  test("a boot that fails falls back with one warning and plays the 0.6 way", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const sound = createSoundWith(
        { cues: CUES },
        {
          supported: () => true,
          boot: async () => {
            throw new Error("no module");
          },
        },
      );
      await sound.unlock();
      await sound.unlock();
      expect(sound.mode()).toBe("fallback");
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  test("a core that stops after the boot falls back with one warning", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const { sound, worklet } = make();
      await sound.unlock();
      worklet.fail(true, "the core's processor stopped");
      worklet.fail(true, "the core's processor stopped");
      expect(sound.mode()).toBe("fallback");
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  test("with no AudioContext, unlock resolves and nothing plays", async () => {
    const { sound } = make();
    const own = globalThis.AudioContext;
    // @ts-expect-error: a page with no Web Audio
    delete globalThis.AudioContext;
    try {
      await sound.unlock();
      expect(sound.mode()).toBe("locked");
      expect(sound.play("beep")).toBeNull();
    } finally {
      globalThis.AudioContext = own;
    }
  });
});

describe("the wave 2 wiring", () => {
  const WIRED = {
    drop: { voices: [TONE], placed: true, bus: "ambience", sends: { music: 0.5, voice: 0.25, ui: 1 } },
    tick: { voices: [TONE] },
    purr: { voices: [TONE] },
    rattle: { voices: [TONE], roll: { above: 10, cue: "purr" } },
  } as const satisfies Record<string, Cue>;

  /** A governor that does what the test says: each play's admission, and the rolls it reports. */
  function scripted() {
    const state = { next: { action: "play", db: 0, vary: 1 } as Admission, rolls: [] as RollState[] };
    const governor: Governor = { admit: () => state.next, rolls: () => state.rolls };
    return { state, governor };
  }

  async function wired(governor?: Governor) {
    const worklet = fakeWorklet();
    const sound = createSoundWith({ cues: WIRED, volume: 0.25 }, worklet.boot, { governor });
    await sound.unlock();
    await settle(worklet);
    return { sound, worklet };
  }

  test("a placed cue played at a point sends its place after its start, on the same frame", async () => {
    const { sound, worklet } = await wired();
    expect(sound.play("drop", { at: { x: 10, y: 10 } })).not.toBeNull();
    const ops = worklet.sent.map((c) => c.op);
    const start = worklet.starts().at(-1);
    const place = worklet.of("VOICE_PLACE").at(-1);
    expect(place).toBeDefined();
    expect(ops.lastIndexOf("VOICE_PLACE")).toBeGreaterThan(ops.lastIndexOf("VOICE_START"));
    expect(place?.voice).toBe(start?.voice);
    expect(place?.atFrame).toBe(start?.atFrame);
    for (const n of [place?.pan, place?.distance, place?.occlusion]) expect(Number.isFinite(n)).toBe(true);
  });

  test("a play with no place, and a play at a point of a cue that is not placed, send none", async () => {
    const { sound, worklet } = await wired();
    sound.play("drop");
    sound.play("tick", { at: { x: 10, y: 10 } });
    expect(worklet.starts()).toHaveLength(2);
    expect(worklet.of("VOICE_PLACE")).toHaveLength(0);
  });

  test("a cue's bus and its first two sends ride on its start, by bus index", async () => {
    const { sound, worklet } = await wired();
    sound.play("drop");
    expect(worklet.starts().at(-1)).toMatchObject({
      bus: 4,
      sendBus1: 3,
      send1: 0.5,
      sendBus2: 5,
      send2: 0.25,
    });
    sound.play("tick");
    expect(worklet.starts().at(-1)).toMatchObject({ bus: 1, sendBus1: 0, send1: 0, sendBus2: 0, send2: 0 });
  });

  test("the governor decides: a skipped play starts nothing, an admitted one takes its level", async () => {
    const { state, governor } = scripted();
    const { sound, worklet } = await wired(governor);
    sound.play("tick");
    const plain = worklet.starts().at(-1)?.gain ?? 0;
    state.next = { action: "skip" };
    expect(sound.play("tick")).toBeNull();
    expect(worklet.starts()).toHaveLength(1);
    state.next = { action: "play", db: -6, vary: 1 };
    sound.play("tick");
    expect((worklet.starts().at(-1)?.gain ?? 0) / plain).toBeCloseTo(10 ** (-6 / 20), 3);
  });

  test("a roll is one looped voice of the roll's cue, retuned while it runs and released when it ends", async () => {
    const { state, governor } = scripted();
    const { sound, worklet } = await wired(governor);
    state.next = { action: "roll" };
    expect(sound.play("rattle")).toBeNull();
    expect(sound.play("rattle")).toBeNull();
    const starts = worklet.starts();
    expect(starts).toHaveLength(1);
    const roll = starts[0];
    expect(roll?.loopEnd).toBeGreaterThan(roll?.loopStart ?? 0);
    expect(roll?.loopStart).toBeGreaterThan(0);
    // The roll's cue is `purr`: its sample, not the cue's own.
    sound.play("purr");
    state.next = { action: "play", db: 0, vary: 1 };
    sound.play("purr");
    expect(roll?.sample).toBe(worklet.starts().at(-1)?.sample);

    state.rolls = [{ key: "rattle", db: -6, rate: 2, ended: false }];
    await new Promise((r) => setTimeout(r, 120));
    const sets = worklet.of("VOICE_SET").filter((c) => c.voice === roll?.voice);
    expect(
      sets.some((c) => c.param === 0 && Math.abs(c.value / (roll?.gain ?? 1) - 10 ** (-6 / 20)) < 1e-3),
    ).toBe(true);
    expect(sets.some((c) => c.param === 2 && Math.abs(c.value / (roll?.rate ?? 1) - 2) < 1e-3)).toBe(true);
    expect(worklet.of("VOICE_STOP")).toHaveLength(0);

    state.rolls = [{ key: "rattle", db: 0, rate: 1, ended: true }];
    await new Promise((r) => setTimeout(r, 120));
    expect(worklet.of("VOICE_STOP").some((c) => c.voice === roll?.voice)).toBe(true);
    // The cue rolls again from a fresh voice.
    state.rolls = [];
    state.next = { action: "roll" };
    sound.play("rattle");
    expect(worklet.starts().at(-1)?.loopEnd).toBeGreaterThan(0);
    expect(worklet.starts().at(-1)?.voice).not.toBe(roll?.voice);
    state.rolls = [{ key: "rattle", db: 0, rate: 1, ended: true }];
    await new Promise((r) => setTimeout(r, 120));
  });

  test("a roll sounds where the play that began it would have: on its bus, with its hand", async () => {
    const { state, governor } = scripted();
    const { sound, worklet } = await wired(governor);
    sound.play("purr");
    const plain = worklet.starts().at(-1);
    state.next = { action: "roll" };
    sound.play("rattle", { bus: "music", mine: false });
    const roll = worklet.starts().at(-1);
    expect(roll?.loopEnd).toBeGreaterThan(0);
    expect(roll?.bus).toBe(3);
    // The machine's hand: 6 dB under the same cue played plainly.
    expect((roll?.gain ?? 0) / (plain?.gain ?? 1)).toBeCloseTo(10 ** (-6 / 20), 3);
    state.rolls = [{ key: "rattle", db: 0, rate: 1, ended: true }];
    await new Promise((r) => setTimeout(r, 120));
  });

  test("the mixer, the mod matrix and the space take calls before unlock", () => {
    const sound = createSoundWith({ cues: WIRED }, fakeWorklet().boot);
    sound.mixer.bus("music").fx(0).set("cutoff", 800, 50);
    sound.mixer.bus("master").level(-3);
    sound.mixer.setBusVolume("music", 0.5);
    expect(sound.mixer.busVolume("music")).toBe(0.5);
    sound.mixer.scene("anything");
    sound.mixer.scene.push("anything")();
    sound.mod.source("heat").set(0.5);
    sound.mod.route({ from: "heat", to: { bus: "music", level: true }, range: [-12, 0] })();
    sound.space.listener({ mode: "headphones" });
    expect(sound.space.resolve({ x: 0, y: 0 })).toMatchObject({ pan: expect.any(Number) });
  });
});

describe("a play's bus, a hand's reach, a loop and the stereo unit", () => {
  const CUES_091 = {
    drop: { voices: [TONE], placed: true },
    hum: { voices: [TONE], loop: true, bus: "ambience", roll: { above: 1 } },
  } as const satisfies Record<string, Cue>;

  async function made(governor?: Governor) {
    const worklet = fakeWorklet();
    const sound = createSoundWith(
      {
        cues: CUES_091,
        volume: 0.25,
        buses: { narrow: { fx: [{ kind: "stereo", width: 0, pan: -0.5 }] } },
        presence: { mine: { db: 0, sendDb: 0, distance: 0 } },
      },
      worklet.boot,
      { governor },
    );
    await sound.unlock();
    await settle(worklet);
    return { sound, worklet };
  }

  test("a play goes to the bus it names, in place of its cue's", async () => {
    const { sound, worklet } = await made();
    sound.play("drop");
    expect(worklet.starts().at(-1)?.bus).toBe(1);
    sound.play("drop", { bus: "music" });
    expect(worklet.starts().at(-1)?.bus).toBe(3);
    sound.play("drop", { bus: "narrow" });
    expect(worklet.starts().at(-1)?.bus).toBe(6);
  });

  test("a hand with no reach keeps a placed play's pan and drops its distance", async () => {
    const { sound, worklet } = await made();
    sound.play("drop", { at: { x: 4, y: 4 }, mine: false });
    const far = worklet.of("VOICE_PLACE").at(-1);
    sound.play("drop", { at: { x: 4, y: 4 }, mine: true });
    const near = worklet.of("VOICE_PLACE").at(-1);
    expect(far?.distance).toBeGreaterThan(0);
    expect(near?.distance).toBe(0);
    expect(near?.pan).toBe(far?.pan);
  });

  test("a loop cue plays its whole sample round until its voice is stopped, and never rolls", async () => {
    const governor: Governor = { admit: () => ({ action: "roll" }), rolls: () => [] };
    const { sound, worklet } = await made(governor);
    const voice = sound.play("hum");
    expect(voice).not.toBeNull();
    const start = worklet.starts().at(-1);
    expect(start).toMatchObject({ bus: 4, loopStart: 0 });
    expect(start?.loopEnd).toBeGreaterThan(0);
    // It still sounds long after its sample's own length.
    worklet.pump(RATE);
    expect(worklet.pump(4800)).toBeGreaterThan(0);
    voice?.stop(10);
    expect(worklet.of("VOICE_STOP").at(-1)?.voice).toBe(start?.voice);
    // A play fades in over its `attackMs`; with none the core's own attack stands (0 on the wire).
    expect(start?.attack).toBe(0);
    sound.play("hum", { attackMs: 500 })?.stop(10);
    expect(worklet.starts().at(-1)?.attack).toBe(RATE / 2);
    worklet.pump(RATE / 2);
    expect(worklet.pump(4800)).toBe(0);
  });

  test("the stereo unit is declared like any effect, with its width and pan", async () => {
    const { worklet } = await made();
    const define = worklet.of("FX_DEFINE").find((c) => c.kind === 11);
    expect(define).toMatchObject({ bus: 6, slot: 0 });
    const sets = worklet.of("FX_SET").filter((c) => c.bus === 6);
    expect(sets.map((c) => [c.param, c.value])).toEqual([
      [0, 0],
      [1, -0.5],
    ]);
  });
});

describe("a flood of plays", () => {
  const LOUD = { voice: { frequency: 220, sustain: 0.2, release: 0.2, volume: 1 } };
  const FLOOD = {
    bang: { voices: [LOUD] },
    hail: { voices: [LOUD], roll: { above: 20 } },
  } as const satisfies Record<string, Cue>;
  /** The limiter's ceiling, -1 dBFS. */
  const CEILING = 10 ** (-1 / 20);

  async function flood(key: keyof typeof FLOOD) {
    const worklet = fakeWorklet();
    const sound = createSoundWith({ cues: FLOOD, volume: 1 }, worklet.boot);
    await sound.unlock();
    await settle(worklet);
    const before = worklet.starts().length;
    let loudest = 0;
    // 200 plays a second for two seconds, the core rendering 5 ms between each.
    for (let i = 0; i < 400; i++) {
      ctx.currentTime = 1 + i / 200;
      sound.play(key);
      loudest = Math.max(loudest, worklet.pump(RATE / 200));
    }
    for (let i = 0; i < 100; i++) loudest = Math.max(loudest, worklet.pump(RATE / 200));
    ctx.currentTime = 1;
    const started = worklet.starts().slice(before);
    return { loudest, starts: started.length, started, worklet };
  }

  test("200 plays a second never pass the limiter's ceiling, and the governor turns them down", async () => {
    const { loudest, starts, started } = await flood("bang");
    expect(loudest).toBeGreaterThan(0.5);
    expect(loudest).toBeLessThanOrEqual(CEILING + 1e-6);
    // A cue with no roll and no cooldown is never skipped among its equals: repetition turns it down (to -9 dB) and
    // the pool steals the quietest.
    expect(starts).toBe(400);
    expect((started.at(-1)?.gain ?? 1) / (started[0]?.gain ?? 1)).toBeLessThan(0.5);
  });

  test("the same flood of a cue that rolls becomes a handful of plays and one looped voice", async () => {
    const { loudest, starts, worklet } = await flood("hail");
    expect(loudest).toBeLessThanOrEqual(CEILING + 1e-6);
    expect(starts).toBeLessThan(40);
    expect(worklet.starts().filter((c) => c.loopEnd > 0)).toHaveLength(1);
  });
});

describe("the wave 3 wiring", () => {
  /** No randomness: each play of these keeps its rate, so a retuning can be read off it. */
  const STEADY = { voice: { ...TONE.voice, randomness: 0 } };
  const TIMED = {
    snap: { voices: [STEADY], quantise: "16" },
    free: { voices: [STEADY] },
    tuned: { voices: [STEADY], pitched: true },
    climb: { voices: [STEADY], ladder: "scale" },
  } as const satisfies Record<string, Cue>;

  async function timed() {
    const worklet = fakeWorklet();
    const sound = createSoundWith(
      { cues: TIMED, buses: { music: { fx: [{ kind: "filter" }, { kind: "freeze" }] } } },
      worklet.boot,
    );
    await sound.unlock();
    await settle(worklet);
    return { sound, worklet };
  }

  test("a cue's quantise, or a play's when, names the grid line its start waits for", async () => {
    const { sound, worklet } = await timed();
    sound.play("free");
    expect(worklet.starts().at(-1)?.flags).toBe(0);
    sound.play("snap");
    expect(worklet.starts().at(-1)?.flags).toBe(2);
    sound.play("snap", { when: "bar" });
    expect(worklet.starts().at(-1)?.flags).toBe(5);
    sound.play("free", { when: "4" });
    expect(worklet.starts().at(-1)?.flags).toBe(4);
    sound.play("snap", { when: "off" });
    expect(worklet.starts().at(-1)?.flags).toBe(0);
  });

  test("a pitched cue and a scale ladder are put on the harmony clock by degree", async () => {
    const { sound, worklet } = await timed();
    const rate = () => worklet.starts().at(-1)?.rate ?? 0;
    sound.play("free", { degree: 4 });
    const plain = rate();
    sound.play("tuned", { degree: 0 });
    expect(rate()).toBeCloseTo(plain, 5);
    sound.play("tuned", { degree: 4 });
    expect(rate() / plain).toBeGreaterThan(1.3);
    sound.play("climb", { step: 0 });
    expect(rate()).toBeCloseTo(plain, 5);
    sound.play("climb", { step: 7 });
    expect(rate() / plain).toBeCloseTo(2, 2);
  });

  test("freeze moves the freeze declared on a bus, and warns once where there is none", async () => {
    const { sound, worklet } = await timed();
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    sound.freeze("music", 1, 100);
    await new Promise((r) => setTimeout(r, 0));
    const set = worklet.of("FX_SET").at(-1);
    expect(set).toMatchObject({ bus: 3, slot: 1, param: 0, value: 1, slew: 4800 });
    sound.freeze("sfx", 1);
    sound.freeze("sfx", 0);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test("the transport, the instruments and the voices of wave 3 exist before unlock and take calls", () => {
    const sound = createSoundWith({ cues: TIMED }, fakeWorklet().boot);
    sound.transport.set({ bpm: 96, beatsPerBar: 3 });
    sound.transport.start();
    expect(sound.transport.position()).toMatchObject({ bar: expect.any(Number), beat: expect.any(Number) });
    sound.transport.onBeat(() => undefined)();
    sound.harmony.set({ key: "Am", scale: "minor", chord: [0, 2, 4] }, "bar");
    expect(sound.harmony.rateFor(440, 0)).toBeGreaterThan(0);
    sound.sequence({ cue: "snap", steps: "1000100010001000" }).onStep(() => undefined)();
    sound.grain("kit/pad", { position: 0.5 }).set({ position: 0.6 }, 20);
    sound.gen("motor", { params: { rate: 30 } }).set({ rate: 60 });
    sound.babble().say("hello there");
    expect(sound.tap.read()).toMatchObject({ level: expect.any(Number), flux: expect.any(Number) });
    expect(sound.output()).toBeNull();
    sound.music({ pack: "kit", stems: ["bed"], sections: { calm: { stems: { bed: 1 } } } }).section("calm");
  });

  test("the transport's settings reach the core when it comes up", async () => {
    const worklet = fakeWorklet();
    const sound = createSoundWith({ cues: TIMED }, worklet.boot);
    sound.transport.set({ bpm: 96 });
    sound.transport.start();
    await sound.unlock();
    await settle(worklet);
    expect(worklet.of("TRANSPORT_SET").at(-1)).toMatchObject({ bpm: 96, running: 1 });
  });
});

describe("the music, end to end on the core", () => {
  const TICK = { voice: { frequency: 880, sustain: 0.01, release: 0.02, volume: 1, randomness: 0 } };

  /** Renders `seconds` of the core in 10 ms steps, the context's clock moving with it; returns the loudest sample. */
  function run(worklet: ReturnType<typeof fakeWorklet>, clock: { frames: number }, seconds: number) {
    let loudest = 0;
    for (let i = 0; i < seconds * 100; i++) {
      loudest = Math.max(loudest, worklet.pump(RATE / 100));
      clock.frames += RATE / 100;
      ctx.currentTime = clock.frames / RATE;
    }
    return loudest;
  }

  test("a sequence on a running transport steps on the grid, and the page hears each step and beat", async () => {
    ctx.currentTime = 0;
    const worklet = fakeWorklet();
    const sound = createSoundWith({ cues: { tick: { voices: [TICK] } }, volume: 1 }, worklet.boot);
    const steps: number[] = [];
    const beats: { bar: number; beat: number }[] = [];
    const sequence = sound.sequence({ cue: "tick", grid: "16", steps: "1010" });
    sequence.onStep((index) => steps.push(index));
    sound.transport.onBeat((beat) => beats.push(beat));
    sound.transport.set({ bpm: 120 });
    sound.transport.start();
    await sound.unlock();
    await settle(worklet);
    // `settle` rendered 8 blocks of 512 frames without moving the clock: catch the clock up.
    const clock = { frames: 8 * 512 };
    ctx.currentTime = clock.frames / RATE;
    const loudest = run(worklet, clock, 2);

    // 16ths at 120 bpm are 8 a second.
    expect(steps.length).toBeGreaterThanOrEqual(12);
    expect(steps.length).toBeLessThanOrEqual(18);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBe(((steps[i - 1] ?? 0) + 1) % 4);
    expect(loudest).toBeGreaterThan(0.05);
    // Two beats a second, counted through the bar.
    expect(beats.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < beats.length; i++) {
      const [was, now] = [beats[i - 1], beats[i]];
      expect((now?.bar ?? 0) * 4 + (now?.beat ?? 0)).toBe((was?.bar ?? 0) * 4 + (was?.beat ?? 0) + 1);
    }
    const here = sound.transport.position();
    const last = beats.at(-1);
    expect(here.bar * 4 + here.beat).toBeGreaterThanOrEqual((last?.bar ?? 0) * 4 + (last?.beat ?? 0));
    expect(here.phase).toBeGreaterThanOrEqual(0);
    expect(here.phase).toBeLessThan(1);

    // A stopped sequence steps no more; a stopped transport beats no more.
    sequence.stop();
    sound.transport.stop();
    run(worklet, clock, 0.3);
    const [stepped, beaten] = [steps.length, beats.length];
    run(worklet, clock, 1);
    expect(steps.length).toBe(stepped);
    expect(beats.length).toBe(beaten);
    ctx.currentTime = 1;
  });

  test("a score's stems play as loops, and a section change fades one out on the bar", async () => {
    ctx.currentTime = 0;
    const worklet = fakeWorklet();
    const pack: PackManifest = {
      name: "kit",
      tempo: 120,
      samples: {
        bed: { url: "/bed.ogg", seconds: 0.1, channels: 1, lufs: -20, peak: 0.5, kind: "loop", bars: 1 },
      },
    };
    const sound = createSoundWith(
      { cues: { tick: { voices: [TICK] } }, packs: { kit: pack }, volume: 1 },
      worklet.boot,
    );
    await sound.unlock();
    await settle(worklet);
    const clock = { frames: 8 * 512 };
    ctx.currentTime = clock.frames / RATE;
    const music = sound.music({
      pack: "kit",
      stems: ["bed"],
      sections: { on: { stems: { bed: 1 } }, off: { stems: {} } },
    });
    music.section("on", { when: "off" });
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 0));
      run(worklet, clock, 0.05);
    }
    // The stem is held constant in the fake decode, so a playing loop is a steady level.
    expect(worklet.of("LOOP_START")).toHaveLength(1);
    expect(run(worklet, clock, 1)).toBeGreaterThan(0.1);

    music.section("off");
    // The change lands on the next bar (2 s at 120 bpm) and fades over a bar.
    run(worklet, clock, 4.5);
    expect(run(worklet, clock, 0.5)).toBeLessThan(0.01);
    ctx.currentTime = 1;
  });
});
