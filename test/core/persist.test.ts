import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
  CLOCK_FAILURE_LIMIT,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  deserialize,
  flushSave,
  saveBlocked,
  serialize,
  startGameClock,
  watchOtherTabs,
  watchSave,
} from "watchpot/core";
import { T0, toy, toyStore } from "./toy";

/** The helpers over any store: the flush, the status watcher, the two-tab guard and the clock binding. */

afterEach(() => {
  mock.restore();
});

describe("flushSave", () => {
  test("writes the debounced save now; nothing lands before", () => {
    const backend = createMemoryBackend();
    const pending: (() => void)[] = [];
    const store = createIdleStore(toy, {
      storage: createGameStorage(backend, { schedule: (fn) => void pending.push(fn), cancel: () => {} }),
      now: () => T0,
    });
    store.getState().wallet.earn(1);
    expect(backend.getItem("toy.save")).toBeNull();
    flushSave(store);
    const env = deserialize(backend.getItem("toy.save") ?? "") as {
      state: { wallet: { gold: { eq(n: number): boolean } } };
    };
    expect(env.state.wallet.gold.eq(11)).toBe(true);
  });

  test("watchSave hears a block", () => {
    const { store } = toyStore();
    const heard = mock(() => {});
    const unwatch = watchSave(store, heard);
    const taken = mock(() => {});
    const unwatchTabs = watchOtherTabs(store, taken);
    window.dispatchEvent(new StorageEvent("storage", { key: "toy.save" }));
    expect(heard).toHaveBeenCalledTimes(1);
    expect(taken).toHaveBeenCalledTimes(1);
    unwatch();
    unwatchTabs();
  });
});

describe("another tab", () => {
  test("only a write to the store's own key blocks it, and calls back once", () => {
    const { store } = toyStore();
    const taken = mock(() => {});
    const unwatch = watchOtherTabs(store, taken);
    const fire = (key: string | null) => window.dispatchEvent(new StorageEvent("storage", { key }));
    fire("other.key");
    fire("toy.save.kept");
    fire(null);
    expect(saveBlocked(store)).toBe(false);
    expect(taken).not.toHaveBeenCalled();
    fire("toy.save");
    fire("toy.save");
    expect(saveBlocked(store)).toBe(true);
    expect(taken).toHaveBeenCalledTimes(1);
    unwatch();
  });

  test("two tabs writing at once: the older save yields, the newer keeps going", () => {
    const write = (seen: number) => {
      const { store: other } = toyStore({ at: seen });
      other.getState().catchUp(seen);
      const env = deserialize(other.getState().exportProfile()) as { state: unknown; version: number };
      return serialize({ state: env.state, version: env.version });
    };
    const fire = (newValue: string) =>
      window.dispatchEvent(new StorageEvent("storage", { key: "toy.save", newValue }));
    const { store } = toyStore({ at: T0 + 5000 });
    store.getState().catchUp(T0 + 5000);
    const taken = mock(() => {});
    const unwatch = watchOtherTabs(store, taken);
    fire(write(T0 + 1000));
    expect(saveBlocked(store)).toBe(false);
    expect(taken).not.toHaveBeenCalled();
    fire(write(T0 + 9000));
    expect(saveBlocked(store)).toBe(true);
    expect(taken).toHaveBeenCalledTimes(1);
    unwatch();
  });

  test("a foreign save that never ticked (lastSeen 0) is older, so this tab keeps going", () => {
    const { store: other } = toyStore();
    const env = deserialize(other.getState().exportProfile()) as {
      state: { clock: { lastSeen: number } };
      version: number;
    };
    env.state.clock.lastSeen = 0;
    const { store } = toyStore({ at: T0 + 5000 });
    store.getState().catchUp(T0 + 5000);
    const taken = mock(() => {});
    const unwatch = watchOtherTabs(store, taken);
    window.dispatchEvent(new StorageEvent("storage", { key: "toy.save", newValue: serialize(env) }));
    expect(saveBlocked(store)).toBe(false);
    expect(taken).not.toHaveBeenCalled();
    unwatch();
  });
});

