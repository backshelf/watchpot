// The mixer against a fake core port that records what is sent: buses, effects, sends, scenes, the player's volumes.
import { describe, expect, spyOn, test } from "bun:test";
import { createMixer, type MixerOptions } from "../../src/sound/mixer";
import type { CorePort } from "../../src/sound/port";
import { soundPrefs } from "../../src/sound/prefs";
import { CURVE, decodeCommands, FX_KIND, FX_PARAMS, type SoundCommand } from "../../src/sound/protocol";
import type { DefaultBus } from "../../src/sound/types";

const RATE = 48000;

function fakePort() {
  let up = false;
  const sends: SoundCommand[][] = [];
  const samples = new Map<string, number>();
  const port: CorePort = {
    whenUp: (fn) => fn(),
    listen: () => () => {},
    rate: () => 48000,
    time: () => 0,
    frame: () => 0,
    send(records) {
      if (up) sends.push(decodeCommands(records));
    },
    up: () => up,
    frames: (ms) => Math.max(0, Math.round(((ms ?? 0) / 1000) * RATE)) || 0,
    sample: (key) => samples.get(key) ?? 0,
  };
  return {
    port,
    sends,
    of: <O extends SoundCommand["op"]>(op: O) =>
      sends.flat().filter((c): c is Extract<SoundCommand, { op: O }> => c.op === op),
    setUp: (value: boolean) => {
      up = value;
    },
    setSample: (key: string, id: number) => samples.set(key, id),
  };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

type Bus = DefaultBus | "bed" | "deep";

// `bed` (6) sums into `deep` (7), declared after it, and `sfx` (1) sends to it: `deep` is defined before both.
const OPTIONS: MixerOptions<Bus> = {
  buses: {
    bed: { out: "deep", level: -3 },
    deep: { fx: [{ kind: "reverb", size: 0.4, decay: 2 }] },
    sfx: { sends: { deep: 0.2 } },
  },
  scenes: {
    calm: {
      buses: {
        music: { level: -6 },
        deep: { fx: { 0: { size: 0.3 } } },
        sfx: { sends: { deep: 0.1 } },
      },
    },
    duck: {
      buses: {
        music: { level: -20 },
        deep: { fx: { 0: { size: 0.9 } } },
        sfx: { sends: { deep: 0.6 } },
      },
    },
  },
};

const db = (n: number) => 10 ** (n / 20);

function make(options: MixerOptions<Bus> = OPTIONS) {
  const fake = fakePort();
  const mixer = createMixer<Bus>(options, fake.port);
  return { fake, mixer, api: mixer.api };
}

/** What the core was last told of a bus's gain, the reverb's size and `sfx`'s send to `deep`. */
function last(fake: ReturnType<typeof fakePort>) {
  const gain = (bus: number) =>
    fake
      .of("BUS_SET")
      .filter((c) => c.bus === bus && c.param === 0)
      .at(-1);
  return {
    music: gain(3),
    size: fake
      .of("FX_SET")
      .filter((c) => c.bus === 7 && c.slot === 0 && c.param === FX_PARAMS.fdn.size)
      .at(-1),
    send: fake
      .of("BUS_SET")
      .filter((c) => c.bus === 1 && c.param === 2 && c.index === 7)
      .at(-1),
  };
}

describe("the mixer", () => {
  test("what is defined and set before the core is up is sent once after, in dependency order", async () => {
    const { fake, mixer, api } = make();
    api.bus("deep").fx(0).set("size", 0.8, 100);
    api.setBusVolume("music", 0.5);
    api.bus("ui").level(-6);
    await tick();
    expect(fake.sends).toHaveLength(0);

    fake.setUp(true);
    mixer.boot();
    expect(fake.sends).toHaveLength(1);
    const defines = fake.of("BUS_DEFINE");
    expect(defines.map((c) => c.bus)).toEqual([2, 3, 4, 5, 7, 1, 6]);
    expect(defines.find((c) => c.bus === 6)).toMatchObject({ out: 7 });
    expect(defines.find((c) => c.bus === 6)?.gain).toBeCloseTo(db(-3), 5);
    expect(defines.find((c) => c.bus === 3)?.gain).toBeCloseTo(0.5, 5);
    expect(defines.find((c) => c.bus === 2)?.gain).toBeCloseTo(db(-6), 5);

    const ops = fake.sends[0]?.map((c) => c.op) ?? [];
    expect(ops.indexOf("FX_DEFINE")).toBeGreaterThan(ops.lastIndexOf("BUS_DEFINE"));
    expect(fake.of("FX_DEFINE")).toEqual([
      expect.objectContaining({ bus: 7, slot: 0, kind: FX_KIND.fdn, key: 0 }),
    ]);
    // The definition's settings, with the handle's size over its own, land at once.
    const sets = fake.of("FX_SET");
    expect(sets.find((c) => c.param === FX_PARAMS.fdn.size)).toMatchObject({ slew: 0 });
    expect(sets.find((c) => c.param === FX_PARAMS.fdn.size)?.value).toBeCloseTo(0.8, 5);
    expect(sets.find((c) => c.param === FX_PARAMS.fdn.decay)).toMatchObject({ value: 2, curve: CURVE.exp });
    expect(last(fake).send?.value).toBeCloseTo(0.2, 5);

    // Nothing is left over to send, and a core that comes up again is told everything again.
    await tick();
    expect(fake.sends).toHaveLength(1);
    mixer.boot();
    expect(fake.sends).toHaveLength(2);
    expect(fake.of("BUS_DEFINE")).toHaveLength(14);
  });

  test("a pushed scene popped returns every parameter to the scene under it", async () => {
    const { fake, mixer, api } = make();
    fake.setUp(true);
    mixer.boot();
    api.scene("calm", { fadeMs: 0 });
    await tick();
    const calm = last(fake);
    expect(calm.music?.value).toBeCloseTo(db(-6), 5);
    expect(calm.size?.value).toBeCloseTo(0.3, 5);
    expect(calm.send?.value).toBeCloseTo(0.1, 5);

    const pop = api.scene.push("duck", { fadeMs: 200 });
    await tick();
    const ducked = last(fake);
    expect(ducked.music?.value).toBeCloseTo(db(-20), 5);
    expect(ducked.music?.slew).toBe(RATE / 5);
    expect(ducked.size?.value).toBeCloseTo(0.9, 5);
    expect(ducked.send?.value).toBeCloseTo(0.6, 5);

    pop();
    pop(); // a second pop does nothing
    await tick();
    const back = last(fake);
    expect(back.music?.value).toBeCloseTo(db(-6), 5);
    expect(back.music?.slew).toBe(RATE / 5);

    // A pushed scene comes off over a fade of its own when it is given one.
    const slow = api.scene.push("duck", { fadeMs: 200 });
    await tick();
    slow({ fadeMs: 1000 });
    await tick();
    const eased = last(fake);
    expect(eased.music?.value).toBeCloseTo(db(-6), 5);
    expect(eased.music?.slew).toBe(RATE);
    expect(back.size?.value).toBeCloseTo(0.3, 5);
    expect(back.send?.value).toBeCloseTo(0.1, 5);
  });

  test("a scene covers the mix, a handle moves the mix, and a scene with nothing to say uncovers it", async () => {
    const { fake, mixer, api } = make({ ...OPTIONS, scenes: { ...OPTIONS.scenes, plain: {} } });
    fake.setUp(true);
    mixer.boot();
    api.scene("calm", { fadeMs: 0 });
    api.bus("music").level(-10);
    await tick();
    expect(last(fake).music?.value).toBeCloseTo(db(-6), 5);
    api.scene("plain", { fadeMs: 0 });
    await tick();
    expect(last(fake).music?.value).toBeCloseTo(db(-10), 5);
    // An unknown scene changes nothing.
    const before = fake.sends.length;
    api.scene("nowhere");
    api.scene.push("nowhere")();
    await tick();
    expect(fake.sends).toHaveLength(before);
  });

  test("writes in a row are sent once, and a value already sent is not sent again", async () => {
    const { fake, mixer, api } = make();
    fake.setUp(true);
    mixer.boot();
    const booted = fake.sends.length;
    for (let i = 0; i < 10; i++)
      api
        .bus("deep")
        .fx(0)
        .set("size", i / 10, 20);
    api.bus("music").level(0); // already 0 dB
    await tick();
    expect(fake.sends).toHaveLength(booted + 1);
    expect(fake.sends.at(-1)).toEqual([expect.objectContaining({ op: "FX_SET", value: expect.any(Number) })]);
    expect(last(fake).size?.value).toBeCloseTo(0.9, 5);
    expect(last(fake).size?.slew).toBe(RATE / 50);
  });

  test("the player's volume multiplies a bus's level", async () => {
    const { fake, mixer, api } = make();
    fake.setUp(true);
    mixer.boot();
    api.bus("music").level(-6);
    api.setBusVolume("music", 0.5);
    await tick();
    expect(last(fake).music?.value).toBeCloseTo(db(-6) * 0.5, 5);
    expect(last(fake).music?.slew).toBe(Math.round(0.03 * RATE));
    api.setBusVolume("music", 7); // held to 1
    await tick();
    expect(api.busVolume("music")).toBe(1);
    expect(last(fake).music?.value).toBeCloseTo(db(-6), 5);
  });

  test("the master's gain is the sound's volume times the master's level times the player's master volume", async () => {
    const { fake, mixer, api } = make({ ...OPTIONS, scenes: { loud: { buses: { master: { level: 6 } } } } });
    const master = () => fake.of("MASTER_SET").at(-1);
    mixer.volume(0.25); // before the core is up: held
    fake.setUp(true);
    mixer.boot();
    expect(fake.sends[0]?.[0]).toMatchObject({ op: "MASTER_SET", param: 0, slew: 0 });
    expect(master()?.value).toBeCloseTo(0.25, 6);

    const busGains = () => fake.of("BUS_SET").filter((c) => c.param === 0).length;
    api.bus("master").level(-6, 50);
    api.setBusVolume("master", 0.5);
    await tick();
    expect(master()?.value).toBeCloseTo(0.25 * db(-6) * 0.5, 6);
    // The master's own fader: no bus that sums into it is touched.
    expect(busGains()).toBe(0);

    api.scene("loud", { fadeMs: 100 });
    await tick();
    expect(master()?.value).toBeCloseTo(0.25 * db(6) * 0.5, 6);
    expect(master()?.slew).toBe(RATE / 10);

    // The sound's volume lands at once, with no microtask.
    mixer.volume(0.5);
    expect(master()).toMatchObject({ slew: 0 });
    expect(master()?.value).toBeCloseTo(0.5 * db(6) * 0.5, 6);
    expect(busGains()).toBe(0);
    expect(fake.of("BUS_DEFINE").find((c) => c.bus === 3)?.gain).toBe(1);
  });

  test("an effect's settings take the core's units, and a compressor names its key", () => {
    const { fake, mixer } = make({
      buses: {
        music: {
          fx: [
            { kind: "filter", mode: "high", slope: 24, cutoff: 300 },
            { kind: "delay", pingpong: true, time: 0.25 },
            { kind: "compressor", key: "voice", range: 9 },
          ],
        },
      },
    });
    fake.setUp(true);
    mixer.boot();
    expect(fake.of("FX_DEFINE").map((c) => [c.slot, c.kind, c.key])).toEqual([
      [0, FX_KIND.svf, 0],
      [1, FX_KIND.delay, 0],
      [2, FX_KIND.comp, 6],
    ]);
    const set = (slot: number, param: number) =>
      fake.of("FX_SET").find((c) => c.slot === slot && c.param === param);
    expect(set(0, FX_PARAMS.svf.mode)?.value).toBe(1);
    expect(set(0, FX_PARAMS.svf.slope)?.value).toBe(1);
    expect(set(0, FX_PARAMS.svf.cutoff)).toMatchObject({ value: 300, curve: CURVE.exp });
    expect(set(1, FX_PARAMS.delay.pingpong)?.value).toBe(1);
    expect(set(2, FX_PARAMS.comp.range)).toMatchObject({ value: 9, curve: CURVE.lin });
  });

  test("a convolver loads its impulse response once the sample is held", () => {
    const { fake, mixer } = make({ buses: { ambience: { fx: [{ kind: "convolver", ir: "rooms/hall" }] } } });
    fake.setUp(true);
    mixer.boot();
    expect(fake.of("IR_LOAD")).toHaveLength(0);
    mixer.samples();
    expect(fake.of("IR_LOAD")).toHaveLength(0);
    fake.setSample("rooms/hall", 12);
    mixer.samples();
    mixer.samples();
    expect(fake.of("IR_LOAD")).toEqual([expect.objectContaining({ bus: 4, slot: 0, sample: 12 })]);
    mixer.boot();
    expect(fake.of("IR_LOAD")).toHaveLength(2);
  });

  test("a play's hand: the machine's is 6 dB down with 6 dB more send unless the game says otherwise", () => {
    expect(make().mixer.presence(false)).toEqual({ db: -6, sendDb: 6 });
    expect(make().mixer.presence(true)).toEqual({ db: 0, sendDb: 0 });
    expect(make().mixer.presence(undefined)).toEqual({ db: 0, sendDb: 0 });
    const own = make({ presence: { mine: { db: 2, sendDb: -12 } } }).mixer;
    expect(own.presence(true)).toEqual({ db: 2, sendDb: -12 });
    expect(own.presence(false)).toEqual({ db: -6, sendDb: 6 });
  });

  test("a bus graph with a cycle, a scene naming a missing bus and too many buses fail at creation", () => {
    const port = fakePort().port;
    expect(() =>
      createMixer<Bus>({ buses: { bed: { out: "deep" }, deep: { sends: { bed: 0.5 } } } }, port),
    ).toThrow(/cycle/);
    expect(() =>
      createMixer<string>({ scenes: { lost: { buses: { cellar: { level: -3 } } } } }, port),
    ).toThrow(/cellar/);
    expect(() =>
      createMixer<string>({ scenes: { lost: { buses: { music: { fx: { 0: { size: 1 } } } } } } }, port),
    ).toThrow(/size/);
    const many = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`b${i}`, {}]));
    expect(() => createMixer<string>({ buses: many }, port)).toThrow(/15/);
    // A handle on a bus or slot that does not exist does nothing.
    const { api } = make();
    expect(() => api.bus("music").fx(3).set("cutoff", 1)).not.toThrow();
  });

  test("a scene that moves an effect setting its bus never declares warns once, naming it", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const port = fakePort().port;
      const fx = [{ kind: "reverb", size: 0.4 }] as const;
      // `size` is declared, so the scene has something to hand back: no warning.
      createMixer<string>(
        { buses: { hall: { fx } }, scenes: { big: { buses: { hall: { fx: { 0: { size: 1 } } } } } } },
        port,
      );
      expect(warn).not.toHaveBeenCalled();
      // `decay` is not: it would stay where the scene left it.
      createMixer<string>(
        { buses: { hall: { fx } }, scenes: { long: { buses: { hall: { fx: { 0: { decay: 9 } } } } } } },
        port,
      );
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain('"decay" of effect 0 on "hall"');
    } finally {
      warn.mockRestore();
    }
  });

  test("the index of a bus: 0 the master, its place from 1, sfx for a name that is not a bus", () => {
    const { mixer } = make();
    expect(mixer.index("master")).toBe(0);
    expect(mixer.index("music")).toBe(3);
    expect(mixer.index("deep")).toBe(7);
    expect(mixer.index("nowhere")).toBe(1);
    expect(mixer.index(undefined)).toBe(1);
  });
});

