import { type ClockLens, readClock } from "./clock-feature";
import type { AnyGame } from "./game";
import { deserialize } from "./save";
import type { GameStorage } from "./storage";

/**
 * What the store knows about its own persistence, for the helpers below. `createIdleStore` registers every
 * store it makes; the helpers take any `IdleStore` and do nothing for one they do not know.
 */
export interface StoreMeta {
  readonly game: AnyGame;
  readonly storage: GameStorage;
  readonly name: string;
}

const metaByStore = new WeakMap<object, StoreMeta>();

/** Records a store's game, storage and save key, for the helpers that read them back. */
export function registerStore(store: object, meta: StoreMeta): void {
  metaByStore.set(store, meta);
}

/** The store's game, storage and save key; undefined for a store `createIdleStore` did not make. */
export function storeMeta(store: object): StoreMeta | undefined {
  return metaByStore.get(store);
}

/** Any store `createIdleStore` made, by identity; the helpers read only its state. */
type AnyStore = { getState(): object };

/** Writes the store's pending save now. */
export function flushSave(store: AnyStore): void {
  metaByStore.get(store)?.storage.flush();
}

/** True when the store loaded a newer build's save and writes nothing this session. */
export function saveBlocked(store: AnyStore): boolean {
  return metaByStore.get(store)?.storage.blocked ?? false;
}

/** What the save is doing: `unsaved` when the storage is memory or its last write failed. */
export type SaveStatus = "saving" | "unsaved" | "blocked";

/** Reads whether a store's save is writing, blocked, or held in memory only. */
export function saveStatus(store: AnyStore): SaveStatus {
  const storage = metaByStore.get(store)?.storage;
  if (!storage) return "saving";
  if (storage.blocked) return "blocked";
  return storage.durable && !storage.failing ? "saving" : "unsaved";
}

/** Calls `listener` whenever `saveStatus` may have changed. Returns the remover. */
export function watchSave(store: AnyStore, listener: () => void): () => void {
  return metaByStore.get(store)?.storage.subscribe(listener) ?? (() => {});
}

/**
 * The clock's `lastSeen` inside a raw save, or Infinity when it is missing or unreadable (so the reader yields).
 * A `lastSeen` of 0 is a save that never ticked: older than any running tab, so it is read as 0, not unreadable.
 */
function foreignSeen(raw: string | null, clock: ClockLens): number {
  try {
    const env = deserialize(raw ?? "") as { state?: Record<string, unknown> };
    const holder = env.state?.[clock.feature];
    const seen =
      holder && typeof holder === "object" ? (holder as Record<string, unknown>)[clock.lastSeen] : undefined;
    return typeof seen === "number" ? seen : Number.POSITIVE_INFINITY;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Another document writing this store's save key (another tab of the game) blocks this store's writes, so its
 * memory never lands over the newer save, and calls `onTaken` once. When both tabs write at once the one whose
 * save is older yields: the foreign write's clock `lastSeen` (the autosave carries no `savedAt`) against this
 * tab's own; this tab keeps going when its own is the same or newer, and a write that cannot be read yields. Any
 * other key, a `clear()` (`key: null`) and the kept copy included, changes nothing. The browser never fires
 * `storage` in the tab that wrote, so one tab never sees it. Returns the remover; with no window it does nothing.
 */
export function watchOtherTabs(store: AnyStore, onTaken: () => void): () => void {
  const meta = metaByStore.get(store);
  if (typeof window === "undefined" || !meta) return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key !== meta.name) return;
    if (foreignSeen(event.newValue, meta.game.clock) < readClock(store.getState(), meta.game.clock).lastSeen)
      return;
    meta.storage.block();
    window.removeEventListener("storage", onStorage);
    onTaken();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
