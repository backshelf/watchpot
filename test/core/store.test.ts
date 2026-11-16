import { describe, expect, mock, test } from "bun:test";
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineGame,
  deserialize,
  feature,
  HOUR_MS,
  SaveError,
  saveBlocked,
  saveStatus,
  serialize,
  watchSave,
} from "watchpot/core";
import { T0, toy, toyStore } from "./toy";

/** The persist boundary: what a load does with a save, and what export and import do. */

/** The SaveError code a call throws, or null when it throws nothing. */
function codeOf(fn: () => void): string | null {
  try {
    fn();
  } catch (e) {
    return e instanceof SaveError ? e.code : String(e);
  }
  return null;
}

describe("loading a save", () => {
  test("a store reloads from the backend it wrote to", () => {
    const { store, backend } = toyStore();
    store.getState().catchUp(T0);
    store.getState().wallet.earn(32);
    store.getState().generator.buy();
    const { store: again } = toyStore({ backend });
    const s = again.getState();
    expect(s.wallet.gold.eq(42 - 10)).toBe(true);
    expect(s.generator.owned).toBe(2);
    expect(s.clock.createdAt).toBe(T0);
    expect(s.wallet.flash).toBeNull();
    expect(typeof s.wallet.earn).toBe("function");
  });

  test("a key missing from the save loads as its default; a nested object fills one level down", () => {
    const backend = createMemoryBackend();
    backend.setItem(
      "toy.save",
      serialize({
        version: 1,
        state: { wallet: { gold: 7 }, generator: { owned: 3, unlocked: { bronze: false } } },
      }),
    );
    const { store } = toyStore({ backend });
    const s = store.getState();
    expect(s.wallet.gold.eq(7)).toBe(true);
    expect(s.wallet.lifetime.eq(0)).toBe(true);
    expect(s.generator.owned).toBe(3);
    expect(s.generator.unlocked).toEqual({ bronze: false, silver: false });
    expect(s.prestige.runs).toBe(0);
  });

  test("a Decimal default coerces a saved number; a saved Decimal stays one", () => {
    const backend = createMemoryBackend();
    backend.setItem(
      "toy.save",
      serialize({ version: 1, state: { wallet: { gold: "1e30", lifetime: { $d: "5" } } } }),
    );
    const { store } = toyStore({ backend });
    expect(store.getState().wallet.gold.eq("1e30")).toBe(true);
    expect(store.getState().wallet.lifetime.eq(5)).toBe(true);
  });

  test("the feature's merge runs over the result: a tier this build does not know is dropped", () => {
    const backend = createMemoryBackend();
    backend.setItem(
      "toy.save",
      serialize({ version: 1, state: { generator: { unlocked: { bronze: true, gold: true } } } }),
    );
    const { store } = toyStore({ backend });
    expect(store.getState().generator.unlocked).toEqual({ bronze: true, silver: false });
  });

  test("an older save becomes a fresh profile", () => {
    const backend = createMemoryBackend();
    backend.setItem("toy.save", serialize({ version: 0, state: { wallet: { gold: 999 } } }));
    const { store } = toyStore({ backend });
    expect(store.getState().wallet.gold.eq(10)).toBe(true);
    expect(saveBlocked(store)).toBe(false);
  });

  test("a newer save is kept, and the store writes nothing over it", () => {
    const newer = serialize({ version: 2, state: { wallet: { gold: 999 } } });
    const backend = createMemoryBackend();
    backend.setItem("toy.save", newer);
    const { store } = toyStore({ backend });
    store.getState().catchUp(T0);
    store.getState().wallet.earn(1);
    expect(saveBlocked(store)).toBe(true);
    expect(saveStatus(store)).toBe("blocked");
    expect(backend.getItem("toy.save")).toBe(newer);
    expect(backend.getItem("toy.save.kept")).toBe(newer);
  });

  test("a newer save leaves an earlier kept copy alone", () => {
    const earlier = '{"version":1,"state":';
    const newer = serialize({ version: 2, state: {} });
    const backend = createMemoryBackend();
    backend.setItem("toy.save.kept", earlier);
    backend.setItem("toy.save", newer);
    const { store } = toyStore({ backend });
    expect(saveBlocked(store)).toBe(true);
    expect(backend.getItem("toy.save.kept")).toBe(earlier);
  });

  test("an unreadable save is kept aside before the fresh profile is written", () => {
    const raw = '{"version":1,"state":{"wallet":{"gold"';
    const backend = createMemoryBackend();
    backend.setItem("toy.save", raw);
    const { store } = toyStore({ backend });
    store.getState().tick(100, T0 + 100);
    expect(backend.getItem("toy.save.kept")).toBe(raw);
    const written = backend.getItem("toy.save");
    expect(written === null ? null : (deserialize(written) as { version: unknown }).version).toBe(1);
    expect(saveBlocked(store)).toBe(false);
  });

  test("the save key defaults to the game's and can be renamed", () => {
    const { store, backend } = toyStore({ name: "elsewhere" });
    store.getState().tick(100, T0 + 100);
    expect(backend.getItem("toy.save")).toBeNull();
    expect(backend.getItem("elsewhere")).not.toBeNull();
  });
});

