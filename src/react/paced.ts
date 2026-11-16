import { useSyncExternalStore } from "react";

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

/** What counts as the player's hand: a press, a key or a click, anywhere on the page. */
const INPUTS = ["pointerdown", "pointerup", "keydown", "keyup", "click"] as const;
/** Every live view's way to hear of an input. The page is listened to only while there is one. */
const onInput = new Set<() => void>();
const heard = () => {
  for (const mark of onInput) mark();
};

function listen(mark: () => void): () => void {
  if (onInput.size === 0 && typeof window !== "undefined")
    for (const type of INPUTS) window.addEventListener(type, heard, true);
  onInput.add(mark);
  return () => {
    onInput.delete(mark);
    if (onInput.size === 0 && typeof window !== "undefined")
      for (const type of INPUTS) window.removeEventListener(type, heard, true);
  };
}

const hidden = () => typeof document !== "undefined" && document.hidden;

/**
 * A paced view of `store`'s whole state, of its own (`pacedView` is the one a store's readers share). A change
 * within `inputMs` of a press, a key or a click is handed on at once; any other waits until `idleMs` after the last
 * hand-on, so a ticking game is handed on every `idleMs` at most; nothing is handed on while the tab is hidden, and
 * the state is caught up as it shows. The same state object is never handed on twice.
 */
export function createPacedView<S>(store: PaceableStore<S>, options: PacedViewOptions = {}): PacedView<S> {
  const { idleMs = 200, inputMs = 500, now = () => performance.now() } = options;
  const listeners = new Set<() => void>();
  let snap = store.getState();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = 0;
  let lastInput = Number.NEGATIVE_INFINITY;
  let off: (() => void) | null = null;
  const flush = () => {
    timer = undefined;
    if (hidden()) return;
    const next = store.getState();
    if (next === snap) return;
    snap = next;
    last = now();
    for (const fn of [...listeners]) fn();
  };
  const changed = () => {
    const t = now();
    if (t - lastInput < inputMs) {
      if (timer !== undefined) clearTimeout(timer);
      flush();
    } else if (timer === undefined) timer = setTimeout(flush, Math.max(0, idleMs - (t - last)));
  };
  const shown = () => {
    if (!hidden()) flush();
  };
  return {
    // With nobody listening yet (a first render), the state as it is.
    get: () => (off ? snap : store.getState()),
    subscribe(fn) {
      listeners.add(fn);
      if (!off) {
        snap = store.getState();
        const unsubscribe = store.subscribe(changed);
        const unlisten = listen(() => {
          lastInput = now();
        });
        if (typeof document !== "undefined") document.addEventListener("visibilitychange", shown);
        off = () => {
          unsubscribe();
          unlisten();
          if (typeof document !== "undefined") document.removeEventListener("visibilitychange", shown);
        };
      }
      return () => {
        listeners.delete(fn);
        if (listeners.size > 0 || !off) return;
        off();
        off = null;
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
      };
    },
  };
}

const views = new WeakMap<object, PacedView<unknown>>();

/**
 * The one paced view every reader of `store` shares, made at the first call (its `options` are the ones kept): one
 * subscription and one timer, however many screens read it.
 */
export function pacedView<S>(store: PaceableStore<S>, options?: PacedViewOptions): PacedView<S> {
  const had = views.get(store);
  if (had) return had as PacedView<S>;
  const view = createPacedView(store, options);
  views.set(store, view);
  return view;
}

/**
 * The store's whole state at the view's pace (`pacedView(store, options)`, shared): for a screen that reads much
 * of it. It re-renders at once in answer to the player's hand, every `idleMs` at most while the game runs by
 * itself, and never while the tab is hidden.
 */
export function usePacedState<S>(store: PaceableStore<S>, options?: PacedViewOptions): S {
  const view = pacedView(store, options);
  return useSyncExternalStore(view.subscribe, view.get, view.get);
}
