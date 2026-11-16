import { describe, expect, spyOn, test } from "bun:test";
import { createMusic, ROLL_DOUBLINGS } from "../../src/sound/music/arranger";
import { createHarmony } from "../../src/sound/music/harmony";
import { createTransport } from "../../src/sound/music/transport";
import type { HeldSample, SoundHost } from "../../src/sound/port";
import type { GenDef, GenKind, PackManifest, PlayOptions } from "../../src/sound/types";
import { fakePort } from "./fake-port";

// At 48 kHz and 120 bpm a beat is 24,000 frames and a 4/4 bar 96,000.
const PACK: PackManifest = {
  name: "score",
  tempo: 120,
  key: "Am",
  samples: {
    bed: { url: "bed.ogg", seconds: 8, channels: 2, lufs: -16, peak: -1, kind: "loop", bars: 4 },
    lead: { url: "lead.ogg", seconds: 4, channels: 2, lufs: -16, peak: -1, kind: "loop" },
    "lead-b": { url: "lead-b.ogg", seconds: 4, channels: 2, lufs: -16, peak: -1, kind: "loop" },
    heat: { url: "heat.ogg", seconds: 4, channels: 2, lufs: -16, peak: -1, kind: "loop" },
  },
};

const SECTIONS = {
  calm: { stems: { bed: 1 } },
  busy: { stems: { bed: 0.5, lead: 1 }, harmony: { key: "C" } },
};

interface FakeGen {
  kind: GenKind;
  def: GenDef<string>;
  sets: { settings: Readonly<Record<string, number>>; slewMs: number | undefined }[];
  stops: (number | undefined)[];
}

