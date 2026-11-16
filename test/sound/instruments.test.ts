// Grain clouds and generators as the shell holds them: started once the core is up (and, for a cloud, once its
// sample is held), with everything set before then sent behind the start.
import { describe, expect, spyOn, test } from "bun:test";
import { createInstruments } from "../../src/sound/instruments";
import type { SoundHost } from "../../src/sound/port";
import { GEN_KIND, GEN_PARAMS, GRAIN_PARAM, LIMITS } from "../../src/sound/protocol";
import { fakePort } from "./fake-port";

function setup() {
  const fake = fakePort();
  const buses = ["sfx", "ui", "music", "ambience", "voice"];
  const host = {
    port: fake.port,
    bus: (name: string | undefined) => (name === undefined ? 1 : buses.indexOf(name) + 1 || 1),
    // Every held sample was normalised up by four: its scale restores a quarter.
    held: (key: string) =>
      fake.samples.has(key)
        ? { id: fake.samples.get(key) ?? 0, frames: 48000, rate: 48000, scale: 0.25 }
        : null,
  } as unknown as SoundHost;
  let draws = 0;
  const instruments = createInstruments(host, () => {
    draws += 1;
    return (draws % 10) / 10;
  });
  return { fake, instruments };
}

describe("a grain cloud", () => {
  test("starts once the core is up and holds its sample, with its settings behind the start", () => {
    const { fake, instruments } = setup();
    const cloud = instruments.grain("kit/pad", {
      bus: "ambience",
      position: 0.25,
      size: 80,
      sends: { music: 0.5 },
    });
    cloud.set({ density: 30 });
    fake.bringUp();
    instruments.samples();
    expect(fake.sent()).toHaveLength(0);

    fake.samples.set("kit/pad", 7);
    instruments.samples();
    const sent = fake.sent();
    expect(sent[0]).toMatchObject({
      op: "GRAIN_START",
      cloud: 0,
      sample: 7,
      bus: 4,
      sendBus1: 3,
      send1: 0.5,
    });
    const sets = fake.of("GRAIN_SET");
    expect(sets.map((c) => c.param).sort()).toEqual(
      [GRAIN_PARAM.position, GRAIN_PARAM.size, GRAIN_PARAM.density, GRAIN_PARAM.level].sort(),
    );
    expect(sets.every((c) => c.slew === 0 && c.cloud === 0)).toBe(true);
    // The core holds the sample normalised to full scale: the cloud's level carries the gain that restores it.
    expect(sets.find((c) => c.param === GRAIN_PARAM.level)?.value).toBeCloseTo(0.25, 6);
    fake.clear();
    cloud.set({ level: 0.5 });
    expect(fake.of("GRAIN_SET")[0]).toMatchObject({ param: GRAIN_PARAM.level, value: 0.125 });
    // Started once: a later sample change does not start it again.
    instruments.samples();
    expect(fake.of("GRAIN_START")).toHaveLength(0);
  });

  test("a set while it plays sends only what was named, slewed", () => {
    const { fake, instruments } = setup();
    fake.samples.set("kit/pad", 3);
    fake.bringUp();
    const cloud = instruments.grain("kit/pad");
    fake.clear();
    cloud.set({ position: 0.9, nonsense: 4 } as never, 100);
    expect(fake.sent()).toEqual([
      {
        op: "GRAIN_SET",
        atFrame: 0,
        cloud: 0,
        param: GRAIN_PARAM.position,
        value: expect.closeTo(0.9, 6),
        slew: 4800,
      },
    ]);
  });

  test("stop releases it and hands its slot to the next cloud; one never started sends nothing", () => {
    const { fake, instruments } = setup();
    fake.samples.set("kit/pad", 3);
    fake.bringUp();
    const first = instruments.grain("kit/pad");
    first.stop(20);
    first.set({ position: 1 });
    expect(fake.of("GRAIN_STOP")).toEqual([{ op: "GRAIN_STOP", atFrame: 0, cloud: 0, release: 960 }]);
    instruments.grain("kit/pad");
    expect(fake.of("GRAIN_START").map((c) => c.cloud)).toEqual([0, 0]);

    fake.clear();
    const waiting = instruments.grain("kit/missing");
    waiting.stop();
    fake.samples.set("kit/missing", 9);
    instruments.samples();
    expect(fake.sent()).toHaveLength(0);
  });

  test("the ninth cloud is refused with one warning", () => {
    const { fake, instruments } = setup();
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    fake.samples.set("kit/pad", 3);
    fake.bringUp();
    for (let i = 0; i < LIMITS.GRAIN_CLOUDS + 2; i++) instruments.grain("kit/pad");
    expect(fake.of("GRAIN_START")).toHaveLength(LIMITS.GRAIN_CLOUDS);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("a generator", () => {
  test("starts when the core comes up, at its level, with its settings behind the start", () => {
    const { fake, instruments } = setup();
    const motor = instruments.gen("motor", { bus: "ambience", level: -6, params: { rate: 40, duty: 0.3 } });
    motor.set({ load: 0.5 });
    expect(fake.sent()).toHaveLength(0);
    fake.bringUp();
    const start = fake.of("GEN_START")[0];
    expect(start).toMatchObject({ slot: 0, kind: GEN_KIND.motor, bus: 4 });
    expect(start?.gain).toBeCloseTo(10 ** (-6 / 20), 5);
    expect(
      fake
        .of("GEN_SET")
        .map((c) => c.param)
        .sort(),
    ).toEqual([GEN_PARAMS.motor.rate, GEN_PARAMS.motor.duty, GEN_PARAMS.motor.load].sort());
    fake.clear();
    motor.set({ rate: 400, nonsense: 1 }, 50);
    expect(fake.sent()).toEqual([
      { op: "GEN_SET", atFrame: 0, slot: 0, param: GEN_PARAMS.motor.rate, value: 400, slew: 2400 },
    ]);
    motor.stop(10);
    expect(fake.of("GEN_STOP")).toEqual([{ op: "GEN_STOP", atFrame: 0, slot: 0, release: 480 }]);
  });

  test("a modal bank's modes take three parameters each, and a strike before the start does not fire with it", () => {
    const { fake, instruments } = setup();
    const bank = instruments.gen("modal", {
      modes: [
        { freq: 220, decay: 1.5, gain: 1 },
        { freq: 590, decay: 0.8, gain: 0.5 },
      ],
      params: { damp: 1 },
    });
    bank.set({ strike: 1 });
    fake.bringUp();
    const params = fake.of("GEN_SET").map((c) => c.param);
    const mode = GEN_PARAMS.modal.mode;
    expect(params.sort((a, b) => a - b)).toEqual([
      GEN_PARAMS.modal.damp,
      mode,
      mode + 1,
      mode + 2,
      mode + 3,
      mode + 4,
      mode + 5,
    ]);
    expect(fake.of("GEN_SET").find((c) => c.param === mode + 3)?.value).toBe(590);
    fake.clear();
    bank.set({ strike: 0.7 });
    bank.set({ strike: 0.7 });
    // A strike is a moment: the same value twice strikes twice.
    expect(fake.of("GEN_SET").map((c) => c.param)).toEqual([
      GEN_PARAMS.modal.strike,
      GEN_PARAMS.modal.strike,
    ]);
  });
});
