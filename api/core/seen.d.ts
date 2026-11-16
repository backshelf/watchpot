import { type Feature } from "./feature";
/** What a `seenOnce` feature saves: the ids that have been seen. */
export interface SeenState {
    seen: Record<string, true>;
}
/** What a `seenOnce` feature does. */
export interface SeenActions {
    /** Marks an id seen. Returns whether it was new. */
    see(id: string): boolean;
    /** Marks several seen in one change (none at all when every one already is). */
    seeAll(ids: readonly string[]): void;
    /** Takes an id back out, so it is new again. */
    forget(id: string): void;
}
/** The three namespaces of a `seenOnce` feature, all empty: the state is read directly and the actions change it. */
export interface SeenHelpers {
    readonly select: Record<never, never>;
    readonly def: Record<never, never>;
    readonly draft: Record<never, never>;
}
/** A `seenOnce` feature: the feature plus `select`, `def` and `draft` (each empty). */
export type SeenFeature<K extends string> = Feature<K, SeenState, SeenActions> & SeenHelpers;
/**
 * The saved "shown this once" set every game writes: under `key`, the ids of what has been introduced, read or
 * dismissed (a tip, a new tab's mark, a tutorial card, a page that says something only the first time), kept
 * through every run reset and saved with the profile. The ids are the game's own; whether a thing counts as seen
 * is `state[key].seen[id] === true`. An action that changes nothing writes nothing, so a caller may mark on every
 * render of the thing. `select`, `def` and `draft` are empty: it has nothing but state and actions.
 */
export declare function seenOnce<const K extends string>(def: {
    readonly key: K;
}): SeenFeature<K>;
