import type { FeatureSpec, StateOf } from "../core/feature";
import type { Game } from "../core/game";
import { createMemoryBackend, type StorageBackend } from "../core/storage";
import { type IdleStore } from "../core/store";
import { type TestClock } from "./clock";
/** The default backend: memory, answering at once, with `dump()`. */
export type MemoryBackend = ReturnType<typeof createMemoryBackend>;
/** Options for `freshStore`: the wall's start, the backend, a save to load, the seed and whether to catch up. */
export interface FreshStoreOptions<B extends StorageBackend = MemoryBackend> {
    /** The wall's start and the first catch-up. Default `T0`. */
    at?: number;
    /** A wall to follow instead of one frozen at `at` (`Date.now` under a pinned system time); the clock shifts it. */
    now?: () => number;
    /** Default a new memory backend; pass one to reload from it. */
    backend?: B;
    /** A save to load: a raw backend string or an export (`exportProfile`, a fixture file), put under the key first. */
    save?: string;
    /** The save key. Default the game's. */
    name?: string;
    /** Seeds the new profile's draws and each run reset's. Default entropy. */
    seed?: string | number;
    /** Catch up at the clock's now once built, as a boot does. Default true. */
    catchUp?: boolean;
}
/** What `freshStore` returns: the store, its backend and the test clock behind its wall. */
export interface FreshStore<S extends object, B extends StorageBackend> {
    store: IdleStore<S>;
    backend: B;
    /** The store's wall: move it, then `tick` or `catchUp`. */
    clock: TestClock;
}
/**
 * An isolated store over `game` on a backend that answers at once, writing every change straight through (no
 * debounce), its wall a test clock, caught up at `at` unless asked not to. Loaded already: no `await` needed.
 */
export declare function freshStore<F extends readonly FeatureSpec[], R extends object, B extends StorageBackend = MemoryBackend>(game: Game<F, R>, options?: FreshStoreOptions<B>): FreshStore<StateOf<F> & R, B>;
/** Plays a store: buys, ticks, moves the clock. A fixture's author. */
export type Persona<S extends object> = (store: IdleStore<S>, clock: TestClock) => void;
/**
 * A save made by play: a fresh store (seeded `fixture` unless `seed` says otherwise, so the same persona makes
 * the same save), `persona` run on it, then exported at the wall's now. The string is the export envelope, which is
 * also exactly what the backend holds: hand it to `freshStore({ save })`, an import, or a fixture file.
 */
export declare function fixtureSave<F extends readonly FeatureSpec[], R extends object>(game: Game<F, R>, persona: Persona<StateOf<F> & R>, options?: Omit<FreshStoreOptions, "backend" | "save" | "catchUp">): string;
