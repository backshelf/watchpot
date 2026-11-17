import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
  clearSave,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  D,
  type Decimal,
  defineFeature,
  defineGame,
  deserialize,
  holdHideFlush,
  type InitialContext,
  mergeFeature,
  migrate,
  saveBlockedBy,
  savedRecord,
  saveSetAside,
  saveStatus,
  seedRng,
  serialize,
  watchOtherTabs,
  ZERO,
} from "watchpot/core";
import { T0, toy, toyStore, wallet } from "./toy";

/** What the store tells a page about its save: why one was set aside or is blocked, the hide flush and clearing. */

afterEach(() => {
  mock.restore();
});

const quiet = () => {
  spyOn(console, "warn").mockImplementation(() => {});
  spyOn(console, "error").mockImplementation(() => {});
};

const withSave = (raw: string) => {
  const backend = createMemoryBackend();
  backend.setItem("toy.save", raw);
  return backend;
};

describe("a save set aside", () => {
  test("one no step reaches: warned of, noted as old-version, kept", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const raw = serialize({ version: 0, state: { wallet: { gold: 999 } } });
    const { store, backend } = toyStore({ backend: withSave(raw) });
    expect(saveSetAside(store)).toBe("old-version");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(backend.getItem("toy.save.kept")).toBe(raw);
    expect(saveStatus(store)).not.toBe("blocked");
  });

  test("one a step throws on: noted as migration-failed", () => {
    quiet();
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
      features: [wallet],
    });
    const store = createIdleStore(broken, {
      storage: createGameStorage(withSave(serialize({ version: 1, state: { wallet: { gold: 5 } } })), {
        debounceMs: 0,
      }),
      now: () => T0,
    });
    expect(saveSetAside(store)).toBe("migration-failed");
  });

  test("a save that is not a save at all: noted as unreadable, kept", () => {
    const { store, backend } = toyStore({ backend: withSave("not json{") });
    expect(saveSetAside(store)).toBe("unreadable");
    expect(backend.getItem("toy.save.kept")).toBe("not json{");
  });

  test("a storage a later store reuses does not hand the first's notes on", () => {
    const storage = createGameStorage(withSave("not json{"), { debounceMs: 0, onError: () => {} });
    const first = createIdleStore(toy, { storage, now: () => T0 });
    expect(saveSetAside(first)).toBe("unreadable");
    // The first store's fresh profile replaces the garbage under the save key, so the second store loads a save
    // this build can read: its own load notes nothing, whatever the first one found.
    first.getState().wallet.earn(1);
    const second = createIdleStore(toy, { storage, now: () => T0 });
    expect(saveSetAside(second)).toBeNull();
  });

  test("a save that loads is not noted", () => {
    const { store } = toyStore();
    expect(saveSetAside(store)).toBeNull();
    expect(saveBlockedBy(store)).toBeNull();
  });
});

describe("why saving is blocked", () => {
  test("a newer build's save", () => {
    const { store } = toyStore({ backend: withSave(serialize({ version: 2, state: {} })) });
    expect(saveStatus(store)).toBe("blocked");
    expect(saveBlockedBy(store)).toBe("newer");
  });

  test("a save whose load threw", () => {
    quiet();
    const fragile = defineFeature({
      key: "fragile",
      initial: () => ({ n: 0 }),
      merge: () => {
        throw new Error("merge");
      },
    });
    const game = defineGame({ id: "fragile", save: { key: "toy.save", version: 1 }, features: [fragile] });
    const store = createIdleStore(game, {
      storage: createGameStorage(withSave(serialize({ version: 1, state: { fragile: { n: 1 } } })), {
        debounceMs: 0,
      }),
      now: () => T0,
    });
    expect(saveBlockedBy(store)).toBe("unreadable");
  });

  test("another tab, and the first cause stays", () => {
    quiet();
    const { store } = toyStore();
    const unwatch = watchOtherTabs(store, () => {});
    window.dispatchEvent(new StorageEvent("storage", { key: "toy.save" }));
    expect(saveBlockedBy(store)).toBe("taken");
    clearSave(store);
    expect(saveBlockedBy(store)).toBe("taken");
    unwatch();
  });
});

