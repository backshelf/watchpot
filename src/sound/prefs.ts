/**
 * The player's sound settings, kept per device: a volume for each bus a game shows, and the headphones mode. Stored
 * as one JSON value under the game's key; a value that will not parse, or storage that refuses, leaves the settings
 * for the session only.
 */
import type { Mixer, Space } from "./types";

/** A game's sound settings: read for a settings row, written from it. */
export interface SoundPrefs<B extends string> {
  /** The player's volume for a bus, 0..1 (1 when never set). */
  busVolume(name: B | "master"): number;
  setBusVolume(name: B | "master", volume: number): void;
  headphones(): boolean;
  setHeadphones(value: boolean): void;
}

/** What is stored under the key. */
interface Stored {
  volumes: Record<string, number>;
  headphones: boolean;
}

function defaultStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function read(storage: Pick<Storage, "getItem"> | null, key: string): Stored {
  const stored: Stored = { volumes: {}, headphones: false };
  try {
    const raw: unknown = JSON.parse(storage?.getItem(key) ?? "null");
    if (!raw || typeof raw !== "object") return stored;
    const { volumes, headphones } = raw as Partial<Record<keyof Stored, unknown>>;
    if (volumes && typeof volumes === "object")
      for (const [bus, volume] of Object.entries(volumes))
        if (typeof volume === "number" && Number.isFinite(volume)) stored.volumes[bus] = volume;
    stored.headphones = headphones === true;
  } catch {
    // Unparseable: start from the defaults.
  }
  return stored;
}

/**
 * The settings stored under `key`, applied to `sound` now and on every change. `storage` is `localStorage` where
 * there is one; without it the settings last the session.
 */
export function soundPrefs<B extends string>(
  key: string,
  sound: { mixer: Mixer<B>; space: Space },
  storage?: Pick<Storage, "getItem" | "setItem">,
): SoundPrefs<B> {
  const store = storage ?? defaultStorage();
  const stored = read(store, key);
  const save = () => {
    try {
      store?.setItem(key, JSON.stringify(stored));
    } catch {
      // Full or refused: the settings still hold for the session.
    }
  };

  for (const [bus, volume] of Object.entries(stored.volumes)) sound.mixer.setBusVolume(bus as B, volume);
  if (stored.headphones) sound.space.listener({ mode: "headphones" });

  return {
    busVolume: (name) => sound.mixer.busVolume(name),
    setBusVolume(name, volume) {
      if (!Number.isFinite(volume)) return;
      sound.mixer.setBusVolume(name, volume);
      stored.volumes[name] = sound.mixer.busVolume(name);
      save();
    },
    headphones: () => stored.headphones,
    setHeadphones(value) {
      stored.headphones = value;
      sound.space.listener({ mode: value ? "headphones" : "speakers" });
      save();
    },
  };
}
