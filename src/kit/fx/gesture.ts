import { useEffect, useState } from "react";

/**
 * The player's own hand. A state change made while a person's gesture (a press, a click, a key) is being dispatched
 * is theirs; the same change made by a tick, a macro or an autobuyer is the machine's. Feedback reads the difference:
 * the player's own action is answered in full where they pressed, the machine's gets a tick at most. The tracker
 * listens on the window in the capture phase (before any handler on the page) and clears once the dispatch is done.
 */

/** A point in client pixels. */
export interface ScreenPoint {
  x: number;
  y: number;
}

/** What `createGestures` returns. Every read is a plain call: nothing renders when a gesture lands. */
export interface GestureTracker {
  /** True while a gesture is being dispatched: a state change now is the player's. */
  active(): boolean;
  /**
   * True while a gesture is being dispatched, or one began within `withinMs` (default the tracker's `recentMs`): a
   * buy whose effects land on the next pass is still the player's.
   */
  recent(withinMs?: number): boolean;
  /** Where the last gesture landed: the pointer, or the focused control's middle for a key. */
  point(): ScreenPoint;
  /** The element the last gesture was on. */
  target(): Element | null;
  /**
   * Something answered this gesture (a sound, a mark), so a fallback answer stays quiet. With an event, that event
   * is marked too (React's synthetic event marks its `nativeEvent`).
   */
  answer(event?: Event | { nativeEvent?: Event }): void;
  /** Whether the gesture under way was answered; with an event, whether that event was. */
  answered(event?: Event): boolean;
  /** Stops listening. */
  stop(): void;
}

/** Options of `createGestures`. */
export interface GestureOptions {
  /** Where to listen. Default `window`. */
  target?: Window;
  /** How long after a gesture began a change still counts as the player's for `recent()`, ms. Default 700. */
  recentMs?: number;
  /** A duration clock. Default `performance.now`. */
  now?: () => number;
  /** Which events are a person's. Default `event.isTrusted` (a script's `dispatchEvent` is not). */
  trusted?: (event: Event) => boolean;
}

const STARTS = ["pointerdown", "keydown"] as const;
const DURING = ["pointerup", "click", "keyup"] as const;

/** The middle of an element in client pixels, or of the viewport for none. */
export function middleOf(el: Element | null): ScreenPoint {
  if (!el) {
    const w = typeof innerWidth === "number" ? innerWidth : 0;
    const h = typeof innerHeight === "number" ? innerHeight : 0;
    return { x: w / 2, y: h / 2 };
  }
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** Any press a handler gets, React's or the DOM's. */
export interface PressLike {
  clientX?: number;
  clientY?: number;
  /** A click's count: 0 for one a key made. */
  detail?: number;
  currentTarget: EventTarget | null;
}

/** Where a press landed: the pointer, or the middle of the control for one a key made (`detail` 0). */
export function pressPoint(e: PressLike): ScreenPoint {
  const el = e.currentTarget instanceof Element ? e.currentTarget : null;
  if ((e.detail ?? 0) > 0 || !el) return { x: e.clientX ?? 0, y: e.clientY ?? 0 };
  return middleOf(el);
}

/** Tracks the gestures on `target` (default `window`) until `stop()`. */
export function createGestures(options: GestureOptions = {}): GestureTracker {
  const win = options.target ?? window;
  const now = options.now ?? (() => performance.now());
  const trusted = options.trusted ?? ((e: Event) => e.isTrusted);
  const recentMs = options.recentMs ?? 700;
  const marked = new WeakSet<Event>();
  let live = false;
  let answered = false;
  let began = Number.NEGATIVE_INFINITY;
  let at: ScreenPoint = { x: 0, y: 0 };
  let on: Element | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    live = false;
  };
  const during = (e: Event) => {
    if (!trusted(e)) return;
    live = true;
    // A click a key made carries no pointer (`detail` 0 at 0,0): it keeps the key's point.
    if (typeof MouseEvent !== "undefined" && e instanceof MouseEvent) {
      if (e.type === "pointerdown" || e.detail > 0 || e.clientX !== 0 || e.clientY !== 0)
        at = { x: e.clientX, y: e.clientY };
    }
    on = e.target instanceof Element ? e.target : null;
    if (typeof KeyboardEvent !== "undefined" && e instanceof KeyboardEvent) {
      const focused = win.document?.activeElement;
      at = middleOf(focused && focused !== win.document.body ? focused : on);
    }
    // Cleared once every listener on the way back up has run (the window's bubble is last), or on the next task if
    // the propagation was stopped.
    win.addEventListener(e.type, clear, { once: true });
    clearTimeout(timer);
    timer = setTimeout(clear, 0);
  };
  const start = (e: Event) => {
    if (!trusted(e)) return;
    began = now();
    if (!(typeof KeyboardEvent !== "undefined" && e instanceof KeyboardEvent && e.repeat)) answered = false;
    during(e);
  };
  for (const type of STARTS) win.addEventListener(type, start, true);
  for (const type of DURING) win.addEventListener(type, during, true);

  return {
    active: () => live,
    recent: (withinMs = recentMs) => live || now() - began < withinMs,
    point: () => at,
    target: () => on,
    answer(event) {
      answered = true;
      const native = event && "nativeEvent" in event ? event.nativeEvent : event;
      if (native instanceof Event) marked.add(native);
    },
    answered: (event) => (event ? marked.has(event) : answered),
    stop() {
      clearTimeout(timer);
      for (const type of STARTS) win.removeEventListener(type, start, true);
      for (const type of DURING) win.removeEventListener(type, during, true);
      live = false;
    },
  };
}

/**
 * A tracker for as long as the component is mounted (null before the first effect). The options are read once, at
 * mount.
 */
export function useGestures(options?: GestureOptions): GestureTracker | null {
  const [tracker, setTracker] = useState<GestureTracker | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the options are read once, at mount.
  useEffect(() => {
    const t = createGestures(options);
    setTracker(t);
    return () => {
      t.stop();
      setTracker(null);
    };
  }, []);
  return tracker;
}
