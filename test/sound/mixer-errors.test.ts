// The errors and the one mix-file warning the mixer's validation gives (the same checks `createSound` runs at
// its `createMixer`): each says what is wrong, where, and how to fix it. One table row per changed message.
import { describe, expect, spyOn, test } from "bun:test";
import { createMixer } from "../../src/sound/mixer";
import type { CorePort } from "../../src/sound/port";
import type { DefaultBus, FxDef } from "../../src/sound/types";

function fakePort(): CorePort {
  return {
    whenUp: () => () => {},
    listen: () => () => {},
    rate: () => 48000,
    time: () => 0,
    frame: () => 0,
    send: () => {},
    up: () => false,
    frames: () => 0,
    sample: () => 0,
  };
}

type Bus = DefaultBus | "deep";

interface Case {
  readonly name: string;
  /** The minimal bad declaration. */
  readonly bad: () => unknown;
  /** The "where": the bus, effect, scene or count the message names. */
  readonly where: RegExp;
  /** The key word of the fix. */
  readonly fix: RegExp;
}

// A declaration that names a bus or an effect the desk does not have is a type lie on purpose: the mixer's
// runtime checks are what the test drives.
const notABus = "cellar" as Bus;
const fx = (kind: FxDef<Bus>["kind"], extra: Record<string, unknown> = {}): FxDef<Bus> =>
  ({ kind, ...extra }) as FxDef<Bus>;

const CASES: Case[] = [
  {
    name: "too many buses",
    bad: () =>
      createMixer<string>(
        { buses: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`b${i}`, {}])) },
        fakePort(),
      ),
    where: /16 buses, but the core holds 15/,
    fix: /drop or merge buses in `buses`/,
  },
  {
    name: "a bus that sums into a name that is not a bus",
    bad: () => createMixer<Bus>({ buses: { deep: { out: notABus } } }, fakePort()),
    where: /bus "deep" sums into "cellar"/,
    fix: /set `out` to an existing bus, or leave it out to sum into the master/,
  },
  {
    name: "a bus that sends to itself",
    bad: () => createMixer<Bus>({ buses: { deep: { sends: { deep: 0.5 } } } }, fakePort()),
    where: /bus "deep" sends to "deep"/,
    fix: /name an existing other bus in `sends`, or drop the send/,
  },
  {
    name: "a bus that takes the volume of a name that is not a bus",
    bad: () => createMixer<Bus>({ buses: { deep: { volume: notABus } } }, fakePort()),
    where: /bus "deep" takes the volume of "cellar"/,
    fix: /set `volume` to an existing other bus, or leave it out/,
  },
  {
    name: "too many effects on one bus",
    bad: () =>
      createMixer<Bus>(
        { buses: { deep: { fx: Array.from({ length: 9 }, () => fx("reverb")) } } },
        fakePort(),
      ),
    where: /bus "deep" has 9 effects; a bus holds 8/,
    fix: /drop some from its `fx`/,
  },
  {
    name: "a compressor listening to a name that is not a bus",
    bad: () =>
      createMixer<Bus>({ buses: { deep: { fx: [fx("compressor", { key: notABus })] } } }, fakePort()),
    where: /a compressor on "deep" listens to "cellar"/,
    fix: /set `key` to an existing bus, or leave it out to listen to "deep"/,
  },
  {
    name: "an effect named with digits only",
    bad: () => createMixer<Bus>({ buses: { deep: { fx: [fx("reverb", { id: "7" })] } } }, fakePort()),
    where: /an effect on "deep" is named "7"/,
    fix: /rename it, or leave `id` out to go by its slot/,
  },
  {
    name: "two effects on a bus sharing an id",
    bad: () =>
      createMixer<Bus>(
        { buses: { deep: { fx: [fx("reverb", { id: "wobble" }), fx("delay", { id: "wobble" })] } } },
        fakePort(),
      ),
    where: /two effects on "deep" are named "wobble"/,
    fix: /give each a different `id`/,
  },
  {
    name: "buses that feed each other in a cycle",
    bad: () =>
      createMixer<Bus>({ buses: { deep: { out: "sfx" }, sfx: { sends: { deep: 0.5 } } } }, fakePort()),
    where: /the buses sfx, deep feed each other in a cycle/,
    fix: /point one's `out` or `sends` back at the master, or drop a link/,
  },
  {
    name: "a scene naming a bus that does not exist",
    bad: () => createMixer<string>({ scenes: { lost: { buses: { cellar: { level: -3 } } } } }, fakePort()),
    where: /scene "lost" names bus "cellar"/,
    fix: /use a bus that `buses` \(or a default\) declares, or drop it from this scene/,
  },
  {
    name: "a scene naming a send that does not exist",
    bad: () =>
      createMixer<string>({ scenes: { lost: { buses: { music: { sends: { cellar: 0.2 } } } } } }, fakePort()),
    where: /scene "lost" names a send from "music" to "cellar"/,
    fix: /point `sends` from a non-master bus to another, or drop the entry/,
  },
  {
    name: "a scene naming an effect the bus does not have",
    bad: () =>
      createMixer<string>({ scenes: { lost: { buses: { music: { fx: { 0: { size: 1 } } } } } } }, fakePort()),
    where: /scene "lost" names "size" of effect 0 on "music"/,
    fix: /name an effect the bus's `fx` has, by `id` or slot/,
  },
  {
    name: "a mod route driving a target that does not exist",
    bad: () => createMixer<Bus>({}, fakePort()).target({ bus: "cellar" as Bus, level: true }),
    where: /a mod route drives \{"bus":"cellar","level":true\}/,
    fix: /use a bus that `buses` \(or a default\) declares, or the master/,
  },
];

describe("the mixer's errors say what is wrong, where, and how to fix it", () => {
  for (const { name, bad, where, fix } of CASES)
    test(name, () => {
      expect(bad).toThrow(where);
      expect(bad).toThrow(fix);
    });
});

describe("the mixer's mix-file warning says what is wrong, where, and how to fix it", () => {
  test("buses that feed each other in a cycle are left alone, naming the fix", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      createMixer<Bus>({}, fakePort()).desk.loadGraph({ sfx: { out: "ui" }, ui: { out: "sfx" } });
      expect(warn).toHaveBeenCalledTimes(1);
      const said = String(warn.mock.calls[0]?.[0]);
      expect(said).toMatch(/a mix file's buses feed each other in a cycle/);
      expect(said).toMatch(/untangle them in the mix desk, or edit the file's `out`s/);
    } finally {
      warn.mockRestore();
    }
  });
});
