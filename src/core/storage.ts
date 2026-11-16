import type { PersistStorage, StorageValue } from "zustand/middleware";
import { isDecimal } from "./decimal";
import { deserialize, serialize } from "./save";

/** What persist writes: each feature's saved data under its key, no functions. */
export type PersistedState = Record<string, Record<string, unknown>>;

/**
 * The persist storage: tagged JSON (Decimals survive), debounced writes, and a `flush` the clock calls when
 * the tab hides so the last second of play and the fresh `lastSeen` are never lost. It keeps raw strings and
 * blocks writes; what a save's version means is the store's call.
 *
 * A backend holds raw strings. `StorageBackend` answers at once (localStorage, memory): the store loads during
 * `createIdleStore`, as WHALE's always has. `AsyncStorageBackend` may answer with a promise (IndexedDB, a native
 * bridge): the store then loads later and says so with `store.hydrated`, and writes go one at a time, each after the
 * last has landed.
 */
export interface StorageBackend {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
  removeItem: (name: string) => void;
}

/** A backend any of whose calls may answer with a promise. A `StorageBackend` is one. */
export interface AsyncStorageBackend {
  getItem: (name: string) => string | null | Promise<string | null>;
  setItem: (name: string, value: string) => void | Promise<void>;
  removeItem: (name: string) => void | Promise<void>;
}

const isPromise = <T>(value: T | Promise<T>): value is Promise<T> => value instanceof Promise;

/** `fn` over `value` now, or once it resolves. */
const then = <T, U>(value: T | Promise<T>, fn: (v: T) => U | Promise<U>): U | Promise<U> =>
  isPromise(value) ? value.then(fn) : fn(value);

/** A storage backend over a map, answering at once, with `dump()` for tests. */
export function createMemoryBackend(): StorageBackend & { dump: () => Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    },
    dump: () => Object.fromEntries(map),
  };
}

/**
 * window.localStorage when it exists and can be read; null where there is none or access is denied. The probe reads:
 * a full origin still holds a save to load, and a write that fails later is the storage's `failing`.
 */
export function localStorageBackend(): StorageBackend | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    ls.getItem("watchpot.probe");
    return {
      getItem: (name) => ls.getItem(name),
      setItem: (name, value) => {
        ls.setItem(name, value);
      },
      removeItem: (name) => {
        ls.removeItem(name);
      },
    };
  } catch {
    return null;
  }
}

/** The persist storage a store writes through: debounced writes with `flush`, `block` and `keep`. */
export interface GameStorage extends PersistStorage<PersistedState> {
  /** Writes any pending save now. */
  flush: () => void;
  /** True while a write is waiting on the debounce. */
  readonly pending: boolean;
  /** Drops any pending write and refuses every later `setItem` and `flush`. Idempotent, safe at any time. */
  block: () => void;
  readonly blocked: boolean;
  /** False for the memory fallback: nothing outlives the tab. */
  readonly durable: boolean;
  /** True after a write throws, until the next write lands. */
  readonly failing: boolean;
  /** Called when `failing` or `blocked` flips. Returns the remover. */
  subscribe: (listener: () => void) => () => void;
  /**
   * Copies the backend's raw string for `name` to `name + KEPT_SUFFIX`, over any earlier copy unless `replace` is
   * false. Never throws. On an async backend it answers with a promise, and writes wait behind it.
   */
  keep: (name: string, options?: { replace?: boolean }) => void | Promise<void>;
}

/** Where `keep` puts a save it will not use: WHALE's is `whale.save.kept`. */
export const KEPT_SUFFIX = ".kept";

/** A plain object: not null, an array, a Decimal or a primitive. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !isDecimal(value);
}

/**
 * A saved state's outer shape: a plain object. Shallow on purpose: it never looks inside a slice (the merge checks
 * each one), so a newer build's save still reaches `migrate` as it is.
 */
function isPersisted(value: unknown): value is PersistedState {
  return isPlainObject(value);
}

/** The saved state when it has the outer shape, or null. */
export function asPersisted(value: unknown): PersistedState | null {
  return isPersisted(value) ? value : null;
}

/** Options for `createGameStorage`: the debounce, the scheduler, an error hook and durability. */
export interface GameStorageOptions {
  /** Trailing debounce for writes; 0 writes synchronously. */
  debounceMs?: number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
  onError?: (error: unknown) => void;
  /** Whether the backend outlives the tab. Default true; the memory fallback passes false. */
  durable?: boolean;
}

/** The default trailing debounce of saves, in milliseconds. */
export const SAVE_DEBOUNCE_MS = 1000;

/** Each state entry's JSON, by the entry's object: the store hands back an unchanged slice's same frozen data. */
const entryJson = new WeakMap<object, string>();

/**
 * `serialize(value)`, byte for byte, reusing the JSON of every state entry it has seen. Only the persist's envelope
 * (exactly `state` then `version`, a plain-object state, a numeric version) takes the cached path; anything else
 * is serialised whole.
 */
