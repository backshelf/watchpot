// The mix desk: over a mixer and a fake core port (layers, owners, trims, mute and solo, the file, the meters), and
// over `createSound` with a recording stand-in for the core (a cue's strip, its trim on voices new and sounding).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDesk, type MixFile, type MixFileV1, tunable, tunables } from "../../src/sound/desk";
import type { CoreBoot } from "../../src/sound/engine";
import { createSoundWith } from "../../src/sound/engine";
import { createInstruments } from "../../src/sound/instruments";
import { createMixer, type MixerOptions } from "../../src/sound/mixer";
import { createMusic } from "../../src/sound/music/arranger";
import { createHarmony } from "../../src/sound/music/harmony";
import { createTransport } from "../../src/sound/music/transport";
import type { SoundHost } from "../../src/sound/port";
import {
  decodeCommands,
  FX_PARAMS,
  GEN_PARAMS,
  type SoundCommand,
  type SoundEvent,
} from "../../src/sound/protocol";
import type { Cue, DefaultBus, PackManifest } from "../../src/sound/types";
import { fakePort } from "./fake-port";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const db = (n: number) => 10 ** (n / 20);
const SLEW = Math.round(0.03 * 48000);

type Bus = DefaultBus | "verb" | "group";

// `sfx` sums into `group`, which sums into the master; `ui` sends into `verb`, a return.
const OPTIONS: MixerOptions<Bus> = {
  buses: {
    group: {},
    sfx: { out: "group", level: -3, fx: [{ kind: "filter", cutoff: 8000 }] },
    ui: { sends: { verb: 0.3 } },
    verb: { fx: [{ kind: "reverb", decay: 2 }] },
  },
  scenes: {
    calm: { buses: { sfx: { level: -9, fx: { 0: { cutoff: 2000 } } } } },
    duck: { buses: { music: { level: -12 } } },
  },
};

function rig(options: MixerOptions<Bus> = OPTIONS) {
  const fake = fakePort();
  const mixer = createMixer<Bus>(options, fake.port);
  const played: string[] = [];
  const core = createDesk({ mixer: mixer.desk, port: fake.port, audition: (key) => played.push(key) });
  fake.bringUp();
  mixer.boot();
  fake.clear();
  const busIndex = (name: string) => mixer.index(name);
  const gains = (bus: string) =>
    fake
      .of("BUS_SET")
      .filter((c) => c.bus === busIndex(bus) && c.param === 0)
      .map((c) => c.value);
  return { fake, mixer, desk: core.desk, core, played, gains, busIndex };
}

