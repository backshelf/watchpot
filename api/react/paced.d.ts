/**
 * A paced view of a store's whole state. A screen that reads much of the state would render on every tick if it
 * selected all of it; this hands the state on at once while the player is pressing things (their own doing is
 * never late), a few times a second while the game runs by itself, and not at all while the tab is hidden (it
 * catches up when it shows). A figure that must move every tick is read with a narrow selector instead.
 */
/** Any store a paced view can read: its state and a subscription. */
export interface PaceableStore<S> {
    getState(): S;
    subscribe(listener: () => void): () => void;
}
/** Options of a paced view: its two paces and its clock. */
export interface PacedViewOptions {
    /** Between hand-ons while nobody is pressing anything, ms. Default 200. */
    idleMs?: number;
    /** For this long after a press, a key or a click, every change is handed on at once, ms. Default 500. */
    inputMs?: number;
    /** A duration clock, ms. Default `performance.now`. */
    now?: () => number;
}
/** A paced view: the state as last handed on, and a subscription to the hand-ons (`useSyncExternalStore`'s shape). */
export interface PacedView<S> {
    /** The state as last handed on; with nobody subscribed, the store's state as it is. */
    get(): S;
    /** Hears each hand-on. The store is listened to only while someone is subscribed. */
    subscribe(listener: () => void): () => void;
}
/**
 * A paced view of `store`'s whole state, of its own (`pacedView` is the one a store's readers share). A change
 * within `inputMs` of a press, a key or a click is handed on at once; any other waits until `idleMs` after the last
 * hand-on, so a ticking game is handed on every `idleMs` at most; nothing is handed on while the tab is hidden, and
 * the state is caught up as it shows. The same state object is never handed on twice.
 */
export declare function createPacedView<S>(store: PaceableStore<S>, options?: PacedViewOptions): PacedView<S>;
/**
 * The one paced view every reader of `store` shares, made at the first call (its `options` are the ones kept): one
 * subscription and one timer, however many screens read it.
 */
export declare function pacedView<S>(store: PaceableStore<S>, options?: PacedViewOptions): PacedView<S>;
/**
 * The store's whole state at the view's pace (`pacedView(store, options)`, shared): for a screen that reads much
 * of it. It re-renders at once in answer to the player's hand, every `idleMs` at most while the game runs by
 * itself, and never while the tab is hidden.
 */
export declare function usePacedState<S>(store: PaceableStore<S>, options?: PacedViewOptions): S;
