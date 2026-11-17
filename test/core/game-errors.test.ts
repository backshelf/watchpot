// The errors `defineGame` throws: each one says what is wrong, where, and how to fix it. One table row per
// changed message, with the minimal bad declaration that triggers it.
import { describe, expect, test } from "bun:test";
import { D, defineFeature, defineGame, vocab } from "watchpot/core";
import { generator } from "./toy";

const save = { key: "errors.save", version: 1 };
const plain = (key: string) => defineFeature({ key, initial: () => ({ n: 0 }) });
const step = (target: string) =>
  defineFeature({
    key: "w",
    initial: () => ({}),
    steps: { sync: { x: { after: target, run: () => {} } } },
  });

const WORDS = vocab({ currencies: ["gold"], stats: [], rarities: ["common"] } as const);
const voiced = defineFeature({ key: "voiced", initial: () => ({ gold: D(0) }), vocab: WORDS });

interface Case {
  readonly name: string;
  /** The minimal bad declaration. */
  readonly bad: () => unknown;
  /** The "where": the feature key, action, step id or clock field the message names. */
  readonly where: RegExp;
  /** The key word of the fix. */
  readonly fix: RegExp;
}

const CASES: Case[] = [
  {
    name: "two features share the key",
    bad: () => defineGame({ id: "dup", save, features: [plain("w"), plain("w")] }),
    where: /share the key `w`/,
    fix: /rename one in its `defineFeature`/,
  },
  {
    name: "a feature speaks a vocabulary the game does not declare",
    bad: () => defineGame({ id: "voiced", save, features: [voiced] }),
    where: /feature "voiced" speaks a vocabulary/,
    fix: /`defineGame`'s `vocab`/,
  },
  {
    name: "a feature reaches one the game does not list",
    bad: () => defineGame({ id: "reach", save, features: [generator] }),
    where: /reaches `wallet`/,
    fix: /list it in `defineGame`'s `features`/,
  },
  {
    name: "an action named like a key of the initial state",
    bad: () =>
      defineGame({
        id: "shadow",
        save,
        features: [
          defineFeature({
            key: "door",
            initial: () => ({ open: false }),
            actions: (api) => ({ open: () => api.set(() => undefined) }),
          }),
        ],
      }),
    where: /the action `open`/,
    fix: /rename the action or the key in `initial`/,
  },
  {
    name: "a derived value named like a key of the initial state",
    bad: () =>
      defineGame({
        id: "clash",
        save,
        features: [defineFeature({ key: "clash", initial: () => ({ n: 1 }), derived: { n: () => 2 } })],
      }),
    where: /the derived value `n`/,
    fix: /rename the derived value or the key in `initial`/,
  },
  {
    name: "a derived value named like an action",
    bad: () =>
      defineGame({
        id: "clash",
        save,
        features: [
          defineFeature({
            key: "clash",
            initial: () => ({}),
            actions: () => ({ go: () => {} }),
            derived: { go: () => 1 },
          }),
        ],
      }),
    where: /the derived value `go`/,
    fix: /rename the derived value or the action/,
  },
  {
    name: "a transient key that is not in the initial state",
    bad: () =>
      defineGame({
        id: "leaky",
        save,
        features: [
          defineFeature({
            key: "leaky",
            initial: () => ({ a: 1 }) as { a: number; flash?: number },
            transient: ["flash"],
          }),
        ],
      }),
    where: /the transient key `flash`/,
    fix: /add `flash` to `initial` or drop it from `transient`/,
  },
  {
    name: "a reset depth below 1",
    bad: () =>
      defineGame({
        id: "shallow",
        save,
        features: [defineFeature({ key: "shallow", initial: () => ({ n: 0 }), reset: { depth: 0 } })],
      }),
    where: /`reset` says 0/,
    fix: /set `depth` to 1 or more/,
  },
  {
    name: "a kept key that is not in the initial state",
    bad: () =>
      defineGame({
        id: "keepy",
        save,
        features: [
          defineFeature({
            key: "keepy",
            initial: () => ({ a: 1 }) as { a: number; streak?: number },
            reset: { keep: ["streak"] },
          }),
        ],
      }),
    where: /the kept key `streak`/,
    fix: /drop it from `reset.keep`/,
  },
  {
    name: "a step name with a dot in it",
    bad: () =>
      defineGame({
        id: "dotted",
        save,
        features: [
          defineFeature({ key: "dotted", initial: () => ({}), steps: { sync: { "a.b": () => {} } } }),
        ],
      }),
    where: /the step name `a.b`/,
    fix: /rename the step/,
  },
  {
    name: "the clock names a feature the game lacks",
    bad: () =>
      defineGame({
        id: "clocky",
        save,
        features: [plain("w")],
        clock: { feature: "missing", lastSeen: "t", createdAt: "c", offset: "o" } as never,
      }),
    where: /the feature `missing`/,
    fix: /add it to `features`, or set `clock`/,
  },
  {
    name: "a game action named like a feature",
    bad: () =>
      defineGame({ id: "shadow", save, features: [plain("wallet")], actions: () => ({ wallet: () => {} }) }),
    where: /the game action `wallet`/,
    fix: /rename the action in `actions`/,
  },
  {
    name: "an after target naming a feature the game lacks",
    bad: () => defineGame({ id: "order", save, features: [step("nobody.sync.y")] }),
    where: /has no feature `nobody`/,
    fix: /or name `nobody` in `features`/,
  },
  {
    name: "an after target naming a step of another phase",
    bad: () => defineGame({ id: "order", save, features: [step("w.produce.y")] }),
    where: /not a step of the sync phase/,
    fix: /name a `sync` step/,
  },
  {
    name: "an after target naming a step the feature does not declare",
    bad: () => defineGame({ id: "order", save, features: [step("w.sync.y")] }),
    where: /feature `w` does not declare in sync/,
    fix: /name a step its `steps` declares there/,
  },
];

describe("defineGame's errors say what is wrong, where, and how to fix it", () => {
  for (const { name, bad, where, fix } of CASES)
    test(name, () => {
      expect(bad).toThrow(where);
      expect(bad).toThrow(fix);
    });
});