describe("the desk's layers", () => {
  test("a write into the mix is heard at once and survives a scene's push and pop", async () => {
    const { fake, mixer, desk, gains, busIndex } = rig();
    desk.set("mix", "fx:sfx:0:cutoff", 3000);
    await tick();
    const set = fake.of("FX_SET").at(-1);
    expect(set).toMatchObject({ bus: busIndex("sfx"), slot: 0, param: FX_PARAMS.svf.cutoff, slew: SLEW });
    expect(set?.value).toBeCloseTo(3000);
    expect(desk.get("mix", "fx:sfx:0:cutoff")).toBe(3000);

    const pop = mixer.api.scene.push("calm");
    await tick();
    expect(fake.of("FX_SET").at(-1)?.value).toBeCloseTo(2000);
    expect(gains("sfx").at(-1)).toBeCloseTo(db(-9));
    pop();
    await tick();
    expect(fake.of("FX_SET").at(-1)?.value).toBeCloseTo(3000);
    expect(gains("sfx").at(-1)).toBeCloseTo(db(-3));
  });

  test("a write into a scene lies over the scene's own value, and undefined gives the declared one back", async () => {
    const { fake, mixer, desk } = rig();
    mixer.api.scene("calm");
    desk.set("scene:calm", "fx:sfx:0:cutoff", 1000);
    await tick();
    expect(fake.of("FX_SET").at(-1)?.value).toBeCloseTo(1000);
    expect(desk.get("scene:calm", "fx:sfx:0:cutoff")).toBe(1000);
    desk.set("scene:calm", "fx:sfx:0:cutoff", undefined);
    await tick();
    expect(fake.of("FX_SET").at(-1)?.value).toBeCloseTo(2000);
    expect(desk.file().layers).toBeUndefined();
  });

  test("a key or a layer that does not exist is ignored", () => {
    const { desk } = rig();
    desk.set("mix", "fx:sfx:4:cutoff", 1);
    desk.set("mix", "level:nowhere", -3);
    desk.set("scene:none", "level:sfx", -3);
    desk.set("mix", "fx:sfx:0:nope", 1);
    expect(desk.file()).toEqual({ version: 2 });
  });

  test("owner: the mix, the current scene, a pushed scene over it, a route over all; live reads what is in force", () => {
    const { mixer, desk } = rig();
    expect(desk.owner("level:sfx")).toBe("mix");
    expect(desk.owner("level:music")).toBe("default");
    expect(desk.get("live", "fx:verb:0:size")).toBe(0.5);
    expect(desk.owner("fx:verb:0:size")).toBe("default");
    mixer.api.scene("duck");
    expect(desk.owner("level:music")).toBe("scene:duck");
    desk.set("scene:calm", "level:music", -20);
    const pop = mixer.api.scene.push("calm");
    expect(desk.owner("level:music")).toBe("scene:calm");
    expect(desk.get("live", "level:music")).toBe(-20);
    mixer.drive(mixer.target({ bus: "music", level: true }), -1, 0);
    expect(desk.owner("level:music")).toBe("route");
    mixer.drive("level:music", undefined, 0);
    pop();
    expect(desk.owner("level:music")).toBe("scene:duck");
    expect(desk.scenes()).toEqual({ names: ["calm", "duck"], current: "duck", pushed: [], labels: {} });
  });

  test("subscribers hear a write and a scene the game sets, once a microtask", async () => {
    const { mixer, desk } = rig();
    let heard = 0;
    desk.subscribe(() => heard++);
    desk.set("mix", "level:ui", -2);
    desk.set("mix", "level:ui", -4);
    await tick();
    expect(heard).toBe(1);
    mixer.api.scene("calm");
    await tick();
    expect(heard).toBe(2);
    expect(desk.buses()).toBe(desk.buses());
  });
});

describe("the desk's buses", () => {
  test("buses(): the master first, each with where it sums, its sends and every setting of its effects", () => {
    const { desk } = rig();
    const buses = desk.buses();
    expect(buses[0]).toMatchObject({ name: "master", out: null, sends: [], fx: [] });
    const sfx = buses.find((b) => b.name === "sfx");
    expect(sfx?.out).toBe("group");
    expect(sfx?.sends).not.toContain("sfx");
    expect(sfx?.fx[0]?.params.map((p) => p.param)).toEqual(["cutoff", "q", "mode", "slope"]);
  });

  test("a trim multiplies the bus's gain, outside a scene's level, and 0 takes it away", async () => {
    const { mixer, desk, gains } = rig();
    desk.trim("sfx", 6);
    await tick();
    expect(gains("sfx").at(-1)).toBeCloseTo(db(3));
    mixer.api.scene("calm");
    await tick();
    expect(gains("sfx").at(-1)).toBeCloseTo(db(-3));
    expect(desk.file().layers?.mix).toEqual({ "trim:sfx": 6 });
    desk.trim("sfx", 0);
    await tick();
    expect(gains("sfx").at(-1)).toBeCloseTo(db(-9));
    expect(desk.file().layers).toBeUndefined();
    desk.trim("ui", 99);
    expect(desk.file().layers?.mix).toEqual({ "trim:ui": 24 });
  });

  test("solo keeps the bus, its way to the master and its returns; the rest go to 0; clearing restores", async () => {
    const { desk, gains } = rig();
    desk.solo("bus:sfx", true);
    await tick();
    expect(gains("sfx")).toEqual([]);
    expect(gains("group")).toEqual([]);
    expect(gains("ui").at(-1)).toBe(0);
    expect(gains("music").at(-1)).toBe(0);
    expect(gains("verb").at(-1)).toBe(0);
    desk.solo("bus:sfx", false);
    desk.solo("bus:ui", true);
    await tick();
    expect(gains("verb").at(-1)).toBe(1);
    expect(gains("sfx").at(-1)).toBe(0);
    desk.mute("bus:ui", true);
    await tick();
    expect(gains("ui").at(-1)).toBe(0);
    desk.clearListening();
    await tick();
    for (const bus of ["sfx", "ui", "music"]) expect(gains(bus).at(-1)).toBeGreaterThan(0);
    expect(desk.buses().some((b) => b.muted || b.soloed)).toBe(false);
    expect(desk.file()).toEqual({ version: 2 });
  });
});

