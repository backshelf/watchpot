import type { AnyGame } from "./game";
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
/** Records a store's game, storage and save key, for the helpers that read them back. */
export declare function registerStore(store: object, meta: StoreMeta): void;
/** The store's game, storage and save key; undefined for a store `createIdleStore` did not make. */
export declare function storeMeta(store: object): StoreMeta | undefined;
/** Any store `createIdleStore` made, by identity; the helpers read only its state. */
type AnyStore = {
    getState(): object;
};
/** Writes the store's pending save now. */
export declare function flushSave(store: AnyStore): void;
/** True when the store loaded a newer build's save and writes nothing this session. */
export declare function saveBlocked(store: AnyStore): boolean;
/** What the save is doing: `unsaved` when the storage is memory or its last write failed. */
export type SaveStatus = "saving" | "unsaved" | "blocked";
/** Reads whether a store's save is writing, blocked, or held in memory only. */
export declare function saveStatus(store: AnyStore): SaveStatus;
/** Calls `listener` whenever `saveStatus` may have changed. Returns the remover. */
export declare function watchSave(store: AnyStore, listener: () => void): () => void;
/**
 * Another document writing this store's save key (another tab of the game) blocks this store's writes, so its
 * memory never lands over the newer save, and calls `onTaken` once. When both tabs write at once the one whose
 * save is older yields: the foreign write's clock `lastSeen` (the autosave carries no `savedAt`) against this
 * tab's own; this tab keeps going when its own is the same or newer, and a write that cannot be read yields. Any
 * other key, a `clear()` (`key: null`) and the kept copy included, changes nothing. The browser never fires
 * `storage` in the tab that wrote, so one tab never sees it. Returns the remover; with no window it does nothing.
 */
export declare function watchOtherTabs(store: AnyStore, onTaken: () => void): () => void;
export {};
