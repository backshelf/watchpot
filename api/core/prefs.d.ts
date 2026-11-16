import { type StorageBackend } from "./storage";
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
export declare function readPrefs<T extends object>(raw: unknown, initial: T): T;
/**
 * A prefs store under `key`. A stored value `read` does not accept reads as `initial`; a write that fails is
 * dropped.
 */
export declare function prefs<T extends object>(def: PrefsDef<T>): Prefs<T>;