describe("the desk's file", () => {
  test("file() is sorted and holds only what was moved; dirty() until saved()", () => {
    const { desk } = rig();
    expect(desk.dirty()).toBe(false);
    desk.set("mix", "level:ui", -2);
    desk.set("mix", "fx:sfx:0:cutoff", 500);
    desk.trim("music", -3);
    expect(desk.dirty()).toBe(true);
    const file = desk.file();
    expect(Object.keys(file.layers?.mix ?? {})).toEqual(["fx:sfx:0:cutoff", "level:ui", "trim:music"]);
    desk.saved();
    expect(desk.dirty()).toBe(false);
    desk.set("mix", "level:ui", undefined);
    expect(desk.dirty()).toBe(true);
  });

  test("load() replaces the state live, keeps what the mix no longer has, and clears mutes", async () => {
    const { fake, desk, gains } = rig();
    desk.set("mix", "level:ui", -2);
    desk.mute("bus:music", true);
    await tick();
    expect(gains("music").at(-1)).toBe(0);
    const file: MixFileV1 = {
      version: 1,
      trims: { gone: 3, sfx: -6 },
      layers: { mix: { "fx:sfx:0:cutoff": 700, "level:ghost": 1 }, "scene:old": { "level:sfx": 2 } },
      channels: { "cue:boom": -4, "odd:thing": 2 },
    };
    desk.load(file);
    await tick();
    expect(fake.of("FX_SET").at(-1)?.value).toBeCloseTo(700);
    expect(gains("sfx").at(-1)).toBeCloseTo(db(-9));
    expect(gains("music").at(-1)).toBe(1);
    expect(desk.get("mix", "level:ui")).toBeUndefined();
    // The first desk's file comes back as the second's: its parts as keys of the mix.
    expect(desk.file()).toEqual({
      version: 2,
      layers: {
        mix: {
          "ch:cue:boom": -4,
          "ch:odd:thing": 2,
          "fx:sfx:0:cutoff": 700,
          "level:ghost": 1,
          "trim:gone": 3,
          "trim:sfx": -6,
        },
        "scene:old": { "level:sfx": 2 },
      },
    });
    expect(desk.dirty()).toBe(false);
    expect(desk.channels()).toMatchObject([{ id: "cue:boom", kind: "cue", name: "boom", bus: "", trim: -4 }]);
  });

  test("tunables in a file are applied and listed", () => {
    const { desk } = rig();
    const read = tunable("desk-test.tick", -28, { group: "test", label: "tick", min: -60, max: 0 });
    desk.load({ version: 1, tunables: { "desk-test.tick": -20 } });
    expect(read()).toBe(-20);
    expect(desk.tunables().find((t) => t.id === "desk-test.tick")).toMatchObject({
      initial: -28,
      value: -20,
    });
    expect(desk.file().layers?.mix?.["tune:desk-test.tick"]).toBe(-20);
    desk.load({ version: 2 });
    expect(read()).toBe(-28);
    expect(tunables().find((t) => t.id === "desk-test.tick")?.value).toBe(-28);
  });
});

