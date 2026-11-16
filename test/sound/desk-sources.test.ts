// The mix desk's hold on a sound's sources, over `createSound` with the committed core standing in for the worklet:
// a cue's roles, a route, a source's own sends, takes replaced, and a recording staged beside a sample.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SampleEntry } from "../../src/sound/desk";
import type { CoreBoot } from "../../src/sound/engine";
import { createSoundWith } from "../../src/sound/engine";
import { decodeCommands, type SoundCommand, type SoundEvent } from "../../src/sound/protocol";
import type { Cue, PackManifest } from "../../src/sound/types";
import { loadCore } from "./harness";

const RATE = 48000;
const db = (n: number) => 10 ** (n / 20);
const realContext = globalThis.AudioContext;
const realFetch = globalThis.fetch;

function flatBuffer() {
  const data = new Float32Array(RATE / 10).fill(0.5);
  return {
    duration: 0.1,
    length: data.length,
    sampleRate: RATE,
    numberOfChannels: 1,
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

beforeAll(async () => {
  globalThis.AudioContext = class {
    state = "running";
    resume = async () => undefined;
  } as unknown as typeof AudioContext;
  globalThis.fetch = (async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(1),
  })) as unknown as typeof fetch;
  const { ZZFX } = await import("zzfx");
  ZZFX.audioContext = ctx as unknown as AudioContext;
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
      onError: () => undefined,
      dispose: () => undefined,
    }),
  };
  return {
    boot,
    pump() {
      core.render(512);
      hear(core.events());
    },
    of: <O extends SoundCommand["op"]>(op: O) =>
      sent.filter((c): c is Extract<SoundCommand, { op: O }> => c.op === op),
  };
}

async function settle(worklet: ReturnType<typeof fakeWorklet>) {
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 0));
    worklet.pump();
  }
}

const TONE = { voice: { frequency: 440, sustain: 0.05, release: 0.05 } };
const CUES = {
  blip: { voices: [TONE], bus: "ui" },
  wet: { voices: [TONE], bus: "ui", sends: { verb: 0.5 } },
  hit: { voices: [TONE], takes: [{ sample: "drums/kick" }] },
} as const satisfies Record<string, Cue>;

const SHOT = { seconds: 0.1, channels: 1, lufs: -18, peak: 0.5, kind: "shot" } as const;
const DRUMS: PackManifest = {
  name: "drums",
  samples: { kick: { url: "/kick.ogg", ...SHOT }, snare: { url: "/snare.ogg", ...SHOT } },
};
// The buses by index: sfx 1, ui 2, music 3, ambience 4, voice 5, verb 6, room 7.
const BUS = { sfx: 1, ui: 2, music: 3, ambience: 4, verb: 6, room: 7 };

async function make() {
  const worklet = fakeWorklet();
  const sound = createSoundWith(
    { cues: CUES, packs: { drums: DRUMS }, buses: { verb: {}, room: {} } },
    worklet.boot,
  );
  await sound.unlock();
  const start = () => worklet.of("VOICE_START").at(-1);
  /** Plays past the governor's memory of the last play, so it adds nothing. */
  const play: typeof sound.play = (key, options) => {
    ctx.currentTime += 5;
    return sound.play(key, options);
  };
  return { worklet, sound, desk: sound.desk, start, play };
}

describe("a cue's roles", () => {
  test("each bus its plays ask for is a strip under the cue, routed and trimmed on its own", async () => {
    const { desk, start, play } = await make();
    play("blip");
    const plain = start()?.gain ?? 0;
    play("blip", { bus: "sfx" });
    expect(desk.channels().map((c) => c.id)).toEqual(["cue:blip", "cue:blip@ui", "cue:blip@sfx"]);
    expect(desk.channels().find((c) => c.id === "cue:blip@sfx")).toMatchObject({
      parent: "cue:blip",
      role: "sfx",
      bus: "sfx",
    });

    // A role's route moves that role alone; the cue's moves the rest.
    expect(desk.route("cue:blip@sfx", "music")).toBe(true);
    play("blip", { bus: "sfx" });
    expect(start()?.bus).toBe(BUS.music);
    play("blip");
    expect(start()?.bus).toBe(BUS.ui);
    desk.route("cue:blip", "ambience");
    play("blip");
    expect(start()?.bus).toBe(BUS.ambience);
    play("blip", { bus: "sfx" });
    expect(start()?.bus).toBe(BUS.music);
    expect(desk.channels().find((c) => c.id === "cue:blip@sfx")).toMatchObject({
      bus: "music",
      route: "music",
    });
    expect(desk.route("cue:blip", "nowhere")).toBe(false);

    // The cue's trim reaches every role; a role's adds to it.
    desk.channelTrim("cue:blip", -6);
    desk.channelTrim("cue:blip@sfx", -6);
    play("blip");
    expect((start()?.gain ?? 0) / plain).toBeCloseTo(db(-6), 3);
    play("blip", { bus: "sfx" });
    expect((start()?.gain ?? 0) / plain).toBeCloseTo(db(-12), 3);
    expect(desk.file().graph?.routes).toEqual({ "cue:blip": "ambience", "cue:blip@sfx": "music" });
  });

  test("a source's own sends are the desk's where it says: a level, a role's over the cue's, one it added", async () => {
    const { desk, start, play } = await make();
    play("wet");
    expect(start()).toMatchObject({ sendBus1: BUS.verb, send1: 0.5, sendBus2: 0 });
    expect(desk.channels().find((c) => c.id === "cue:wet")?.sends).toEqual([{ to: "verb", level: 0.5 }]);

    desk.set("mix", "chsend:cue:wet>verb", 0.2);
    play("wet");
    expect(start()?.send1).toBeCloseTo(0.2);
    play("wet", { bus: "sfx" });
    desk.set("mix", "chsend:cue:wet@sfx>verb", 0.8);
    desk.set("mix", "chsend:cue:wet>room", 0.25);
    play("wet", { bus: "sfx" });
    expect(start()).toMatchObject({ sendBus1: BUS.verb, sendBus2: BUS.room });
    expect(start()?.send1).toBeCloseTo(0.8);
    expect(start()?.send2).toBeCloseTo(0.25);
    play("wet");
    expect(start()?.send1).toBeCloseTo(0.2);
    // The master is no send, and a bus that does not exist is refused.
    desk.set("mix", "chsend:cue:wet>master", 1);
    desk.set("mix", "chsend:cue:wet>nowhere", 1);
    expect(Object.keys(desk.file().layers?.mix ?? {})).toEqual([
      "chsend:cue:wet>room",
      "chsend:cue:wet>verb",
      "chsend:cue:wet@sfx>verb",
    ]);
  });
});

