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
    answer(event?: Event | {
        nativeEvent?: Event;
    }): void;
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
/** The middle of an element in client pixels, or of the viewport for none. */
export declare function middleOf(el: Element | null): ScreenPoint;
/** Any press a handler gets, React's or the DOM's. */
export interface PressLike {
    clientX?: number;
    clientY?: number;
    /** A click's count: 0 for one a key made. */
    detail?: number;
    currentTarget: EventTarget | null;
}
/** Where a press landed: the pointer, or the middle of the control for one a key made (`detail` 0). */
export declare function pressPoint(e: PressLike): ScreenPoint;
/** Tracks the gestures on `target` (default `window`) until `stop()`. */
export declare function createGestures(options?: GestureOptions): GestureTracker;
/**
 * A tracker for as long as the component is mounted (null before the first effect). The options are read once, at
 * mount.
 */
export declare function useGestures(options?: GestureOptions): GestureTracker | null;
