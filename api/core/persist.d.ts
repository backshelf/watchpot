import type { AnyGame } from "./game";
import { type GameStorage } from "./storage";
/**
 * Why the save found at load was set aside (copied to the kept key, `name + KEPT_SUFFIX`) and replaced by a fresh
 * profile: `old-version`, a save older than any migration step reaches; `migration-failed`, a step threw on it;
 * `unreadable`, the string under the key is not a save at all (not JSON, or JSON without the saved envelope).
 */
export type SaveSetAside = "old-version" | "migration-failed" | "unreadable";
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
/**
 * Records a store's game, storage and save key, for the helpers that read them back. Where there is a page (a
 * `window` and a `document`), it also flushes the store's save when the page hides, so the last second of play is
 * kept whether or not a clock was ever started; in a sim, or a test with no DOM, it adds no listener.
 */
export declare function registerStore(store: object, meta: StoreMeta): void;
/**
 * Stands the store's own page-hide flush down until the returned release is called, for a caller that flushes on
 * hide itself after a last tick (the game clock does), so one hide writes the save once. Holds stack; calling a
 * release twice releases once.
 */
export declare function holdHideFlush(store: AnyStore): () => void;
/** The store's game, storage and save key; undefined for a store `createIdleStore` did not make. */
export declare function storeMeta(store: object): StoreMeta | undefined;
/** Any store `createIdleStore` made, by identity; the helpers read only its state. */
type AnyStore = {
    getState(): object;
};
/** Writes the store's pending save now. */
export declare function flushSave(store: AnyStore): void;
/**
 * True when the store writes nothing this session: it loaded a newer build's save, could not load the save,
 * another tab took the save, or `clearSave` deleted it. `saveBlockedBy` says which.
 */
export declare function saveBlocked(store: AnyStore): boolean;
/**
 * Why the store writes nothing this session (see `SaveBlockedBy`), or null while it is saving. Null too for a
 * storage something outside the engine blocked by hand. Watch it with `watchSave`.
 */
export declare function saveBlockedBy(store: AnyStore): SaveBlockedBy | null;
/**
 * Why the save found at load was set aside for a fresh profile (see `SaveSetAside`), or null when none was: for a
 * page that tells the player their progress was reset and that the old save is kept. Settled once `hydrated` is.
 */
export declare function saveSetAside(store: AnyStore): SaveSetAside | null;
/**
 * Deletes the store's save: first blocks its writes, so neither a pending write nor a hide flush puts it back,
 * then removes the save and its kept copy. The store keeps its state in memory and writes nothing more; reload the
 * page (or build a new store) for a fresh profile. Answers with a promise on an async backend.
 */
export declare function clearSave(store: AnyStore): void | Promise<void>;
/** What the save is doing: `unsaved` when the storage is memory or its last write failed. */
export type SaveStatus = "saving" | "unsaved" | "blocked";
/** Reads whether a store's save is writing, blocked, or held in memory only. `saveBlockedBy` says why it is blocked. */
export declare function saveStatus(store: AnyStore): SaveStatus;
/** Calls `listener` whenever `saveStatus` may have changed. Returns the remover. */
export declare function watchSave(store: AnyStore, listener: () => void): () => void;
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
export declare function watchOtherTabs(store: AnyStore, onTaken: () => void): () => void;
export {};
