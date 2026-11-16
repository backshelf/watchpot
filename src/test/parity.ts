import {
  type AnyGame,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  createPlainStore,
  isDecimal,
  type RootActions,
} from "../core";

/**
 * Proof that a game's sim is the game: the same seed played through the real store and the plain one
 * (`createPlainStore`, which the sim runs on), compared after every stretch. A game calls it once in its tests;
 * null means every saved and transient field agreed all the way, and a string names the first that did not.
 */
export interface PlainParityOptions {
  /** The seed both stores draw from. Default `"parity"`. */
  seed?: string | number;
  /** The wall time both start at (epoch ms). Default 1,000,000. */
  start?: number;
  /** How many ticks to play. Default 600. */
  steps?: number;
  /** The length of a tick in ms. Default 1000. */
  tickMs?: number;
  /** Ticks between comparisons. Default 50. */
  compareEvery?: number;
  /**
   * What the player does before each tick, the same on both stores: usually the auto-player's look
   * (`(store) => player.look(store)`, with one auto-player made per store). Called with the tick's index.
   */
  act?(store: ParityStore, step: number, which: "real" | "plain"): void;
}

/** What `act` is handed: either store, by the part the two share. */
export interface ParityStore {
  getState(): RootActions & Record<string, unknown>;
}

const same = (a: unknown, b: unknown, path: string): string | null => {
  if (isDecimal(a) || isDecimal(b)) {
    if (isDecimal(a) && isDecimal(b) && (a.eq(b) || (a.isNan() && b.isNan()))) return null;
    return `${path}: ${String(a)} (real) against ${String(b)} (plain)`;
  }
  if (typeof a === "function" && typeof b === "function") return null;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null)
    return Object.is(a, b) ? null : `${path}: ${String(a)} (real) against ${String(b)} (plain)`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: one is an array and the other is not`;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const hit = same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    if (hit) return hit;
  }
  return null;
};

/** Plays one seed through both stores and names the first field they disagree on, or null when they never do. */
export function plainParity(game: AnyGame, options: PlainParityOptions = {}): string | null {
  const { seed = "parity", start = 1_000_000, steps = 600, tickMs = 1000, compareEvery = 50, act } = options;
  let clock = start;
  const now = () => clock;
  const real = createIdleStore(game, { now, seed, storage: createGameStorage(createMemoryBackend()) });
  const plain = createPlainStore(game, { now, seed });
  const stores = [
    ["real", real as unknown as ParityStore],
    ["plain", plain as unknown as ParityStore],
  ] as const;
  for (const [, store] of stores) store.getState().catchUp();
  const compare = (step: number): string | null => {
    const a = real.getState() as Record<string, unknown>;
    const b = plain.getState() as Record<string, unknown>;
    for (const f of game.features) {
      const hit = same(a[f.key], b[f.key], f.key);
      if (hit) return `after ${step} ticks, ${hit}`;
    }
    return null;
  };
  for (let step = 0; step < steps; step++) {
    for (const [which, store] of stores) act?.(store, step, which);
    clock += tickMs;
    for (const [, store] of stores) store.getState().tick(tickMs);
    if ((step + 1) % compareEvery === 0 || step === steps - 1) {
      const hit = compare(step + 1);
      if (hit) return hit;
    }
  }
  return null;
}
