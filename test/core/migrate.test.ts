import { describe, expect, test } from "bun:test";
import {
  D,
  type Decimal,
  defineGame,
  deserialize,
  feature,
  type Migration,
  migrate,
  migrationProblems,
  oldestReadable,
  SaveError,
  saveBlocked,
  ZERO,
} from "watchpot/core";
import { freshStore } from "watchpot/test";
import { wallet } from "./toy";

/**
 * Migrations: a save from an older version comes forward through the game's steps (the whole save) and the
 * features' (their own data), one version at a time; one no step reaches is kept aside and the profile starts
 * fresh. `toy-save-v1.json` is the toy game's save at version 1, made by `fixtureSave(toy, regular)`.
 */

const V1 = await Bun.file(new URL("./toy-save-v1.json", import.meta.url)).text();
const v1 = deserialize(V1) as {
  version: number;
  state: { generator: { owned: number }; prestige: { runs: number; shards: Decimal } };
};

type Saved = Record<string, unknown>;

/** v2: the prestige layer is renamed `ascension` (the game's step: it moves a key). */
const renamePrestige: Migration = (saved) => {
  const { prestige, ...rest } = saved as Saved;
  return { ...rest, ascension: prestige };
};

/** v3: the generator counts `count`, not `owned` (the feature's step: its own data). */
const engines = (steps: Record<number, Migration>) =>
  feature({
    key: "generator",
    initial: () => ({ count: 1, unlocked: { bronze: true, silver: false } as Record<string, boolean> }),
    migrations: steps,
  });
const countOwned: Migration = (saved) => {
  const { owned, ...rest } = saved as Saved;
  return { ...rest, count: owned };
};

const ascension = feature({ key: "ascension", initial: () => ({ runs: 0, shards: ZERO }), reset: "never" });

/** The toy at version 3: both steps. */
const toyV3 = defineGame({
  id: "toy",
  save: { key: "toy.save", version: 3, migrations: { 2: renamePrestige } },
  features: [wallet, engines({ 3: countOwned }), ascension],
});

describe("a v1 save on a v3 game", () => {
  test("the fixture is the toy's v1 save, progressed", () => {
    expect(v1.version).toBe(1);
    expect(v1.state.generator.owned).toBeGreaterThan(1);
    expect(v1.state.prestige.runs).toBeGreaterThan(0);
  });

  test("migrates through two steps, and the store writes it back at v3", () => {
    const { store, backend } = freshStore(toyV3, { save: V1, catchUp: false });
    const s = store.getState();
    expect(s.generator.count).toBe(v1.state.generator.owned);
    expect("owned" in s.generator).toBe(false);
    expect(s.ascension.runs).toBe(v1.state.prestige.runs);
    expect(s.ascension.shards.eq(v1.state.prestige.shards)).toBe(true);
    expect(s.wallet.gold.gt(0)).toBe(true);
    expect(saveBlocked(store)).toBe(false);
    const written = deserialize(backend.getItem("toy.save") ?? "") as { version: number; state: Saved };
    expect(written.version).toBe(3);
    expect(Object.keys(written.state).sort()).toEqual(["ascension", "clock", "generator", "wallet"]);
    expect(backend.getItem("toy.save.kept")).toBeNull();
  });

  test("with no step to v2, the save is kept byte for byte and the profile starts fresh", () => {
    const gap = defineGame({
      id: "toy",
      save: { key: "toy.save", version: 3 },
      features: [wallet, engines({ 3: countOwned }), ascension],
    });
    expect(oldestReadable(gap)).toBe(2);
    const { store, backend } = freshStore(gap, { save: V1, catchUp: false });
    expect(store.getState().generator.count).toBe(1);
    expect(store.getState().ascension.runs).toBe(0);
    expect(backend.getItem("toy.save.kept")).toBe(V1);
    const written = deserialize(backend.getItem("toy.save") ?? "") as { version: number };
    expect(written.version).toBe(3);
    expect(saveBlocked(store)).toBe(false);
  });

  test("a step that throws is a save this build will not use: kept, and a fresh profile", () => {
    const broken = defineGame({
      id: "toy",
      save: {
        key: "toy.save",
        version: 2,
        migrations: {
          2: () => {
            throw new Error("bad step");
          },
        },
      },
      features: [wallet, ascension],
    });
    const quiet = console.error;
    console.error = () => {};
    try {
      const { store, backend } = freshStore(broken, { save: V1, catchUp: false });
      expect(store.getState().ascension.runs).toBe(0);
      expect(backend.getItem("toy.save.kept")).toBe(V1);
    } finally {
      console.error = quiet;
    }
  });

  test("a step that throws a SaveError is kept too, not written over", () => {
    const broken = defineGame({
      id: "toy",
      save: {
        key: "toy.save",
        version: 2,
        migrations: {
          2: () => {
            throw new SaveError("bad-shape");
          },
        },
      },
      features: [wallet, ascension],
    });
    const quiet = console.error;
    console.error = () => {};
    try {
      const { store, backend } = freshStore(broken, { save: V1, catchUp: false });
      expect(store.getState().ascension.runs).toBe(0);
      expect(backend.getItem("toy.save.kept")).toBe(V1);
    } finally {
      console.error = quiet;
    }
  });

  test("an older export imports through the steps; one no step reaches is refused as old", () => {
    const { store } = freshStore(toyV3);
    store.getState().importProfile(V1);
    expect(store.getState().ascension.runs).toBe(v1.state.prestige.runs);
    expect(store.getState().generator.count).toBe(v1.state.generator.owned);
    const gap = defineGame({
      id: "toy",
      save: { key: "toy.save", version: 3 },
      features: [wallet, ascension],
    });
    const { store: other } = freshStore(gap);
    let code: string | null = null;
    try {
      other.getState().importProfile(V1);
    } catch (e) {
      code = e instanceof SaveError ? e.code : null;
    }
    expect(code).toBe("old-version");
  });
});

