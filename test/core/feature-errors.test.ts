// The error `defineFeature` throws on a bad key: what is wrong, where, and how to fix it.
import { describe, expect, test } from "bun:test";
import { defineFeature } from "watchpot/core";

interface Case {
  readonly name: string;
  /** The minimal bad declaration. */
  readonly bad: () => unknown;
  /** The "where": the key the message names. */
  readonly where: RegExp;
  /** The key word of the fix. */
  readonly fix: RegExp;
}

const CASES: Case[] = [
  {
    name: "a feature key with a dot in it",
    bad: () => defineFeature({ key: "a.b", initial: () => ({}) }),
    where: /feature "a\.b": the key cannot contain/,
    fix: /rename the feature/,
  },
];

describe("defineFeature's errors say what is wrong, where, and how to fix it", () => {
  for (const { name, bad, where, fix } of CASES)
    test(name, () => {
      expect(bad).toThrow(where);
      expect(bad).toThrow(fix);
    });
});
