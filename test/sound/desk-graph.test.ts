// The second mix desk over a mixer and a fake core port: effects named and moved, a chain defined again, an effect
// switched off by a scene, buses made and pointed, the graph through a file, the desk's own keys by scene, copying a
// scene, and undo.
import { describe, expect, test } from "bun:test";
import { createDesk, tunable } from "../../src/sound/desk";
import { createMixer, type MixerOptions } from "../../src/sound/mixer";
import { FX_KIND, FX_PARAMS } from "../../src/sound/protocol";
import type { DefaultBus } from "../../src/sound/types";
import { fakePort } from "./fake-port";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const db = (n: number) => 10 ** (n / 20);

type Bus = DefaultBus | "verb" | "group";

// `sfx` sums into `group`; its filter is named, its saturator is not. `music` ducks under `sfx`.
const OPTIONS: MixerOptions<Bus> = {
  buses: {
    group: {},
    sfx: {
      out: "group",
      level: -3,
      fx: [
        { kind: "filter", id: "tone", cutoff: 8000 },
        { kind: "saturator", drive: 3 },
      ],
    },
    ui: { sends: { verb: 0.3 } },
    music: { fx: [{ kind: "compressor", id: "duck", key: "sfx", range: 6 }] },
    verb: { fx: [{ kind: "reverb", decay: 2 }] },
  },
  scenes: {
    one: { label: "One", buses: { sfx: { fx: { tone: { cutoff: 2000 } } } } },
    two: { buses: { music: { fx: { duck: { range: 12 } } } } },
  },
};

function rig() {
  const fake = fakePort();
  const mixer = createMixer<Bus>(OPTIONS, fake.port);
  const { desk } = createDesk({ mixer: mixer.desk, port: fake.port, audition: () => undefined });
  fake.bringUp();
  mixer.boot();
  fake.clear();
  const at = (name: string) => mixer.index(name);
  const gains = (bus: string) =>
    fake
      .of("BUS_SET")
      .filter((c) => c.bus === at(bus) && c.param === 0)
      .map((c) => c.value);
  return { fake, mixer, desk, at, gains };
}