/** A clock on a manual schedule: `fire()` is the interval, `at` the game time it reads. */
function manualClock(options: { throws?: () => boolean } = {}) {
  const { store, backend } = toyStore();
  let at = T0;
  let fire = () => {};
  const onFail = mock(() => {});
  const clock = startGameClock(store, {
    visibility: null,
    now: () => at,
    schedule: (fn) => {
      fire = fn;
      return 1;
    },
    cancel: () => {},
    onFail,
  });
  if (options.throws) {
    const original = store.getState().tick;
    store.setState({
      tick: (dt, when) => {
        if (options.throws?.()) throw new Error("tick");
        original(dt, when);
      },
    });
  }
  const step = (ms = 100) => {
    at += ms;
    fire();
  };
  return { store, backend, clock, step, onFail, at: () => at };
}

/** A store whose writes land only on a flush, and a clock whose visibility is driven by hand: `hide()` hides the tab. */
function hiddenClock() {
  // A backend that counts writes, over a schedule that never fires: a write only lands on a flush.
  const backend = createMemoryBackend();
  let writes = 0;
  const counting = {
    getItem: (name: string) => backend.getItem(name),
    setItem: (name: string, value: string) => {
      writes += 1;
      backend.setItem(name, value);
    },
    removeItem: (name: string) => backend.removeItem(name),
  };
  // The clock's visibility source, driven by hand: `hidden` flips when the tab hides.
  let hidden = false;
  let at = T0;
  let fire = () => {};
  const store = createIdleStore(toy, {
    storage: createGameStorage(counting, { schedule: () => 1, cancel: () => {} }),
    now: () => at,
  });
  const clock = startGameClock(store, {
    now: () => at,
    schedule: (fn) => {
      fire = fn;
      return 1;
    },
    cancel: () => {},
    visibility: {
      hidden: () => hidden,
      subscribe: (cb) => {
        window.addEventListener("pagehide", cb);
        return () => window.removeEventListener("pagehide", cb);
      },
    },
  });
  const advance = (ms: number) => {
    at += ms;
  };
  const hide = () => {
    hidden = true;
    window.dispatchEvent(new Event("pagehide"));
  };
  return { store, clock, writes: () => writes, advance, fire, hide };
}

describe("startGameClock", () => {
  test("catches up and flushes at start, ticks on the interval, catches up over a gap", () => {
    const { store, backend, step } = manualClock();
    expect(store.getState().clock.createdAt).toBe(T0);
    expect(backend.getItem("toy.save")).not.toBeNull();
    step(100);
    expect(store.getState().wallet.gold.eq(10.1)).toBe(true);
    expect(store.getState().clock.lastSeen).toBe(T0 + 100);
    step(60_000);
    // A gap longer than the away threshold is a catch-up at the offline rate, not a tick.
    expect(store.getState().wallet.gold.eq(10.1 + 30)).toBe(true);
  });

  test("a throw or two is survived; a run of them stops the clock and reports once", () => {
    spyOn(console, "error").mockImplementation(() => {});
    let throws = 0;
    const { store, clock, step, onFail } = manualClock({ throws: () => throws-- > 0 });
    throws = 1;
    step();
    const before = store.getState().clock.lastSeen;
    step();
    expect(clock.running).toBe(true);
    expect(onFail).not.toHaveBeenCalled();
    expect(store.getState().clock.lastSeen).toBeGreaterThan(before);

    throws = CLOCK_FAILURE_LIMIT;
    for (let i = 0; i < CLOCK_FAILURE_LIMIT; i++) step();
    expect(clock.running).toBe(false);
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  test("stop ends the ticking", () => {
    const { store, clock, step } = manualClock();
    clock.stop();
    const before = store.getState().wallet.gold;
    step();
    expect(store.getState().wallet.gold.eq(before)).toBe(true);
  });

  test("one pagehide writes the save once; a caller's stop hands the flush back", () => {
    const { store, clock, writes, advance, fire, hide } = hiddenClock();
    const atStart = writes();
    // A tick, then time passing without one, so the hide's last tick has something to bring forward.
    advance(100);
    fire();
    advance(100);
    hide();
    expect(writes()).toBe(atStart + 1);
    clock.stop();
    // Something to save again, so the store's own flush has a write to make once the hold is gone.
    store.getState().wallet.earn(1);
    hide();
    expect(writes()).toBe(atStart + 2);
  });

  test("a stop then a start holds the flush again: one pagehide with pending data writes once", () => {
    const { clock, writes, advance, fire, hide } = hiddenClock();
    clock.stop();
    clock.start();
    expect(clock.running).toBe(true);
    const atStart = writes();
    // A tick, then time passing without one, so the hide's last tick has something to bring forward.
    advance(100);
    fire();
    advance(100);
    hide();
    expect(writes()).toBe(atStart + 1);
  });
});
