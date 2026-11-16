import { describe, expect, test } from "bun:test";
import {
  createGameStorage,
  createIdleStore,
  defineFeature,
  defineGame,
  deserialize,
  flushSave,
  saveBlocked,
  serialize,
} from "watchpot/core";
import { createAsyncMemoryBackend } from "watchpot/test";
import { generator, prestige, T0, toy, wallet } from "./toy";

/**
 * A backend that answers with promises (IndexedDB, a native bridge): the store loads after `createIdleStore`
 * returns, says so with `hydrated`, writes nothing before, and sends one write at a time.
 */

const KEY = "toy.save";
const saveOf = (gold: number, version = 1) =>
  serialize({ version, state: { wallet: { gold, lifetime: gold } } });
const goldIn = (raw: string | null) =>
  raw === null
    ? null
    : (
        deserialize(raw) as { state: { wallet: { gold: { toNumber(): number } } } }
      ).state.wallet.gold.toNumber();

function boot(backend = createAsyncMemoryBackend(), game = toy) {
  const store = createIdleStore(game, {
    storage: createGameStorage(backend, { debounceMs: 0, onError: () => {} }),
    now: () => T0,
  });
  return { store, backend };
}

describe("an async backend", () => {
  test("hydrates after the store is built; play before then writes nothing over the save", async () => {
    const saved = saveOf(77);
    const { store, backend } = boot(createAsyncMemoryBackend({ [KEY]: saved }));
    // Built, not loaded: a new profile, and a change now must not land over the save.
    expect(store.getState().wallet.gold.eq(10)).toBe(true);
    store.getState().wallet.earn(1);
    await store.hydrated;
    expect(store.getState().wallet.gold.eq(77)).toBe(true);
    await backend.idle();
    expect(backend.peek(KEY)).toBe(saved);
    store.getState().wallet.earn(3);
    await backend.idle();
    expect(goldIn(backend.peek(KEY))).toBe(80);
  });

  test("writes go one at a time, and the last state lands", async () => {
    const { store, backend } = boot();
    await store.hydrated;
    for (let i = 0; i < 5; i++) store.getState().wallet.earn(1);
    flushSave(store);
    await backend.idle();
    expect(goldIn(backend.peek(KEY))).toBe(15);
  });

  test("blocks a newer save: kept, and nothing written over it", async () => {
    const newer = saveOf(999, 2);
    const { store, backend } = boot(createAsyncMemoryBackend({ [KEY]: newer }));
    await store.hydrated;
    expect(saveBlocked(store)).toBe(true);
    store.getState().wallet.earn(1);
    await backend.idle();
    expect(backend.peek(KEY)).toBe(newer);
    expect(backend.peek(`${KEY}.kept`)).toBe(newer);
  });

  test("an older save no step reaches is kept before the fresh profile is written", async () => {
    const older = saveOf(55, 1);
    const v2 = defineGame({
      id: "toy",
      save: { key: KEY, version: 2 },
      features: [wallet, generator, prestige],
    });
    const { store, backend } = boot(createAsyncMemoryBackend({ [KEY]: older }), v2);
    await store.hydrated;
    expect(backend.peek(`${KEY}.kept`)).toBe(older);
    await backend.idle();
    expect(store.getState().wallet.gold.eq(10)).toBe(true);
    expect(goldIn(backend.peek(KEY))).toBe(10);
    expect(saveBlocked(store)).toBe(false);
  });

  test("an older save comes forward through a step and is written back", async () => {
    const v2 = defineGame({
      id: "toy",
      save: {
        key: KEY,
        version: 2,
        migrations: { 2: (s) => ({ ...(s as object), wallet: { gold: 5 } }) },
      },
      features: [wallet, generator, prestige],
    });
    const { store, backend } = boot(createAsyncMemoryBackend({ [KEY]: saveOf(55, 1) }), v2);
    await store.hydrated;
    await backend.idle();
    expect(store.getState().wallet.gold.eq(5)).toBe(true);
    expect((deserialize(backend.peek(KEY) ?? "") as { version: number }).version).toBe(2);
    expect(backend.peek(`${KEY}.kept`)).toBeNull();
  });

  test("an unreadable save is kept aside", async () => {
    const raw = '{"version":1,"state":';
    const { store, backend } = boot(createAsyncMemoryBackend({ [KEY]: raw }));
    await store.hydrated;
    await backend.idle();
    expect(backend.peek(`${KEY}.kept`)).toBe(raw);
    store.getState().wallet.earn(1);
    await backend.idle();
    expect(goldIn(backend.peek(KEY))).toBe(11);
  });

  test("a load that fails keeps the save: nothing is written over it this session", async () => {
    const saved = saveOf(77);
    const inner = createAsyncMemoryBackend({ [KEY]: saved });
    let fails = 1;
    const flaky = {
      ...inner,
      getItem: (name: string) => (fails-- > 0 ? Promise.reject(new Error("io")) : inner.getItem(name)),
    };
    const quiet = console.error;
    console.error = () => {};
    try {
      const store = createIdleStore(toy, {
        storage: createGameStorage(flaky, { debounceMs: 0, onError: () => {} }),
        now: () => T0,
      });
      await store.hydrated;
      expect(saveBlocked(store)).toBe(true);
      store.getState().wallet.earn(1);
      await inner.idle();
      expect(inner.peek(KEY)).toBe(saved);
    } finally {
      console.error = quiet;
    }
  });

  test("import and export refuse to run before the save has loaded", async () => {
    const { store } = boot(createAsyncMemoryBackend({ [KEY]: saveOf(500) }));
    const other = saveOf(7);
    expect(() => store.getState().exportProfile()).toThrow(/not-loaded/);
    expect(() => store.getState().importProfile(other)).toThrow(/not-loaded/);
    await store.hydrated;
    expect(store.getState().wallet.gold.eq(500)).toBe(true);
  });

  test("a synchronous backend is loaded when the store is built", async () => {
    const thing = defineFeature({ key: "thing", initial: () => ({ n: 0 }) });
    const game = defineGame({ id: "sync", save: { key: "sync", version: 1 }, features: [thing] });
    const store = createIdleStore(game, {
      storage: createGameStorage(
        {
          getItem: () => serialize({ version: 1, state: { thing: { n: 4 } } }),
          setItem: () => {},
          removeItem: () => {},
        },
        { debounceMs: 0 },
      ),
      now: () => T0,
    });
    expect(store.getState().thing.n).toBe(4);
    await store.hydrated;
  });
});
