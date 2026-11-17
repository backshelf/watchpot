// The error a `derived` block in layers throws on a name given twice: what is wrong, where, and how to fix it.
import { describe, expect, test } from "bun:test";
import { defineFeature } from "watchpot/core";

interface Case {
  readonly name: string;
  /** The minimal bad declaration. */
  readonly bad: () => unknown;
  /** The "where": the derived value the message names. */
  readonly where: RegExp;
  /** The key word of the fix. */
  readonly fix: RegExp;
}

const CASES: Case[] = [
  {
    name: "a derived value declared in two layers",
    bad: () =>
      defineFeature({
        key: "x",
        initial: () => ({ n: 1 }),
        derived: [{ a: () => 1 }, { a: () => 2 }] as never,
      }),
    where: /a derived value "a" is declared in two layers/,
    fix: /rename one, or fold the two into one layer/,
  },
];

describe("the layered derived error says what is wrong, where, and how to fix it", () => {
  for (const { name, bad, where, fix } of CASES)
    test(name, () => {
      expect(bad).toThrow(where);
      expect(bad).toThrow(fix);
    });
});
