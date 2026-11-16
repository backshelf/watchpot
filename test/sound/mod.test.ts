// The mod matrix over a real mixer and a fake core port that records what is sent.
import { describe, expect, test } from "bun:test";
import { createMixer } from "../../src/sound/mixer";
import { createMod, mapRoute } from "../../src/sound/mod";
import type { CorePort } from "../../src/sound/port";
import { decodeCommands, FX_PARAMS, type SoundCommand } from "../../src/sound/protocol";
import type { DefaultBus, ModRoute } from "../../src/sound/types";

const RATE = 48000;

function fakePort() {
  let up = false;
  const sends: SoundCommand[][] = [];
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
    sample: () => 0,
  };
  return {
    port,
    sends,
    of: <O extends SoundCommand["op"]>(op: O) =>
      sends.flat().filter((c): c is Extract<SoundCommand, { op: O }> => c.op === op),
    setUp: (value: boolean) => {
      up = value;
    },
  };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const db = (n: number) => 10 ** (n / 20);

type Bus = DefaultBus | "room";

function make(routes: ModRoute<Bus>[] = []) {
  const fake = fakePort();
  const mixer = createMixer<Bus>(
    {
      buses: { room: { fx: [{ kind: "filter", cutoff: 5000 }] } },
      scenes: { dim: { buses: { room: { fx: { 0: { cutoff: 2000 } } } } } },
    },
    fake.port,
  );
  const mod = createMod<Bus>({ routes }, mixer, fake.port);
  fake.setUp(true);
  mixer.boot();
  mod.boot();
  return { fake, mixer, mod: mod.api };
}

const cutoff = (fake: ReturnType<typeof fakePort>) =>
  fake
    .of("FX_SET")
    .filter((c) => c.bus === 6 && c.param === FX_PARAMS.svf.cutoff)
    .at(-1);

describe("the mod matrix", () => {
  test("ten sets of a source in one frame send one record", async () => {
    const { fake, mod } = make([
      { from: "heat", to: { bus: "room", fx: 0, param: "cutoff" }, range: [200, 8000] },
    ]);
    await tick();
    const before = fake.sends.length;
    for (let i = 1; i <= 10; i++) mod.source("heat").set(i / 10);
    await tick();
    expect(fake.sends).toHaveLength(before + 1);
    expect(fake.sends.at(-1)).toHaveLength(1);
    expect(cutoff(fake)?.value).toBeCloseTo(8000, 1);
    expect(cutoff(fake)?.slew).toBe(Math.round(0.03 * RATE));
  });

  test("an exp route maps the midpoint below the linear midpoint, log above, s on it", () => {
    for (const range of [
      [200, 8000],
      [-12, 0],
    ] as const) {
      const linear = mapRoute("lin", 0.5, range);
      expect(mapRoute("exp", 0.5, range)).toBeLessThan(linear);
      expect(mapRoute("log", 0.5, range)).toBeGreaterThan(linear);
      expect(mapRoute("s", 0.5, range)).toBeCloseTo(linear, 9);
      for (const curve of ["lin", "exp", "log", "s"] as const) {
        expect(mapRoute(curve, 0, range)).toBeCloseTo(range[0], 9);
        expect(mapRoute(curve, 1, range)).toBeCloseTo(range[1], 9);
      }
    }
    // Geometric where the range is above zero: equal ratios per step.
    expect(mapRoute("exp", 0.5, [200, 8000])).toBeCloseTo(Math.sqrt(200 * 8000), 6);
  });

  test("an exp route sends its midpoint below the linear one", async () => {
    const { fake, mod } = make([
      { from: "heat", to: { bus: "room", fx: 0, param: "cutoff" }, range: [200, 8000], curve: "exp" },
    ]);
    mod.source("heat").set(0.5);
    await tick();
    expect(cutoff(fake)?.value).toBeLessThan(4100);
    expect(cutoff(fake)?.value).toBeCloseTo(1265, -1);
  });

  test("two routes to one target sum", async () => {
    const { fake, mod } = make();
    mod.route({ from: "a", to: { bus: "music", level: true }, range: [0, -6] });
    mod.route({ from: "b", to: { bus: "music", level: true }, range: [0, -12] });
    mod.source("a").set(1);
    mod.source("b").set(0.5);
    await tick();
    const gain = fake
      .of("BUS_SET")
      .filter((c) => c.bus === 3 && c.param === 0)
      .at(-1);
    expect(gain?.value).toBeCloseTo(db(-12), 5);
  });

  test("while a route drives a target the scene waits underneath, and returns when the route goes", async () => {
    const { fake, mixer, mod } = make();
    mixer.api.scene("dim", { fadeMs: 0 });
    await tick();
    expect(cutoff(fake)?.value).toBeCloseTo(2000, 1);
    const off = mod.route({ from: "heat", to: { bus: "room", fx: 0, param: "cutoff" }, range: [400, 900] });
    mod.source("heat").set(1);
    mixer.api.scene("dim", { fadeMs: 0 });
    mixer.api.bus("room").fx(0).set("cutoff", 100);
    await tick();
    expect(cutoff(fake)?.value).toBeCloseTo(900, 1);
    off();
    off();
    await tick();
    expect(cutoff(fake)?.value).toBeCloseTo(2000, 1);
  });

  test("a send is a target, and a route to something that does not exist throws", () => {
    const { fake, mod } = make();
    mod.route({ from: "wet", to: { bus: "sfx", send: "room" }, range: [0, 1] });
    expect(fake.of("BUS_SET").filter((c) => c.param === 2)).toHaveLength(0);
    expect(() =>
      mod.route({ from: "x", to: { bus: "room", fx: 2, param: "cutoff" }, range: [0, 1] }),
    ).toThrow();
    expect(() =>
      mod.route({ from: "x", to: { bus: "room", fx: 0, param: "size" }, range: [0, 1] }),
    ).toThrow();
    expect(() => mod.route({ from: "x", to: { bus: "room", send: "room" }, range: [0, 1] })).toThrow();
    expect(() => make([{ from: "x", to: { bus: "nowhere" as Bus, level: true }, range: [0, 1] }])).toThrow(
      /nowhere/,
    );
  });
});
