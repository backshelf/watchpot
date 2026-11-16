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
export function createAsyncMemoryBackend(entries: Record<string, string> = {}): AsyncMemoryBackend {
  const map = new Map(Object.entries(entries));
  const open = new Set<Promise<unknown>>();
  /** Runs `op` a turn later, so the caller has moved on before it answers. */
  const later = <T>(op: () => T): Promise<T> => {
    const p = Promise.resolve().then(op);
    open.add(p);
    const done = () => {
      open.delete(p);
    };
    p.then(done, done);
    return p;
  };
  return {
    getItem: (name) => later(() => map.get(name) ?? null),
    setItem: (name, value) =>
      later(() => {
        map.set(name, value);
      }),
    removeItem: (name) =>
      later(() => {
        map.delete(name);
      }),
    peek: (name) => map.get(name) ?? null,
    idle: async () => {
      do {
        await Promise.allSettled([...open]);
        // The storage answers a landed write a few turns later, and may send the next one then.
        for (let i = 0; i < 8; i++) await null;
      } while (open.size > 0);
    },
  };
}