describe("an effect's name", () => {
  test("its declared place and its id are one key, and both reach it wherever it has been moved", async () => {
    const { fake, desk, at } = rig();
    desk.set("mix", "fx:sfx:0:cutoff", 3000);
    expect(desk.file().layers?.mix).toEqual({ "fx:sfx:tone:cutoff": 3000 });
    await tick();
    fake.clear();

    expect(desk.fxMove("sfx", "tone", 1)).toBe(true);
    // Both slots are defined again, and the filter's settings follow it to its new slot.
    expect(fake.of("FX_DEFINE").map((c) => [c.slot, c.kind])).toEqual([
      [0, FX_KIND.sat],
      [1, FX_KIND.svf],
    ]);
    const cutoff = fake.of("FX_SET").find((c) => c.slot === 1 && c.param === FX_PARAMS.svf.cutoff);
    expect(cutoff?.value).toBeCloseTo(3000);
    expect(
      desk
        .buses()
        .find((b) => b.name === "sfx")
        ?.fx.map((f) => [f.slot, f.id]),
    ).toEqual([
      [0, "1"],
      [1, "tone"],
    ]);

    fake.clear();
    desk.set("mix", "fx:sfx:0:cutoff", 500);
    await tick();
    expect(fake.of("FX_SET").at(-1)).toMatchObject({ bus: at("sfx"), slot: 1, param: FX_PARAMS.svf.cutoff });
  });

  test("an effect the desk adds is in the file with its kind, and takes its settings with it when removed", async () => {
    const { desk } = rig();
    const id = desk.fxAdd("sfx", "eq");
    expect(id).toBe("eq-1");
    desk.set("mix", "fx:sfx:eq-1:lowGain", -4);
    expect(desk.file().graph?.buses?.sfx).toEqual({
      fx: [{ id: "tone" }, { id: "1" }, { id: "eq-1", kind: "eq" }],
    });
    expect(desk.fxRemove("sfx", "eq-1")).toBe(true);
    expect(desk.file()).toEqual({ version: 2 });
    desk.undo();
    expect(desk.file().layers?.mix).toEqual({ "fx:sfx:eq-1:lowGain": -4 });
    expect(
      desk
        .buses()
        .find((b) => b.name === "sfx")
        ?.fx.map((f) => f.id),
    ).toEqual(["tone", "1", "eq-1"]);
  });

  test("a declared effect taken out is sent nothing, and comes back with what its scene says", async () => {
    const { fake, mixer, desk } = rig();
    expect(desk.fxRemove("sfx", "tone")).toBe(true);
    expect(desk.file().graph?.buses?.sfx).toEqual({ fx: [{ id: "1" }], drop: ["tone"] });
    fake.clear();
    mixer.api.scene("one");
    await tick();
    expect(fake.of("FX_SET")).toEqual([]);

    // It is listed as taken out, and comes back in its declared place.
    expect(desk.buses().find((b) => b.name === "sfx")?.dropped).toEqual([{ id: "tone", kind: "filter" }]);
    expect(desk.fxRestore("sfx", "1")).toBe(false);
    expect(desk.fxRestore("sfx", "tone")).toBe(true);
    expect(desk.buses().find((b) => b.name === "sfx")).toMatchObject({ dropped: [] });
    expect(desk.file().graph).toBeUndefined();
    expect(fake.of("FX_DEFINE").map((c) => [c.slot, c.kind])).toEqual([
      [0, FX_KIND.svf],
      [1, FX_KIND.sat],
    ]);
    const cutoff = fake.of("FX_SET").find((c) => c.slot === 0 && c.param === FX_PARAMS.svf.cutoff);
    expect(cutoff?.value).toBeCloseTo(2000);
  });

  test("on and off is a setting a scene can hold, and is said again to a chain defined again", async () => {
    const { fake, mixer, desk, at } = rig();
    desk.set("scene:two", "fx:music:duck:on", 0);
    await tick();
    expect(fake.of("FX_ON")).toEqual([]);
    expect(desk.get("live", "fx:music:duck:on")).toBe(1);

    mixer.api.scene("two");
    await tick();
    expect(fake.of("FX_ON").at(-1)).toMatchObject({ bus: at("music"), slot: 0, value: 0 });
    // Never a cut: the core fades it over at least 10 ms.
    expect(fake.of("FX_ON").at(-1)?.slew).toBeGreaterThanOrEqual(480);
    expect(desk.owner("fx:music:duck:on")).toBe("scene:two");

    fake.clear();
    desk.fxAdd("music", "eq", 0);
    // A slot defined again starts on: the duck, now second, is switched off again after its define.
    const ops = fake.sent().map((c) => c.op);
    const off = fake.of("FX_ON").at(-1);
    expect(off).toMatchObject({ bus: at("music"), slot: 1, value: 0 });
    expect(ops.lastIndexOf("FX_ON")).toBeGreaterThan(ops.lastIndexOf("FX_DEFINE"));

    mixer.api.scene("one");
    await tick();
    expect(fake.of("FX_ON").at(-1)).toMatchObject({ slot: 1, value: 1 });
  });
});

describe("the desk's buses", () => {
  test("a bus is made, summed into and keyed to; a loop and a bus in use are refused", () => {
    const { fake, desk, at } = rig();
    expect(desk.addBus("drums")).toBe(true);
    expect(desk.addBus("drums")).toBe(false);
    expect(desk.addBus("no:colon")).toBe(false);
    expect(desk.buses().find((b) => b.name === "drums")).toMatchObject({ made: true, out: "master" });

    // `sfx` sums into `group`: `group` into `sfx` would feed itself.
    expect(desk.setOut("group", "sfx")).toBe(false);
    expect(desk.setOut("sfx", "drums")).toBe(true);
    expect(fake.of("BUS_DEFINE").at(-1)).toMatchObject({ bus: at("sfx"), out: at("drums") });
    expect(desk.removeBus("drums")).toBe(false);
    expect(desk.setOut("sfx", "group")).toBe(true);

    expect(desk.fxKey("music", "duck", "drums")).toBe(true);
    expect(fake.of("FX_DEFINE").at(-1)).toMatchObject({ bus: at("music"), slot: 0, key: at("drums") + 1 });
    expect(desk.file().graph?.buses).toEqual({
      drums: { made: true },
      music: { fx: [{ id: "duck", key: "drums" }] },
    });
    expect(desk.removeBus("drums")).toBe(false);
    expect(desk.fxKey("music", "duck", "sfx")).toBe(true);
    expect(desk.removeBus("drums")).toBe(true);
    expect(desk.removeBus("sfx")).toBe(false);
    expect(desk.file()).toEqual({ version: 2 });
  });

  test("the structure comes back through a file, and a second load of it defines nothing", async () => {
    const first = rig();
    first.desk.addBus("drums", { out: "group" });
    first.desk.fxAdd("drums", "delay");
    first.desk.fxMove("sfx", "tone", 1);
    first.desk.fxRemove("verb", "0");
    first.desk.set("mix", "level:drums", -4);
    first.desk.set("scene:one", "fx:drums:delay-1:time", 0.5);
    first.desk.route("cue:kick", "drums");
    const file = first.desk.file();

    const second = rig();
    second.desk.load(JSON.parse(JSON.stringify(file)));
    expect(second.desk.file()).toEqual(file);
    expect(second.desk.dirty()).toBe(false);
    expect(second.desk.buses().find((b) => b.name === "drums")).toMatchObject({ made: true, out: "group" });
    expect(second.desk.channels().find((c) => c.id === "cue:kick")?.route).toBe("drums");

    await tick();
    second.fake.clear();
    second.desk.load(JSON.parse(JSON.stringify(file)));
    await tick();
    expect(second.fake.of("FX_DEFINE")).toEqual([]);
    expect(second.fake.of("BUS_DEFINE")).toEqual([]);
  });
});