describe("the desk's meters", () => {
  test("the peak held since the last read, the latest RMS, by bus name; silence with no events", () => {
    const { fake, desk } = rig();
    const peak = new Array(16).fill(0);
    const rms = new Array(16).fill(0);
    peak[0] = 0.8;
    rms[0] = 0.3;
    const reduction = new Array(16).fill(0);
    reduction[1] = 4;
    fake.emit({ op: "METERS", frame: 0, loudness: -14, peak, rms, bands: [0, 0, 0], reduction });
    fake.emit({
      op: "METERS",
      frame: 0,
      loudness: -15,
      peak: peak.map((p) => p / 2),
      rms,
      bands: [0, 0, 0],
      reduction: reduction.map((r) => r / 2),
    });
    const first = desk.meters();
    // A compressor's most reduction since the last read, by bus name.
    expect(first.buses.sfx?.reduction).toBe(4);
    expect(first.buses.master?.peak).toBeCloseTo(0.8);
    expect(first.buses.master?.rms).toBeCloseTo(0.3);
    expect(first.lufs).toBe(-15);
    expect(desk.meters().buses.master?.peak).toBe(0);
    fake.advance(1);
    expect(desk.meters().lufs).toBe(-200);
  });
});

// ---- Over createSound -------------------------------------------------------------------------------------------

const ctx = {
  state: "running" as AudioContextState,
  currentTime: 1,
  sampleRate: 48000,
  destination: {},
  resume: async () => undefined,
  decodeAudioData: async () => ({}),
};
const realContext = globalThis.AudioContext;
beforeAll(async () => {
  globalThis.AudioContext = class {
    state = "running";
    resume = async () => undefined;
  } as unknown as typeof AudioContext;
  const { ZZFX } = await import("zzfx");
  ZZFX.audioContext = ctx as unknown as AudioContext;
});
afterAll(() => {
  globalThis.AudioContext = realContext;
});

/** A core that keeps every record and answers nothing unless told. */
function recordingCore() {
  const sent: SoundCommand[] = [];
  let hear: (events: SoundEvent[]) => void = () => undefined;
  const boot: CoreBoot = {
    supported: () => true,
    boot: async () => ({
      send: (records) => void sent.push(...decodeCommands(records)),
      upload: (_pcm, record) => void sent.push(...decodeCommands(record)),
      onEvent: (listener) => {
        hear = listener;
      },
      onError: () => undefined,
      dispose: () => undefined,
    }),
  };
  return {
    boot,
    sent,
    emit: (event: SoundEvent) => hear([event]),
    of: <O extends SoundCommand["op"]>(op: O) =>
      sent.filter((c): c is Extract<SoundCommand, { op: O }> => c.op === op),
  };
}

const TONE = { voice: { frequency: 440, sustain: 0.05, release: 0.05 } };
const CUES = {
  blip: { voices: [TONE], bus: "ui" },
  bed: { voices: [TONE], loop: true, bus: "ambience" },
} as const satisfies Record<string, Cue>;

async function sound(mix?: MixFile | MixFileV1) {
  const core = recordingCore();
  const made = createSoundWith({ cues: CUES, mix }, core.boot);
  await made.unlock();
  return { core, sound: made };
}

