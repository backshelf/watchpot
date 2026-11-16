import type { PersistStorage } from "zustand/middleware";
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
/** A storage backend over a map, answering at once, with `dump()` for tests. */
export declare function createMemoryBackend(): StorageBackend & {
    dump: () => Record<string, string>;
};
/**
 * window.localStorage when it exists and can be read; null where there is none or access is denied. The probe reads:
 * a full origin still holds a save to load, and a write that fails later is the storage's `failing`.
 */
export declare function localStorageBackend(): StorageBackend | null;
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
    keep: (name: string, options?: {
        replace?: boolean;
    }) => void | Promise<void>;
}
/** Where `keep` puts a save it will not use: WHALE's is `whale.save.kept`. */
export declare const KEPT_SUFFIX = ".kept";
/** A plain object: not null, an array, a Decimal or a primitive. */
export declare function isPlainObject(value: unknown): value is Record<string, unknown>;
/** The saved state when it has the outer shape, or null. */
export declare function asPersisted(value: unknown): PersistedState | null;
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
export declare const SAVE_DEBOUNCE_MS = 1000;
/** Wraps a backend in the game's storage: tagged JSON, debounced writes, `flush`, `block` and `keep`. */
export declare function createGameStorage(backend: AsyncStorageBackend, options?: GameStorageOptions): GameStorage;
