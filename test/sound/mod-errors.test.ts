// The error the mod matrix throws on a route with a bad range (the same check `createSound` runs at its
// `createMod`): what is wrong, where, and how to fix it.
import { describe, expect, test } from "bun:test";
import { createMixer } from "../../src/sound/mixer";
import { createMod } from "../../src/sound/mod";
import type { CorePort } from "../../src/sound/port";
import type { DefaultBus } from "../../src/sound/types";

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

type Bus = DefaultBus | "room";

interface Case {
  readonly name: string;
  /** The minimal bad declaration. */
  readonly bad: () => unknown;
  /** The "where": the route the message names. */
  readonly where: RegExp;
  /** The key word of the fix. */
  readonly fix: RegExp;
}

const CASES: Case[] = [
  {
    name: "a route whose range is not two numbers",
    bad: () =>
      createMod<Bus>(
        { routes: [{ from: "heat", to: { bus: "sfx", level: true }, range: [0, Number.NaN] }] },
        createMixer<Bus>({}, fakePort()),
        fakePort(),
      ),
    where: /a mod route from "heat" has a range that is not two numbers/,
    fix: /set `range` to \[a, b\]/,
  },
];

describe("the mod matrix's errors say what is wrong, where, and how to fix it", () => {
  for (const { name, bad, where, fix } of CASES)
    test(name, () => {
      expect(bad).toThrow(where);
      expect(bad).toThrow(fix);
    });
});
