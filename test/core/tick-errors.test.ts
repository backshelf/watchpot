// The error `orderPhase` throws when a phase's `after` / `before` constraints go round: what is wrong, where
// (the steps still waiting), and how to fix it. It surfaces through `defineGame`, with its prefix.
import { describe, expect, test } from "bun:test";
import { defineFeature, defineGame } from "watchpot/core";

interface Case {
  readonly name: string;
  /** The minimal bad declaration. */
  readonly bad: () => unknown;
  /** The "where": the step ids the loop names. */
  readonly where: RegExp;
  /** The key word of the fix. */
  readonly fix: RegExp;
}

const waitsOn = (key: string, target: string) =>
  defineFeature({
    key,
    initial: () => ({}),
    steps: { sync: { one: { after: target, run: () => {} } } },
  });

const CASES: Case[] = [
  {
    name: "steps that wait on each other in a loop",
    bad: () =>
      defineGame({
        id: "loop",
        save: { key: "loop.save", version: 1 },
        features: [waitsOn("a", "b.sync.one"), waitsOn("b", "a.sync.one")],
      }),
    where: /a\.sync\.one, b\.sync\.one/,
    fix: /change or drop one of the `after` \/ `before` entries/,
  },
];

describe("the step-order error says what is wrong, where, and how to fix it", () => {
  for (const { name, bad, where, fix } of CASES)
    test(name, () => {
      expect(bad).toThrow(where);
      expect(bad).toThrow(fix);
    });
});