describe("the desk over createSound", () => {
  test("a cue's strip appears on its first play; its trim scales the next start and moves a loop already sounding", async () => {
    const { core, sound: s } = await sound();
    expect(s.desk.channels()).toEqual([]);
    s.play("blip");
    const plain = core.of("VOICE_START").at(-1)?.gain ?? 0;
    // The cue, then the bus its play asked for: its role.
    expect(s.desk.channels()).toMatchObject([
      { id: "cue:blip", kind: "cue", bus: "ui", sounding: true },
      { id: "cue:blip@ui", parent: "cue:blip", role: "ui", bus: "ui", sounding: true },
    ]);
    s.desk.channelTrim("cue:blip", -6);
    ctx.currentTime += 5; // past the governor's memory, so it adds nothing to the second play
    s.play("blip");
    expect((core.of("VOICE_START").at(-1)?.gain ?? 0) / plain).toBeCloseTo(db(-6), 4);

    s.play("bed");
    const bed = core.of("VOICE_START").at(-1);
    s.desk.channelTrim("cue:bed", 6);
    const set = core.of("VOICE_SET").at(-1);
    expect(set).toMatchObject({ voice: bed?.voice, param: 0 });
    expect((set?.value ?? 0) / (bed?.gain ?? 1)).toBeCloseTo(db(6), 4);

    core.emit({ op: "VOICE_ENDED", frame: 0, voice: bed?.voice ?? 0 });
    expect(s.desk.channels().find((c) => c.id === "cue:bed")?.sounding).toBe(false);
  });

  test("a muted cue starts at gain 0 (the governor still counts it) and comes back unmuted", async () => {
    const { core, sound: s } = await sound();
    s.play("bed");
    const bed = core.of("VOICE_START").at(-1);
    s.desk.mute("cue:bed", true);
    expect(core.of("VOICE_SET").at(-1)).toMatchObject({ voice: bed?.voice, value: 0 });
    s.play("blip");
    expect(core.of("VOICE_START").at(-1)?.gain).toBeGreaterThan(0);
    s.desk.solo("cue:blip", true);
    s.play("blip");
    s.play("bed");
    expect(core.of("VOICE_START").at(-1)?.gain).toBe(0);
    s.desk.clearListening();
    const back = core.of("VOICE_SET").filter((c) => c.voice === bed?.voice);
    expect(back.at(-1)?.value).toBeCloseTo(bed?.gain ?? -1);
  });

  test("a soloed cue keeps its bus, its way out and the return its own sends reach; other buses go to 0", async () => {
    const core = recordingCore();
    const s = createSoundWith(
      {
        cues: { wet: { voices: [TONE], bus: "ui", sends: { verb: 0.5 } }, dry: { voices: [TONE] } },
        buses: { verb: {} },
      },
      core.boot,
    );
    await s.unlock();
    s.play("wet");
    s.play("dry");
    s.desk.solo("cue:wet", true);
    await tick();
    const lastGain = (bus: number) =>
      core
        .of("BUS_SET")
        .filter((c) => c.bus === bus && c.param === 0)
        .at(-1)?.value;
    expect(lastGain(1)).toBe(0); // sfx
    expect(lastGain(3)).toBe(0); // music
    expect(lastGain(2)).toBeUndefined(); // ui, untouched
    expect(lastGain(6)).toBeUndefined(); // verb, untouched
  });

  test("audition plays a cue channel; other kinds do nothing", async () => {
    const { core, sound: s } = await sound();
    s.desk.audition("cue:blip");
    s.desk.audition("stem:x/y");
    expect(core.of("VOICE_START")).toHaveLength(1);
  });

  test("file() round-trips through createSound({ mix }) to the same records", async () => {
    const first = await sound();
    first.sound.desk.set("mix", "level:ui", -5);
    first.sound.desk.trim("ambience", -2);
    first.sound.desk.channelTrim("cue:blip", -3);
    await tick();
    first.sound.play("blip");
    const file = first.sound.desk.file();

    const second = await sound(file);
    second.sound.play("blip");
    // A bus's gain as the core last heard it: its define, or a later gain set.
    const lastGain = (c: ReturnType<typeof recordingCore>, bus: number) =>
      c.sent
        .flatMap((x) =>
          x.op === "BUS_DEFINE" && x.bus === bus
            ? [x.gain]
            : x.op === "BUS_SET" && x.bus === bus && x.param === 0
              ? [x.value]
              : [],
        )
        .at(-1);
    for (const bus of [2, 4]) expect(lastGain(second.core, bus)).toBeCloseTo(lastGain(first.core, bus) ?? -1);
    expect(second.core.of("VOICE_START").at(-1)?.gain).toBeCloseTo(
      first.core.of("VOICE_START").at(-1)?.gain ?? -1,
    );
    expect(second.sound.desk.dirty()).toBe(false);
    expect(second.sound.desk.file()).toEqual(file);
    expect(second.sound.desk.channels().map((c) => c.id)).toEqual(["cue:blip", "cue:blip@ui"]);
  });

  test("a voice the core says ended through its event lets the strip go dark", async () => {
    const { core, sound: s } = await sound();
    s.play("blip");
    const voice = core.of("VOICE_START").at(-1)?.voice ?? 0;
    core.emit({ op: "VOICE_ENDED", frame: 1, voice });
    expect(s.desk.channels()[0]?.sounding).toBe(false);
    expect(s.desk.channels()[0]?.lastAt).toBe(ctx.currentTime);
  });
});