describe("export and import", () => {
  test("round-trips the profile; lastSeen lands at now plus the imported offset", () => {
    const { store } = toyStore();
    store.getState().catchUp(T0);
    store.getState().wallet.earn(90);
    store.setState((s) => {
      s.clock.offsetMs = HOUR_MS;
    });
    const json = store.getState().exportProfile(T0 + 1);
    const env = deserialize(json) as { version: number; savedAt: number; state: Record<string, unknown> };
    expect(env.version).toBe(1);
    expect(env.savedAt).toBe(T0 + 1);
    expect(Object.keys(env.state).sort()).toEqual(["clock", "generator", "prestige", "wallet"]);

    const { store: other } = toyStore();
    other.getState().importProfile(json, T0 + 5000);
    const s = other.getState();
    expect(s.wallet.gold.eq(100)).toBe(true);
    expect(s.clock.offsetMs).toBe(HOUR_MS);
    expect(s.clock.lastSeen).toBe(T0 + 5000 + HOUR_MS);
    expect(s.clock.createdAt).toBe(T0);
  });

  test("a bad file is refused and changes nothing", () => {
    const { store } = toyStore();
    store.getState().wallet.earn(3);
    expect(codeOf(() => store.getState().importProfile("not json"))).toBe("bad-json");
    expect(codeOf(() => store.getState().importProfile(serialize({ version: 1, state: [] })))).toBe(
      "bad-shape",
    );
    expect(codeOf(() => store.getState().importProfile(serialize({ version: 0, state: {} })))).toBe(
      "old-version",
    );
    expect(codeOf(() => store.getState().importProfile(serialize({ version: 9, state: {} })))).toBe(
      "newer-version",
    );
    expect(store.getState().wallet.gold.eq(13)).toBe(true);
  });
});

describe("the game's own actions and the save status", () => {
  test("defineGame's actions sit at the root beside the engine's", () => {
    const counter = feature({ key: "counter", initial: () => ({ n: 0 }) });
    const game = defineGame({
      id: "root",
      save: { key: "root", version: 1 },
      features: [counter],
      actions: (api) => ({
        grant: (n: number) =>
          api.set((s) => {
            s.counter.n += n;
          }),
        at: () => api.now(),
      }),
    });
    const store = createIdleStore(game, {
      storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
      now: () => T0,
    });
    store.getState().grant(4);
    expect(store.getState().counter.n).toBe(4);
    expect(store.getState().at()).toBe(T0);
    expect(typeof store.getState().tick).toBe("function");
  });

  test("saving, unsaved for a non-durable memory store, blocked once another build's save is seen", () => {
    const { store } = toyStore();
    expect(saveStatus(store)).toBe("saving");
    const memory = createIdleStore(toy, {
      storage: createGameStorage(createMemoryBackend(), { debounceMs: 0, durable: false }),
      now: () => T0,
    });
    expect(saveStatus(memory)).toBe("unsaved");
    const told = mock(() => {});
    const unwatch = watchSave(store, told);
    expect(told).not.toHaveBeenCalled();
    unwatch();
  });
});
