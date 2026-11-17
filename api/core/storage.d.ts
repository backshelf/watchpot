import type { PersistStorage } from "zustand/middleware";
/** What persist writes: each feature's saved data under its key, no functions. */
export type PersistedState = Record<string, Record<string, unknown>>;
/**
 * The persist storage: tagged JSON (Decimals survive), debounced writes, and a `flush` the clock calls when
 * the tab hides so the last second of play and the fresh `lastSeen` are never lost. It keeps raw strings and
 * blocks writes; what a save's version means is the store's call.
 *
 * A backend holds raw strings. `StorageBackend` answers at once (localStorage, memory): the store loads during
 * `createIdleStore`. `AsyncStorageBackend` may answer with a promise (IndexedDB, a native
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
/**
 * A storage backend over a map, answering at once, with `dump()` for tests. Nothing outlives the tab, so
 * `createGameStorage` over it is not durable unless told otherwise.
 */
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
    /** False over a `createMemoryBackend`: nothing outlives the tab. */
    readonly durable: boolean;
    /** True after a write throws, until the next write lands. */
    readonly failing: boolean;
    /** Called when `failing` or `blocked` flips. Returns the remover. */
    subscribe: (listener: () => void) => () => void;
    /**
     * The save names `read` set aside as unreadable this session (see `GameStorageOptions.onSetAside`); a later
     * read of the name that reads a save this build can takes the name out.
     */
    readonly unreadable: ReadonlySet<string>;
    /**
     * Copies the backend's raw string for `name` to `name + KEPT_SUFFIX`, over any earlier copy unless `replace` is
     * false. Never throws. On an async backend it answers with a promise, and writes wait behind it.
     */
    keep: (name: string, options?: {
        replace?: boolean;
    }) => void | Promise<void>;
}
/** Where `keep` puts a save it will not use: a save under `game.save` is kept under `game.save.kept`. */
export declare const KEPT_SUFFIX = ".kept";
/** A plain object: not null, an array, a Decimal or a primitive. */
export declare function isPlainObject(value: unknown): value is Record<string, unknown>;
/** The saved state when it has the outer shape, or null. */
export declare function asPersisted(value: unknown): PersistedState | null;
/** Options for `createGameStorage`: the write window, the scheduler, an error hook and durability. */
export interface GameStorageOptions {
    /**
     * The write window, a fixed-window throttle rather than a trailing debounce: the first change schedules a write
     * `debounceMs` later carrying the latest state, and changes meanwhile do not push it back, so steady play still
     * saves once a window. 0 writes synchronously.
     */
    debounceMs?: number;
    schedule?: (fn: () => void, ms: number) => unknown;
    cancel?: (handle: unknown) => void;
    onError?: (error: unknown) => void;
    /**
     * Called when `read` sets a save this build cannot read aside: a string that is not JSON, or JSON without the
     * saved envelope. The save is copied to the kept key and the profile starts fresh; the name lands in
     * `unreadable`, which a store built over this storage reads after its load (`saveSetAside` says why).
     */
    onSetAside?: (why: "unreadable") => void;
    /** Whether the backend outlives the tab. Default false over a `createMemoryBackend`, true over anything else. */
    durable?: boolean;
}
/** The default write window of saves (`GameStorageOptions.debounceMs`), in milliseconds. */
export declare const SAVE_DEBOUNCE_MS = 1000;
/** Wraps a backend in the game's storage: tagged JSON, debounced writes, `flush`, `block` and `keep`. */
export declare function createGameStorage(backend: AsyncStorageBackend, options?: GameStorageOptions): GameStorage;
