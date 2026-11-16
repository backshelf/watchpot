import { localStorageBackend, type StorageBackend } from "./storage";

/**
 * Prefs: the choices that belong to the device, not the save. A render quality, a frame cap, a volume: they stay
 * when the player starts over, they are not in an export, and they are read before the save loads. `prefs({ key,
 * initial })` is one small store under its own storage key; `usePrefs` (`watchpot/hooks`) reads it in React. For
 * choices that travel with the save, use `settings`.
 */

/** A prefs store: the value, a patch, a reset, and a subscription. */
export interface Prefs<T extends object> {
  /** The value now, the override laid over it. The same object until something changes. */
  get(): T;
  /**
   * Merges a patch, cleans the result through `read`, saves it and tells the listeners. A key the patch names is
   * the player's choice from then on: the override lets go of it for the rest of the load.
   */
  set(patch: Partial<T>): void;
  /** Back to `initial`, and saved; the override lets go of every key. */
  reset(): void;
  /** Calls `listener` after every change; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** The definition `prefs` takes. */
export interface PrefsDef<T extends object> {
  /** The storage key (`mygame.view`). */
  readonly key: string;
  readonly initial: T;
  /**
   * Cleans a value on its way in: what storage held (anything, or a patch already merged over the value) to a `T`
   * this build accepts. Clamp numbers and drop unknown choices here. A stored text that is not JSON arrives as the
   * string it is, so a `read` can take in what an older build kept in another form. Default: a plain object's known
   * keys whose type matches `initial`'s.
   */
  readonly read?: (raw: unknown, initial: T) => T;
  /** Where it is kept. Default: localStorage; null (or none available) keeps it in memory for the session. */
  readonly backend?: StorageBackend | null;
  /**
   * Values for this load only, laid over what is stored and never saved (a `?quality=low` in the address). A key
   * holds until the player sets it (`set`) or resets.
   */
  readonly override?: Partial<T>;
}

/** The default `read`: the keys of `initial` that the stored value holds with the same type, over `initial`. */
export function readPrefs<T extends object>(raw: unknown, initial: T): T {
  const out = { ...initial } as Record<string, unknown>;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out as T;
  for (const [k, v] of Object.entries(raw))
    if (k in out && typeof v === typeof out[k] && (typeof v !== "number" || Number.isFinite(v))) out[k] = v;
  return out as T;
}

/**
 * A prefs store under `key`. A stored value `read` does not accept reads as `initial`; a write that fails is
 * dropped.
 */
export function prefs<T extends object>(def: PrefsDef<T>): Prefs<T> {
  const read = def.read ?? readPrefs;
  const backend = def.backend === undefined ? localStorageBackend() : def.backend;
  const listeners = new Set<() => void>();
  const parse = (text: string): unknown => {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };
  const load = (): T => {
    try {
      const text = backend?.getItem(def.key);
      return read(text ? parse(text) : undefined, def.initial);
    } catch {
      return read(undefined, def.initial);
    }
  };
  let over: Partial<T> = { ...def.override };
  let stored = load();
  let shown: T = { ...stored, ...over };
  const land = (next: T): void => {
    stored = next;
    shown = { ...stored, ...over };
    try {
      backend?.setItem(def.key, JSON.stringify(stored));
    } catch {
      // A full or denied storage: the choice holds for the session.
    }
    for (const l of [...listeners]) l();
  };
  return {
    get: () => shown,
    set: (patch) => {
      for (const k of Object.keys(patch)) delete over[k as keyof T];
      land(read({ ...stored, ...patch }, def.initial));
    },
    reset: () => {
      over = {};
      land(read(undefined, def.initial));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
