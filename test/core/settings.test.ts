import { describe, expect, test } from "bun:test";
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineGame,
  feature,
  settings,
} from "watchpot/core";

const prefs = settings({
  key: "prefs",
  initial: () => ({ sound: true, theme: "dusk" as "dusk" | "dawn" }),
});
const run = feature({
  key: "run",
  initial: () => ({ n: 0 }),
  actions: (api) => ({
    bump: () =>
      api.set((s) => {
        s.run.n += 1;
      }),
  }),
});
const game = defineGame({
  id: "prefs-toy",
  save: { key: "prefs-toy.save", version: 1 },
  features: [prefs, run],
});

const make = (backend = createMemoryBackend()) =>
  createIdleStore(game, {
    storage: createGameStorage(backend, { debounceMs: 0, onError: () => {} }),
    now: () => 1000,
  });

describe("settings", () => {
  test("starts at its initial and change merges a patch", () => {
    const store = make();
    expect(store.getState().prefs).toMatchObject({ sound: true, theme: "dusk" });
    store.getState().prefs.change({ sound: false });
    expect(store.getState().prefs).toMatchObject({ sound: false, theme: "dusk" });
  });

  test("a change survives an export and import into a fresh store", () => {
    const store = make();
    store.getState().prefs.change({ theme: "dawn" });
    const other = make();
    other.getState().importProfile(store.getState().exportProfile());
    expect(other.getState().prefs.theme).toBe("dawn");
  });

  test("a change survives resetRun while the run's own state resets", () => {
    const store = make();
    store.getState().run.bump();
    store.getState().prefs.change({ sound: false });
    store.getState().resetRun();
    expect(store.getState().prefs.sound).toBe(false);
    expect(store.getState().run.n).toBe(0);
  });

  test("it has the three namespaces, each empty", () => {
    expect([prefs.select, prefs.def, prefs.draft]).toEqual([{}, {}, {}]);
  });
});