function stage({ loaded = true, holding = ["bed", "lead"] }: { loaded?: boolean; holding?: string[] } = {}) {
  const fake = fakePort();
  fake.bringUp();
  const transport = createTransport(fake.port);
  const harmony = createHarmony(transport, fake.port);
  const manifests = new Map<string, PackManifest>(loaded ? [["score", PACK]] : []);
  const held = new Map<string, HeldSample>(
    holding.map((stem, i) => [`score/${stem}`, { id: 10 + i, frames: 1, rate: 48000, scale: 2 }]),
  );
  const gens: FakeGen[] = [];
  const plays: [string, (PlayOptions & { when?: string }) | undefined][] = [];
  const host: SoundHost = {
    port: fake.port,
    bus: (name) => (name === "music" ? 3 : 1),
    held: (key) => held.get(key) ?? null,
    manifest: (pack) => manifests.get(pack) ?? null,
    loadPack: async (name) => {
      manifests.set(name, PACK);
    },
    play: (key, options) => {
      plays.push([key, options]);
      return null;
    },
    voice: () => null,
    place: () => ({ pan: 0, distance: 0, occlusion: 0 }),
    gen: (kind, def = {}) => {
      const gen: FakeGen = { kind, def, sets: [], stops: [] };
      gens.push(gen);
      return {
        set: (settings, slewMs) => void gen.sets.push({ settings, slewMs }),
        stop: (releaseMs) => void gen.stops.push(releaseMs),
      };
    },
    transport,
    harmony,
  };
  return { fake, host, held, gens, plays, transport, harmony };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("arranger", () => {
  test("its first use loads the pack, sets the clock and the key, and starts a loop per stem that sounds", async () => {
    const { fake, host, transport, harmony } = stage();
    const music = createMusic({ pack: "score", stems: ["bed", "lead"], sections: SECTIONS }, host);
    expect(fake.of("LOOP_START")).toHaveLength(0);
    music.section("calm");
    await tick();
    expect(transport.running()).toBe(true);
    expect(transport.bpm()).toBe(120);
    expect(harmony.api.current().key).toBe("Am");
    const starts = fake.of("LOOP_START");
    // The section leaves the lead out, so the lead holds no loop yet.
    expect(starts.map((s) => s.slot)).toEqual([0]);
    expect(starts[0]).toMatchObject({ sample: 10, bus: 3, gain: 2, bars: 4 });
    // Bars from the seconds at the score's tempo when the manifest has none.
    music.layer("lead", 1);
    expect(fake.of("LOOP_START")[1]).toMatchObject({ slot: 1, bars: 2 });
  });

  test("a section change sends loop level sets stamped at the next bar", async () => {
    const { fake, host } = stage();
    const music = createMusic({ pack: "score", stems: ["bed", "lead"], sections: SECTIONS }, host);
    music.section("calm", { when: "off" });
    await tick();
    // Raised from nothing, a loop starts silent and fades from the next frame.
    expect(fake.of("LOOP_START").map((s) => s.level)).toEqual([0]);
    expect(fake.of("LOOP_SET")).toEqual([expect.objectContaining({ slot: 0, level: 1, atFrame: 1 })]);
    fake.advance(2.6); // bar 1, beat 1.2
    fake.clear();
    music.section("busy");
    const sets = fake.of("LOOP_SET");
    expect(sets).toHaveLength(2);
    for (const set of sets) expect(set).toMatchObject({ atFrame: 192_000, beats: 4 });
    expect(sets.map((s) => [s.slot, s.level])).toEqual([
      [0, 0.5],
      [1, 1],
    ]);
  });

  test("a section's harmony lands on the same line as its levels", async () => {
    const { fake, host, harmony } = stage();
    const music = createMusic({ pack: "score", stems: ["bed", "lead"], sections: SECTIONS }, host);
    music.section("calm", { when: "off" });
    await tick();
    fake.advance(0.5);
    music.section("busy");
    expect(harmony.api.current().key).toBe("Am");
    fake.advance(1.5);
    expect(harmony.api.current().key).toBe("C");
  });

  test("section called twice before the bar: the last wins", async () => {
    const { fake, host } = stage();
    const music = createMusic({ pack: "score", stems: ["bed", "lead"], sections: SECTIONS }, host);
    music.section("calm", { when: "off" });
    await tick();
    fake.advance(0.6);
    fake.clear();
    music.section("busy");
    music.section("calm");
    // What the core is left with at the bar line, per loop: the last record stamped there.
    const atBar = (slot: number) =>
      fake
        .of("LOOP_SET")
        .filter((s) => s.slot === slot && s.atFrame === 96_000)
        .at(-1);
    expect(atBar(0)?.level).toBe(1);
    expect(atBar(1)?.level).toBe(0);

    // Overruled by a call landing sooner: its levels go on the sooner line and on the overruled one.
    fake.clear();
    music.section("busy");
    music.section("calm", { when: "4" });
    expect(atBar(0)?.level).toBe(1);
    expect(atBar(1)?.level).toBe(0);
    expect(
      fake
        .of("LOOP_SET")
        .filter((s) => s.atFrame === 48_000)
        .map((s) => s.level),
    ).toEqual([1, 0]);
  });

  test("layer moves one stem now, over a beat, until the next section", async () => {
    const { fake, host } = stage();
    const music = createMusic({ pack: "score", stems: ["bed", "lead"], sections: SECTIONS }, host);
    music.section("calm", { when: "off" });
    await tick();
    fake.clear();
    music.layer("lead", 0.7);
    expect(fake.of("LOOP_SET")).toEqual([
      { op: "LOOP_SET", atFrame: 1, slot: 1, level: expect.closeTo(0.7, 5), beats: 1 },
    ]);
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    music.layer("nope", 1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test("a stem held late starts at the level the score is at, with what is stamped ahead", async () => {
    const { fake, host, held } = stage({ holding: ["bed"] });
    const music = createMusic({ pack: "score", stems: ["bed", "lead"], sections: SECTIONS }, host);
    music.section("busy", { when: "off" });
    await tick();
    expect(fake.of("LOOP_START").map((s) => s.slot)).toEqual([0]);
    fake.advance(0.5);
    music.section("calm");
    held.set("score/lead", { id: 20, frames: 1, rate: 48000, scale: 1 });
    fake.clear();
    fake.emit({ op: "SAMPLE_READY", frame: 0, sample: 20 });
    expect(fake.of("LOOP_START")).toEqual([expect.objectContaining({ slot: 1, sample: 20, level: 1 })]);
    expect(fake.of("LOOP_SET")).toEqual([expect.objectContaining({ slot: 1, level: 0, atFrame: 96_000 })]);
  });

  test("what is asked before the core is up is sent from when it comes up", async () => {
    const fake = fakePort();
    const { host } = stage();
    const down: SoundHost = { ...host, port: fake.port };
    const music = createMusic({ pack: "score", stems: ["bed", "lead"], sections: SECTIONS }, down);
    music.section("busy");
    await tick();
    expect(fake.sent()).toHaveLength(0);
    fake.bringUp();
    expect(fake.of("LOOP_START").map((s) => s.slot)).toEqual([0, 1]);
    expect(fake.of("LOOP_SET").map((s) => s.level)).toEqual([0.5, 1]);
  });

  test("tension builds a riser of three generators; crossing 0.5 doubles the roll's rate", () => {
    const { host, gens } = stage();
    const music = createMusic(
      { pack: "score", stems: ["bed"], sections: { calm: { stems: { bed: 1 } } }, riser: { level: -12 } },
      host,
    );
    music.tension(0.4);
    expect(gens.map((g) => g.kind)).toEqual(["noise", "motor", "noise"]);
    for (const gen of gens) expect(gen.def).toMatchObject({ bus: "music", level: -12 });
    const roll = gens[2];
    const first = roll?.def.params?.grid ?? 0;
    expect(first).toBeGreaterThan(0);
    const grids = () =>
      (roll?.sets ?? []).flatMap((s) => (s.settings.grid === undefined ? [] : [s.settings.grid]));
    music.tension(0.45);
    expect(grids()).toEqual([]);
    music.tension(0.55);
    expect(grids()).toEqual([first * 2]);
    music.tension(0.8);
    music.tension(0.95);
    expect(grids()).toEqual([first * 2, first * 4, first * 8]);
    expect(ROLL_DOUBLINGS).toEqual([0.5, 0.75, 0.9]);
    // The sweep climbs with it.
    const centres = (gens[0]?.sets ?? []).map((s) => s.settings.centre ?? 0);
    expect(centres).toEqual([...centres].sort((a, b) => a - b));
    music.tension(0);
    for (const gen of gens) expect(gen.stops).toHaveLength(1);
    music.tension(0.3);
    expect(gens).toHaveLength(6);
  });

  test("the next section lets the riser go over the time left to its line", async () => {
    const { fake, host, gens } = stage();
    const music = createMusic({ pack: "score", stems: ["bed", "lead"], sections: SECTIONS }, host);
    music.section("calm", { when: "off" });
    await tick();
    music.tension(0.7);
    fake.advance(1); // two beats before the bar
    music.section("busy");
    for (const gen of gens) expect(gen.stops).toEqual([1000]);
  });

  test("a stinger plays its cue on the grid", () => {
    const { host, plays } = stage();
    const music = createMusic(
      { pack: "score", stems: ["bed"], sections: { calm: { stems: { bed: 1 } } } },
      host,
    );
    music.stinger("hit");
    music.stinger("hit", { when: "bar" });
    expect(plays).toEqual([
      ["hit", { when: "4" }],
      ["hit", { when: "bar" }],
    ]);
  });

  test("stop ends every loop on the bar, and a later section starts them again", async () => {
    const { fake, host } = stage();
    const music = createMusic({ pack: "score", stems: ["bed", "lead"], sections: SECTIONS }, host);
    music.section("busy", { when: "off" });
    await tick();
    fake.advance(0.5);
    fake.clear();
    music.stop();
    expect(fake.of("LOOP_STOP")).toEqual([
      expect.objectContaining({ slot: 0, atFrame: 96_000 }),
      expect.objectContaining({ slot: 1, atFrame: 96_000 }),
    ]);
    // Restarted before the stop has faded: the stems take other slots, so the stamped stops do not end them.
    music.section("calm", { when: "off" });
    await tick();
    expect(fake.of("LOOP_START").map((s) => s.slot)).toEqual([2]);
  });

  test("a take plays in its stem's place from the bar, at the stem's level, and the old take gives its slot back", async () => {
    const { fake, host } = stage({ holding: ["bed", "lead", "lead-b"] });
    const music = createMusic(
      { pack: "score", stems: ["bed", "lead"], takes: { lead: ["lead-b", "lead-c"] }, sections: SECTIONS },
      host,
    );
    music.section("busy", { when: "off" });
    await tick();
    fake.advance(0.5);
    fake.clear();
    music.take("lead", 1);
    // The second take starts silent; on the bar the first falls to nothing and the second takes its level.
    expect(fake.of("LOOP_START")).toEqual([expect.objectContaining({ slot: 2, sample: 12, level: 0 })]);
    expect(fake.of("LOOP_SET").map((s) => [s.slot, s.level, s.atFrame])).toEqual([
      [1, 0, 96_000],
      [2, 1, 96_000],
    ]);
    // A take the pack does not hold is left out: the stem stays where it is.
    music.take("lead", 2);
    fake.advance(2);
    fake.clear();
    // The next section moves the take that plays, and the silent one's loop is ended.
    music.section("calm");
    expect(fake.of("LOOP_STOP")).toEqual([expect.objectContaining({ slot: 1 })]);
    expect(fake.of("LOOP_SET").map((s) => [s.slot, s.level])).toEqual([
      [0, 1],
      [2, 0],
    ]);
  });

  test("no section moves a layer, and one the pack lacks is silent", async () => {
    const { fake, host } = stage({ holding: ["bed", "lead", "heat"] });
    const music = createMusic(
      { pack: "score", stems: ["bed", "lead"], layers: ["heat", "page"], sections: SECTIONS },
      host,
    );
    music.section("calm", { when: "off" });
    await tick();
    music.layer("heat", 0.6);
    music.layer("page", 1);
    expect(fake.of("LOOP_START").map((s) => s.sample)).toEqual([10, 12]);
    fake.advance(1);
    fake.clear();
    music.section("busy");
    expect(fake.of("LOOP_SET").map((s) => s.slot)).toEqual([0, 2]);
    expect(fake.of("LOOP_STOP")).toHaveLength(0);
  });

  test("a section naming a stem the score does not list, or a stem the loaded pack lacks, throws at music()", () => {
    const { host } = stage();
    expect(() =>
      createMusic({ pack: "score", stems: ["bed"], sections: { calm: { stems: { pad: 1 } } } }, host),
    ).toThrow(/pad/);
    expect(() =>
      createMusic({ pack: "score", stems: ["bed", "pad"], sections: { calm: { stems: { bed: 1 } } } }, host),
    ).toThrow(/pad/);
  });

  test("a pack that fails to load warns once and still starts the clock", async () => {
    const { host, transport } = stage({ loaded: false });
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    const failing: SoundHost = { ...host, loadPack: () => Promise.reject(new Error("gone")) };
    createMusic(
      { pack: "score", stems: ["bed"], sections: { calm: { stems: { bed: 1 } } } },
      failing,
    ).section("calm");
    await tick();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(transport.running()).toBe(true);
    warn.mockRestore();
  });
});