describe("a bus that takes another's player volume", () => {
  test("it is turned down with that bus on top of its own, through the file and undo", async () => {
    const { mixer, desk, gains } = rig();
    desk.addBus("drums");
    expect(desk.setVolume("drums", "music")).toBe(true);
    expect(desk.setVolume("drums", "drums")).toBe(false);
    expect(desk.setVolume("drums", "nowhere")).toBe(false);
    expect(desk.buses().find((b) => b.name === "drums")?.volume).toBe("music");
    expect(desk.file().graph?.buses?.drums).toEqual({ made: true, volume: "music" });

    mixer.api.setBusVolume("music", 0.5);
    await tick();
    expect(gains("drums").at(-1)).toBeCloseTo(0.5);
    expect(gains("music").at(-1)).toBeCloseTo(0.5);
    // Its own volume still counts, and another bus's does not reach it.
    mixer.api.setBusVolume("drums" as Bus, 0.5);
    mixer.api.setBusVolume("ui", 0.1);
    await tick();
    expect(gains("drums").at(-1)).toBeCloseTo(0.25);
    mixer.api.setBusVolume("drums" as Bus, 1);

    const file = desk.file();
    desk.undo();
    await tick();
    expect(gains("drums").at(-1)).toBeCloseTo(1);
    expect(desk.buses().find((b) => b.name === "drums")?.volume).toBeNull();

    const second = rig();
    second.desk.load(JSON.parse(JSON.stringify(file)));
    second.mixer.api.setBusVolume("music", 0.25);
    await tick();
    expect(second.gains("drums").at(-1)).toBeCloseTo(0.25);
    expect(second.desk.file()).toEqual(file);
  });

  test("a bus declares it, and the desk can take it away", async () => {
    const fake = fakePort();
    const mixer = createMixer<DefaultBus | "stems" | "beat">(
      { buses: { stems: {}, beat: { volume: "stems" } } },
      fake.port,
    );
    const { desk } = createDesk({ mixer: mixer.desk, port: fake.port, audition: () => undefined });
    fake.bringUp();
    mixer.boot();
    const beat = () =>
      fake
        .of("BUS_SET")
        .filter((c) => c.bus === mixer.index("beat") && c.param === 0)
        .at(-1)?.value;
    mixer.api.setBusVolume("stems", 0.5);
    await tick();
    expect(beat()).toBeCloseTo(0.5);
    expect(desk.file()).toEqual({ version: 2 });
    expect(desk.setVolume("beat", null)).toBe(true);
    await tick();
    expect(beat()).toBeCloseTo(1);
    expect(desk.file().graph?.buses).toEqual({ beat: { volume: null } });
    expect(() =>
      createMixer<DefaultBus | "beat">({ buses: { beat: { volume: "nowhere" as "beat" } } }, fakePort().port),
    ).toThrow(/volume/);
  });
});