describe("takes and samples", () => {
  async function loaded() {
    const made = await make();
    const loading = made.sound.loadPack("drums");
    await settle(made.worklet);
    await loading;
    const ids = made.worklet.of("SAMPLE_LOAD").map((c) => c.sample);
    return { ...made, ids };
  }

  test("a cue's takes replaced on the desk are what it plays, in the file, and undone", async () => {
    const { desk, start, play } = await loaded();
    play("hit");
    const kick = start()?.sample;
    expect(desk.takes("hit")).toMatchObject({ takes: [{ sample: "drums/kick" }], replaced: false });
    expect(desk.takes("nope")).toBeNull();

    desk.setTakes("hit", [{ sample: "drums/snare", level: -3 }]);
    play("hit");
    expect(start()?.sample).not.toBe(kick);
    expect(desk.file().cues).toEqual({ hit: { takes: [{ sample: "drums/snare", level: -3 }] } });
    expect(desk.channels().find((c) => c.id === "cue:hit")?.samples).toEqual(["drums/snare"]);
    expect(desk.samples().find((s) => s.key === "drums/snare")?.users).toEqual(["cue:hit"]);

    desk.undo();
    play("hit");
    expect(start()?.sample).toBe(kick);
    expect(desk.takes("hit")?.replaced).toBe(false);
  });

  test("a recording staged beside a sample plays in its place, switches back and forth, and is dropped or kept", async () => {
    const { worklet, desk, start, play } = await loaded();
    play("hit");
    const a = start()?.sample ?? -1;
    const entry: SampleEntry = { ...SHOT, seconds: 0.2, source: "dropped.wav" };

    const staging = desk.stage("drums/kick", new ArrayBuffer(8), entry, "t1");
    await settle(worklet);
    expect(await staging).toBe(true);
    play("hit");
    const b = start()?.sample ?? -1;
    expect(b).not.toBe(a);
    expect(desk.samples().find((s) => s.key === "drums/kick")).toMatchObject({
      staged: true,
      side: "b",
      entry,
    });
    expect(desk.staged()).toEqual([{ key: "drums/kick", token: "t1", entry, fresh: false }]);

    desk.ab("drums/kick", "a");
    play("hit");
    expect(start()?.sample).toBe(a);
    expect(desk.samples().find((s) => s.key === "drums/kick")?.entry.seconds).toBe(0.1);
    desk.ab("drums/kick", "b");
    play("hit");
    expect(start()?.sample).toBe(b);

    desk.unstage("drums/kick");
    play("hit");
    expect(start()?.sample).toBe(a);
    expect(worklet.of("SAMPLE_FREE").map((c) => c.sample)).toEqual([b]);
    expect(desk.staged()).toEqual([]);

    // Kept: the staged one is the sample, the pack's own is freed, and the entry is the new one.
    const again = desk.stage("drums/kick", new ArrayBuffer(8), entry, "t2");
    await settle(worklet);
    await again;
    desk.committed(["drums/kick"]);
    play("hit");
    expect(start()?.sample).not.toBe(a);
    expect(worklet.of("SAMPLE_FREE").map((c) => c.sample)).toContain(a);
    expect(desk.samples().find((s) => s.key === "drums/kick")).toMatchObject({
      staged: false,
      side: "a",
      entry,
    });
  });

  test("a sample the pack does not have yet is staged as new, with no other side", async () => {
    const { worklet, desk, start, play } = await loaded();
    const staging = desk.stage("drums/rim", new ArrayBuffer(8), { ...SHOT }, "t3");
    await settle(worklet);
    expect(await staging).toBe(true);
    expect(desk.staged()[0]).toMatchObject({ key: "drums/rim", fresh: true });
    desk.ab("drums/rim", "a");
    expect(desk.samples().find((s) => s.key === "drums/rim")).toMatchObject({ staged: true, side: "b" });
    desk.setTakes("hit", [{ sample: "drums/rim" }]);
    play("hit");
    expect(start()?.sample).toBe(worklet.of("SAMPLE_LOAD").at(-1)?.sample);
    desk.committed(["drums/rim"]);
    expect(desk.samples().find((s) => s.key === "drums/rim")).toMatchObject({ staged: false, pack: "drums" });
  });
});
