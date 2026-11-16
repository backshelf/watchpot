import type { AsyncStorageBackend } from "../core/storage";
/** A memory backend whose every call answers with a promise, a turn later: the async platform in a test. */
export interface AsyncMemoryBackend extends AsyncStorageBackend {
    getItem(name: string): Promise<string | null>;
    setItem(name: string, value: string): Promise<void>;
    removeItem(name: string): Promise<void>;
    /** The stored string now, read at once, for an assertion. */
    peek(name: string): string | null;
    /** Settles once every call made so far, and any write it led to, has answered. */
    idle(): Promise<void>;
}
/** Starts holding `entries` (a save under its key, say). */
export declare function createAsyncMemoryBackend(entries?: Record<string, string>): AsyncMemoryBackend;