describe("the player's sound settings", () => {
  function storage(initial?: string) {
    const items = new Map<string, string>();
    if (initial !== undefined) items.set("game.sound", initial);
    return {
      items,
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
    };
  }

  test("stored volumes and the headphones mode are applied at once, and a change is stored", () => {
    const store = storage(JSON.stringify({ volumes: { music: 0.25, nowhere: 0.5 }, headphones: true }));
    const { api } = make();
    const modes: string[] = [];
    const space = {
      listener: (o: { mode: string }) => void modes.push(o.mode),
      place: () => {},
      resolve: () => ({ pan: 0, distance: 0, occlusion: 0 }),
    };
    const prefs = soundPrefs<Bus>("game.sound", { mixer: api, space }, store);
    expect(prefs.busVolume("music")).toBe(0.25);
    expect(prefs.headphones()).toBe(true);
    expect(modes).toEqual(["headphones"]);
    prefs.setBusVolume("sfx", 3);
    prefs.setHeadphones(false);
    expect(api.busVolume("sfx")).toBe(1);
    expect(modes.at(-1)).toBe("speakers");
    expect(JSON.parse(store.items.get("game.sound") ?? "{}")).toMatchObject({
      volumes: { music: 0.25, sfx: 1 },
      headphones: false,
    });
  });

  test("a stored value that will not parse starts from the defaults", () => {
    const { api } = make();
    const space = {
      listener: () => {},
      place: () => {},
      resolve: () => ({ pan: 0, distance: 0, occlusion: 0 }),
    };
    const prefs = soundPrefs<Bus>("game.sound", { mixer: api, space }, storage("{nope"));
    expect(prefs.busVolume("music")).toBe(1);
    expect(prefs.headphones()).toBe(false);
  });
});