describe("the desk's own keys by scene", () => {
  test("a bus's trim is the topmost scene's that says one, else the mix's", async () => {
    const { mixer, desk, gains } = rig();
    desk.set("mix", "trim:sfx", -2);
    desk.set("scene:one", "trim:sfx", -6);
    await tick();
    expect(gains("sfx").at(-1)).toBeCloseTo(db(-5));
    mixer.api.scene("one");
    await tick();
    expect(gains("sfx").at(-1)).toBeCloseTo(db(-9));
    expect(desk.owner("trim:sfx")).toBe("scene:one");
    expect(desk.buses().find((b) => b.name === "sfx")?.trim).toBe(-6);
    // A scene pushed over it that says nothing leaves it; the scene going leaves the mix's.
    const pop = mixer.api.scene.push("two");
    await tick();
    expect(gains("sfx").at(-1)).toBeCloseTo(db(-9));
    pop();
    mixer.api.scene("two");
    await tick();
    expect(gains("sfx").at(-1)).toBeCloseTo(db(-5));
    // In a scene a trim of 0 is said; in the mix it is no trim.
    desk.set("scene:two", "trim:sfx", 0);
    await tick();
    expect(gains("sfx").at(-1)).toBeCloseTo(db(-3));
    expect(desk.file().layers?.["scene:two"]).toEqual({ "trim:sfx": 0 });
  });

  test("a tunable follows the scene in force and returns to what the code declares", () => {
    const { mixer, desk } = rig();
    const heard: number[] = [];
    const read = tunable("graph-test.depth", 3, { group: "test", label: "depth", min: 0, max: 24 }, (v) =>
      heard.push(v),
    );
    desk.set("mix", "tune:graph-test.depth", 5);
    desk.set("scene:one", "tune:graph-test.depth", 9);
    expect(read()).toBe(5);
    mixer.api.scene("one");
    expect(read()).toBe(9);
    expect(desk.owner("tune:graph-test.depth")).toBe("scene:one");
    expect(desk.get("live", "tune:graph-test.depth")).toBe(9);
    mixer.api.scene("two");
    expect(read()).toBe(5);
    desk.tune("graph-test.depth", undefined);
    expect(read()).toBe(3);
    expect(desk.owner("tune:graph-test.depth")).toBe("default");
    expect(heard).toEqual([5, 9, 5, 3]);
  });

  test("copying a scene to another makes the second say what the first does, and no more", () => {
    const { desk } = rig();
    desk.set("scene:one", "level:ui", -4);
    desk.set("scene:one", "trim:music", -3);
    desk.set("scene:two", "trim:verb", 2);
    desk.copyLayer("scene:one", "scene:two");
    expect(desk.get("scene:two", "level:ui")).toBe(-4);
    expect(desk.get("scene:two", "trim:music")).toBe(-3);
    expect(desk.get("scene:two", "trim:verb")).toBeUndefined();
    // What the first declares in code, the second now says too.
    expect(desk.get("scene:two", "fx:sfx:tone:cutoff")).toBe(2000);
    // What only the second declared goes back to the mix's value.
    expect(desk.get("scene:two", "fx:music:duck:range")).toBe(6);
    desk.undo();
    expect(desk.get("scene:two", "level:ui")).toBeUndefined();
    expect(desk.get("scene:two", "trim:verb")).toBe(2);
  });
});

describe("undo", () => {
  test("a key moved in a run is one step; steps walk back and forward through the file", () => {
    const { fake, desk } = rig();
    expect(desk.canUndo()).toBe(false);
    desk.set("mix", "level:ui", -1);
    desk.set("mix", "level:ui", -2);
    desk.set("mix", "level:ui", -3);
    fake.advance(1);
    desk.set("mix", "level:ui", -4);
    desk.set("mix", "level:music", -6);
    // A write that is refused is no step.
    desk.set("mix", "level:nowhere", -6);

    desk.undo();
    expect(desk.file().layers?.mix).toEqual({ "level:ui": -4 });
    desk.undo();
    expect(desk.file().layers?.mix).toEqual({ "level:ui": -3 });
    desk.undo();
    expect(desk.file()).toEqual({ version: 2 });
    expect(desk.canUndo()).toBe(false);
    desk.redo();
    desk.redo();
    expect(desk.file().layers?.mix).toEqual({ "level:ui": -4 });
    // A new change ends what could be redone.
    desk.set("mix", "level:voice", -1);
    expect(desk.canRedo()).toBe(false);
  });
});
