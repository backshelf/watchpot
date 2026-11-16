import { type ClockLens, readClock } from "./clock-feature";
import type { AnyGame } from "./game";
import { deserialize } from "./save";
import { type GameStorage, KEPT_SUFFIX } from "./storage";

/**
 * Why the save found at load was set aside (copied to the kept key, `name + KEPT_SUFFIX`) and replaced by a fresh
 * profile: `old-version`, a save older than any migration step reaches; `migration-failed`, a step threw on it.
 */
export type SaveSetAside = "old-version" | "migration-failed";

/**
 * Why the store writes nothing this session: `newer`, the save is a newer build's; `taken`, another tab of the game
 * wrote the save (`watchOtherTabs`); `unreadable`, the save could not be loaded (a read or a merge threw), so it is
 * left as it is; `cleared`, `clearSave` deleted it.
 */
export type SaveBlockedBy = "newer" | "taken" | "unreadable" | "cleared";

/** What a store records about its save, for `saveSetAside` and `saveBlockedBy`. `createIdleStore` keeps it. */
export interface SaveNotes {
  setAside: SaveSetAside | null;
  blockedBy: SaveBlockedBy | null;
}

/**
 * What the store knows about its own persistence, for the helpers below. `createIdleStore` registers every
 * store it makes; the helpers take any `IdleStore` and do nothing for one they do not know.
 */
export interface StoreMeta {
  readonly game: AnyGame;
  readonly storage: GameStorage;
  readonly name: string;
  /** Why a save was set aside or saving is blocked; written by the store and the helpers below. */
  readonly notes?: SaveNotes;
}

const metaByStore = new WeakMap<object, StoreMeta>();

/** Callers that flush on hide themselves (`holdHideFlush`), by store. */
const hideHolds = new WeakMap<object, number>();

/**
 * Records a store's game, storage and save key, for the helpers that read them back. Where there is a page (a
 * `window` and a `document`), it also flushes the store's save when the page hides, so the last second of play is
 * kept whether or not a clock was ever started; in a sim, or a test with no DOM, it adds no listener.
 */
export function registerStore(store: object, meta: StoreMeta): void {
  metaByStore.set(store, meta);
  flushOnHide(store);
}

/**
 * The page-hide flush. The listener holds the store weakly, so a store dropped (a test's, a sim's) is collected, and
 * the listener goes with the next hide.
 */
function flushOnHide(store: object): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const ref = new WeakRef(store);
  const onHide = (event: Event) => {
    const live = ref.deref();
    if (!live) {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      return;
    }
    if (event.type === "visibilitychange" && !document.hidden) return;
    if ((hideHolds.get(live) ?? 0) > 0) return;
    metaByStore.get(live)?.storage.flush();
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onHide);
}

/**
 * Stands the store's own page-hide flush down until the returned release is called, for a caller that flushes on
 * hide itself after a last tick (the game clock does), so one hide writes the save once. Holds stack; calling a
 * release twice releases once.
 */
export function holdHideFlush(store: AnyStore): () => void {
  hideHolds.set(store, (hideHolds.get(store) ?? 0) + 1);
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    hideHolds.set(store, (hideHolds.get(store) ?? 1) - 1);
  };
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

/**
 * True when the store writes nothing this session: it loaded a newer build's save, could not load the save,
 * another tab took the save, or `clearSave` deleted it. `saveBlockedBy` says which.
 */
export function saveBlocked(store: AnyStore): boolean {
  return metaByStore.get(store)?.storage.blocked ?? false;
}

/**
 * Why the store writes nothing this session (see `SaveBlockedBy`), or null while it is saving. Null too for a
 * storage something outside the engine blocked by hand. Watch it with `watchSave`.
 */
export function saveBlockedBy(store: AnyStore): SaveBlockedBy | null {
  const meta = metaByStore.get(store);
  return meta?.storage.blocked ? (meta.notes?.blockedBy ?? null) : null;
}

/**
 * Why the save found at load was set aside for a fresh profile (see `SaveSetAside`), or null when none was: for a
 * page that tells the player their progress was reset and that the old save is kept. Settled once `hydrated` is.
 */
export function saveSetAside(store: AnyStore): SaveSetAside | null {
  return metaByStore.get(store)?.notes?.setAside ?? null;
}

/** Records why the store is about to block, unless an earlier cause already did. */
function noteBlock(meta: StoreMeta, why: SaveBlockedBy): void {
  if (meta.notes && !meta.storage.blocked) meta.notes.blockedBy = why;
}

/**
 * Deletes the store's save: first blocks its writes, so neither a pending write nor a hide flush puts it back,
 * then removes the save and its kept copy. The store keeps its state in memory and writes nothing more; reload the
 * page (or build a new store) for a fresh profile. Answers with a promise on an async backend.
 */
export function clearSave(store: AnyStore): void | Promise<void> {
  const meta = metaByStore.get(store);
  if (!meta) return;
  noteBlock(meta, "cleared");
  meta.storage.block();
  const removed = [meta.storage.removeItem(meta.name), meta.storage.removeItem(`${meta.name}${KEPT_SUFFIX}`)];
  if (removed.some((r) => r instanceof Promise)) return Promise.all(removed).then(() => {});
}

/** What the save is doing: `unsaved` when the storage is memory or its last write failed. */
export type SaveStatus = "saving" | "unsaved" | "blocked";

/** Reads whether a store's save is writing, blocked, or held in memory only. `saveBlockedBy` says why it is blocked. */
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
 * memory never lands over the newer save, warns on the console, and calls `onTaken` once. Only the writes stop: the
 * caller stops its own clock in `onTaken` (`useGameClock` does), and tells the player the tab is frozen. When both
 * tabs write at once the one whose save is older yields: the foreign write's clock `lastSeen` (the autosave carries
 * no `savedAt`) against this tab's own; this tab keeps going when its own is the same or newer, and a write that
 * cannot be read yields. Any other key, a `clear()` (`key: null`) and the kept copy included, changes nothing. The
 * browser never fires `storage` in the tab that wrote, so one tab never sees it. Returns the remover; with no window
 * it does nothing.
 */
export function watchOtherTabs(store: AnyStore, onTaken: () => void): () => void {
  const meta = metaByStore.get(store);
  if (typeof window === "undefined" || !meta) return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key !== meta.name) return;
    if (foreignSeen(event.newValue, meta.game.clock) < readClock(store.getState(), meta.game.clock).lastSeen)
      return;
    noteBlock(meta, "taken");
    meta.storage.block();
    window.removeEventListener("storage", onStorage);
    console.warn("watchpot: another tab of the game took the save; this tab writes nothing until it reloads");
    onTaken();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