function serializeEnvelope(value: unknown): string {
  if (!isPlainObject(value)) return serialize(value);
  const keys = Object.keys(value);
  const { state, version } = value;
  if (keys.length !== 2 || keys[0] !== "state" || keys[1] !== "version") return serialize(value);
  if (!isPlainObject(state) || typeof version !== "number") return serialize(value);
  const entries: string[] = [];
  for (const [key, entry] of Object.entries(state)) {
    // Skipped exactly as `toPlain` skips them.
    if (entry === undefined || typeof entry === "function") continue;
    let json: string | undefined;
    if (typeof entry === "object" && entry !== null) {
      json = entryJson.get(entry);
      if (json === undefined) {
        json = serialize(entry);
        entryJson.set(entry, json);
      }
    } else json = serialize(entry);
    // A value JSON drops inside an object (a symbol) is dropped here too.
    if (json === undefined) continue;
    entries.push(`${JSON.stringify(key)}:${json}`);
  }
  return `{"state":{${entries.join(",")}},"version":${JSON.stringify(version)}}`;
}

/** Wraps a backend in the game's storage: tagged JSON, debounced writes, `flush`, `block` and `keep`. */
export function createGameStorage(
  backend: AsyncStorageBackend,
  options: GameStorageOptions = {},
): GameStorage {
  const debounceMs = options.debounceMs ?? SAVE_DEBOUNCE_MS;
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel = options.cancel ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const onError = options.onError ?? ((e) => console.error("watchpot save failed", e));

  let pendingName: string | null = null;
  let pendingValue: StorageValue<PersistedState> | null = null;
  let handle: unknown = null;
  /** Backend calls still answering (an async write or keep): the next write waits for them. */
  let busy = 0;
  let blocked = false;
  let failing = false;
  const listeners = new Set<() => void>();
  const setFailing = (next: boolean) => {
    if (failing === next) return;
    failing = next;
    for (const l of listeners) l();
  };

  const failed = (e: unknown) => {
    onError(e);
    setFailing(true);
  };

  /** Holds later writes until `work` answers, then writes what came in meanwhile. */
  const wait = (work: Promise<unknown>): Promise<void> => {
    busy++;
    return work.then(
      () => settle(),
      () => settle(),
    );
  };
  const settle = () => {
    busy--;
    if (busy === 0 && !blocked) write();
  };

  const write = () => {
    if (busy > 0 || pendingName === null || pendingValue === null) return;
    const name = pendingName;
    const value = pendingValue;
    pendingName = null;
    pendingValue = null;
    let landed: void | Promise<void>;
    try {
      landed = backend.setItem(name, serializeEnvelope(value));
    } catch (e) {
      failed(e);
      return;
    }
    if (isPromise(landed)) {
      void wait(landed.then(() => setFailing(false), failed));
      return;
    }
    setFailing(false);
  };

  const drop = () => {
    if (handle !== null) cancel(handle);
    handle = null;
    pendingName = null;
    pendingValue = null;
  };

  const flush = () => {
    if (blocked) return;
    if (handle !== null) cancel(handle);
    handle = null;
    write();
  };

  const keep = (name: string, { replace = true }: { replace?: boolean } = {}): void | Promise<void> => {
    const kept = `${name}${KEPT_SUFFIX}`;
    const copy = (raw: string | null) =>
      raw === null
        ? undefined
        : then(backend.getItem(kept), (k) =>
            replace || k === null ? backend.setItem(kept, raw) : undefined,
          );
    let done: void | Promise<void>;
    try {
      done = then(backend.getItem(name), copy);
    } catch (e) {
      onError(e);
      return;
    }
    if (isPromise(done)) return wait(done.catch(onError));
  };

  /** The save under `name` from its raw string; one this build cannot read is set aside first, and reads as none. */
  const read = (name: string, raw: string | null): StorageValue<PersistedState> | null | Promise<null> => {
    if (raw === null) return null;
    try {
      const env = deserialize(raw);
      if (isPlainObject(env)) {
        const state = asPersisted(env.state);
        if (state) return { state, version: typeof env.version === "number" ? env.version : 0 };
      }
    } catch (e) {
      onError(e);
    }
    // A save this build cannot read is set aside before the fresh profile's first write replaces it.
    return then(keep(name), () => null);
  };

  return {
    getItem: (name) => then(backend.getItem(name), (raw) => read(name, raw)),
    setItem: (name, value) => {
      if (blocked) return;
      pendingName = name;
      pendingValue = value;
      if (debounceMs <= 0) {
        flush();
        return;
      }
      if (handle === null)
        handle = schedule(() => {
          handle = null;
          write();
        }, debounceMs);
    },
    removeItem: (name) => {
      drop();
      return backend.removeItem(name);
    },
    flush,
    get pending() {
      return pendingValue !== null;
    },
    block: () => {
      drop();
      if (blocked) return;
      blocked = true;
      for (const l of listeners) l();
    },
    get blocked() {
      return blocked;
    },
    durable: options.durable ?? true,
    get failing() {
      return failing;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    keep,
  };
}