describe("clearSave", () => {
  test("removes the save and its kept copy, and nothing writes it back", () => {
    const { store, backend } = toyStore();
    backend.setItem("toy.save.kept", "old");
    store.getState().wallet.earn(1);
    expect(backend.getItem("toy.save")).not.toBeNull();
    clearSave(store);
    expect(saveBlockedBy(store)).toBe("cleared");
    store.getState().wallet.earn(1);
    window.dispatchEvent(new Event("pagehide"));
    expect(backend.getItem("toy.save")).toBeNull();
    expect(backend.getItem("toy.save.kept")).toBeNull();
  });
});

describe("the page-hide flush", () => {
  /** A toy store whose debounced write waits until flushed. */
  const pendingStore = () => {
    const backend = createMemoryBackend();
    const store = createIdleStore(toy, {
      storage: createGameStorage(backend, { schedule: () => 1, cancel: () => {} }),
      now: () => T0,
    });
    store.getState().wallet.earn(1);
    return { store, backend };
  };

  test("the store writes its pending save when the page hides, with no clock started", () => {
    const { backend } = pendingStore();
    expect(backend.getItem("toy.save")).toBeNull();
    window.dispatchEvent(new Event("pagehide"));
    const env = deserialize(backend.getItem("toy.save") ?? "null") as {
      state: { wallet: { gold: Decimal } };
    };
    expect(env.state.wallet.gold.eq(11)).toBe(true);
  });

  test("stands down while a caller holds it, and comes back on release", () => {
    const { store, backend } = pendingStore();
    const release = holdHideFlush(store);
    window.dispatchEvent(new Event("pagehide"));
    expect(backend.getItem("toy.save")).toBeNull();
    release();
    release();
    window.dispatchEvent(new Event("pagehide"));
    expect(backend.getItem("toy.save")).not.toBeNull();
  });
});

describe("merging a saved field over a Decimal default", () => {
  const toyContext: InitialContext = { now: 0, wallNow: 0, rng: seedRng(0), reason: "new" };
  const purse = defineFeature({ key: "purse", initial: () => ({ gold: D(5), note: "a" as string | null }) });

  test("undefined, null, an object or NaN keep the default; a number or a string is read", () => {
    for (const bad of [undefined, null, {}, Number.NaN, true])
      expect(mergeFeature(purse, purse.initial(toyContext), { gold: bad }).gold.eq(5)).toBe(true);
    expect(mergeFeature(purse, purse.initial(toyContext), { gold: 7 }).gold.eq(7)).toBe(true);
    expect(mergeFeature(purse, purse.initial(toyContext), { gold: "1e3" }).gold.eq(1000)).toBe(true);
  });

  test("undefined is a missing field anywhere; null is kept where the default is not a Decimal", () => {
    expect(mergeFeature(purse, purse.initial(toyContext), { note: undefined }).note).toBe("a");
    expect(mergeFeature(purse, purse.initial(toyContext), { note: null }).note).toBeNull();
  });
});

describe("migration steps", () => {
  test("a feature's step is not called when the save has no slice for it", () => {
    const strict = defineFeature({
      key: "strict",
      initial: () => ({ count: ZERO }),
      migrations: {
        2: (saved) => {
          const { owned, ...rest } = saved as { owned: number };
          return { ...rest, count: owned };
        },
      },
    });
    const game = defineGame({ id: "strict", save: { key: "strict", version: 2 }, features: [strict] });
    expect(migrate({ other: {} }, 1, 2, game)).toEqual({ other: {} });
    expect(migrate({ strict: { owned: 3 } }, 1, 2, game)).toEqual({ strict: { count: 3 } });
  });

  test("savedRecord reads a plain object as itself and anything else as empty", () => {
    const obj = { a: 1 };
    expect(savedRecord(obj)).toBe(obj);
    for (const other of [undefined, null, 3, "x", [1], D(2)]) expect(savedRecord(other)).toEqual({});
  });
});