describe("the runner", () => {
  test("versions ascend; at each, the game's step, then the features' in their order", () => {
    const ran: string[] = [];
    const log =
      (what: string): Migration =>
      (saved) => {
        ran.push(what);
        return saved;
      };
    const a = feature({ key: "a", initial: () => ({}), migrations: { 2: log("a2"), 3: log("a3") } });
    const b = feature({ key: "b", initial: () => ({}), migrations: { 3: log("b3") } });
    const game = defineGame({
      id: "order",
      save: { key: "order", version: 3, migrations: { 3: log("game3"), 2: log("game2") } },
      features: [b, a],
    });
    migrate({ a: {}, b: {} }, 1, 3, game);
    expect(ran).toEqual(["game2", "a2", "game3", "b3", "a3"]);
  });

  test("a feature's step sees only its own data, and its result lands under its key", () => {
    const a = feature({
      key: "a",
      initial: () => ({ n: D(0) }),
      migrations: { 2: (saved) => ({ n: (saved as { n: number }).n * 2 }) },
    });
    const game = defineGame({ id: "own", save: { key: "own", version: 2 }, features: [a] });
    expect(migrate({ a: { n: 21 }, other: 1 }, 1, 2, game)).toEqual({ a: { n: 42 }, other: 1 });
  });

  test("no steps: the current version passes, an older one is nothing, a newer one a typed error", () => {
    expect(migrate({ x: 1 }, 2, 2, toyV3)).toEqual({ x: 1 });
    expect(migrate({ x: 1 }, 0, 3, toyV3)).toBeNull();
    expect(migrate({ x: 1 }, 2.5, 3, toyV3)).toBeNull();
    expect(() => migrate({}, 4, 3, toyV3)).toThrow(SaveError);
  });
});

describe("defineGame checks the steps", () => {
  const game = (version: number, steps: Record<number, Migration>, own: Record<number, Migration> = {}) =>
    defineGame({ id: "check", save: { key: "check", version, migrations: steps }, features: [engines(own)] });
  const step: Migration = (s) => s;

  test("contiguous from the oldest declared to the save's version, the game's and the features' together", () => {
    expect(() => game(4, { 2: step, 4: step }, { 3: step })).not.toThrow();
    expect(oldestReadable(game(4, { 2: step, 4: step }, { 3: step }))).toBe(1);
    expect(() => game(4, { 2: step, 4: step })).toThrow(/version 3/);
    expect(() => game(4, { 2: step })).toThrow(/version 3/);
  });

  test("a key past the save's version, or not a version, is refused", () => {
    expect(() => game(2, { 3: step })).toThrow(/past the save's version 2/);
    expect(migrationProblems({ save: { version: 2, migrations: { 0: step } }, features: [] })).toHaveLength(
      1,
    );
  });

  test("no steps at all is fine: the oldest readable save is the current one", () => {
    expect(oldestReadable(game(5, {}))).toBe(5);
  });
});