// ---- Stems and generators, over a host whose strips are a desk's ------------------------------------------------

const PACK: PackManifest = {
  name: "score",
  tempo: 120,
  samples: { bed: { url: "bed.ogg", seconds: 8, channels: 2, lufs: -16, peak: -1, kind: "loop", bars: 4 } },
};

function stage() {
  const { fake, desk, core } = rig();
  const transport = createTransport(fake.port);
  const harmony = createHarmony(transport, fake.port);
  const host: SoundHost = {
    port: fake.port,
    bus: () => 3,
    held: (key) => (key === "score/bed" ? { id: 10, frames: 1, rate: 48000, scale: 2 } : null),
    manifest: () => PACK,
    loadPack: async () => undefined,
    play: () => null,
    voice: () => null,
    place: () => ({ pan: 0, distance: 0, occlusion: 0 }),
    gen: (kind, def) => instruments.gen(kind, def),
    transport,
    harmony,
    channel: core.channel,
  };
  const instruments = createInstruments(host, () => 0.5);
  return { fake, desk, host, instruments };
}

describe("a trim on stems and generators", () => {
  test("a stem's trim moves its loop's level now; above what a level of 1 carries it starts again louder", async () => {
    const { fake, desk, host } = stage();
    const music = createMusic(
      { pack: "score", stems: ["bed"], sections: { calm: { stems: { bed: 0.5 } } } },
      host,
    );
    music.layer("bed", 0.5);
    await tick();
    // Raised from nothing, the loop starts silent and takes its level from the next frame.
    expect(fake.of("LOOP_START")).toMatchObject([{ gain: 2, level: 0 }]);
    expect(fake.of("LOOP_SET").at(-1)).toMatchObject({ level: 0.5, atFrame: 1 });
    fake.advance(0.01);
    expect(desk.channels()).toMatchObject([{ id: "stem:score/bed", bus: "music", sounding: true }]);
    desk.channelTrim("stem:score/bed", -6);
    expect(fake.of("LOOP_SET").at(-1)?.level).toBeCloseTo(0.5 * db(-6));
    desk.channelTrim("stem:score/bed", 12);
    const again = fake.of("LOOP_START").at(-1);
    expect(fake.of("LOOP_START")).toHaveLength(2);
    expect((again?.gain ?? 0) * (again?.level ?? 0)).toBeCloseTo(2 * 0.5 * db(12), 4);
    desk.channelTrim("stem:score/bed", 0);
    const set = fake.of("LOOP_SET").at(-1);
    expect((again?.gain ?? 0) * (set?.level ?? 0)).toBeCloseTo(2 * 0.5, 4);
  });

  test("a generator's trim rides on its level, from its kind's default; a named one is its own strip", () => {
    const { fake, desk, instruments } = stage();
    instruments.gen("noise", {});
    expect(fake.of("GEN_SET")).toHaveLength(0);
    instruments.gen("noise", { name: "wind" });
    expect(desk.channels().map((c) => c.id)).toEqual(["gen:noise#1", "gen:wind"]);
    desk.channelTrim("gen:noise#1", -6);
    expect(fake.of("GEN_SET").at(-1)).toMatchObject({ slot: 0, param: GEN_PARAMS.noise.level });
    expect(fake.of("GEN_SET").at(-1)?.value).toBeCloseTo(0.3 * db(-6));
  });
});
