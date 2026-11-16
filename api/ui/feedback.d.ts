import { type ComponentPropsWithRef, type ReactNode } from "react";
/** What to spawn: where (px in the host), what, and a class for this one (a crit, a currency). */
export interface FloatSpawn {
    x: number;
    y: number;
    node: ReactNode;
    className?: string;
}
/** A spawned float as the host draws it. */
export interface FloatItem extends FloatSpawn {
    id: number;
}
/** Options of `useFloatingNumbers`: how many at once and how long each lives at most. */
export interface FloatingNumbersOptions {
    /** The most on screen; the oldest goes first. Default 32. */
    max?: number;
    /** Removed after this many ms if its animation never ends (none set, reduced motion). Default 1500. */
    lifetime?: number;
}
/** What `useFloatingNumbers` hands back: `spawn`, and the items and `remove` for its host. */
export interface FloatingNumbersApi {
    spawn: (float: FloatSpawn) => void;
    remove: (id: number) => void;
    items: readonly FloatItem[];
}
/** The floats' state: spawn one at a point, each removed on its `animationend` or after `lifetime`, at most `max`. */
export declare function useFloatingNumbers(options?: FloatingNumbersOptions): FloatingNumbersApi;
/** Props of `FloatingNumbers`: the floats from `useFloatingNumbers`, and a div's. */
export interface FloatingNumbersProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
    floats: FloatingNumbersApi;
}
/**
 * The floats' host, hidden from assistive tech (say a gain elsewhere, once). Each float is a `[data-float]` span
 * placed absolutely at its point (`--x`, `--y` too), removed when its own CSS animation ends. Position the host.
 */
export declare function FloatingNumbers({ floats, ...props }: FloatingNumbersProps): import("react").JSX.Element;
/** A toast: its words and tone are data; the game draws it. */
export interface Toast {
    id: string;
    title?: ReactNode;
    body?: ReactNode;
    /** Written as `data-tone` ("info", "success", "warn", or the game's own). */
    tone?: string;
    /** Shown for this many ms; `Infinity` stays until dismissed. Default the store's. */
    duration?: number;
    /** Anything else the game's renderer needs (an icon, an action). */
    data?: unknown;
}
/** Options of `createToasts`: how many show, how they queue, the default duration and the clock. */
export interface ToastsOptions {
    /** How many show at once; the rest wait their turn. Default 3 ("stack"), always 1 for "queue". */
    max?: number;
    /** "stack" shows up to `max` together; "queue" one at a time. Default "stack". */
    mode?: "stack" | "queue";
    /** Default time on screen, ms. Default 4000. */
    duration?: number;
    /** A duration clock (not the wall clock): `performance.now` by default. */
    now?: () => number;
}
/** What a toast store holds: the toasts on screen, how many wait, and whether the timers are paused. */
export interface ToastsSnapshot {
    visible: readonly Toast[];
    waiting: number;
    paused: boolean;
}
/** A toast store from `createToasts`: push and dismiss, pause and resume, and the snapshot for React. */
export interface ToastStore {
    /** Adds a toast (an existing id is updated and its time restarts); returns its id. */
    push: (toast: Omit<Toast, "id"> & {
        id?: string;
    }) => string;
    dismiss: (id: string) => void;
    clear: () => void;
    /** Holds every visible toast's time (hover, focus, a hidden tab). */
    pause: () => void;
    resume: () => void;
    subscribe: (listener: () => void) => () => void;
    snapshot: () => ToastsSnapshot;
}
/**
 * A toast store outside React (a game pushes from anywhere): toasts show up to `max` at once (one in "queue" mode),
 * each for its duration; time pauses while `pause` holds and resumes with what was left.
 */
export declare function createToasts(options?: ToastsOptions): ToastStore;
/** The store's snapshot in React: the visible toasts, how many wait, whether time is paused. */
export declare function useToasts(store: ToastStore): ToastsSnapshot;
/** Props of `Toaster`: the store, how to draw a toast, the politeness, and a div's (name it with `aria-label`). */
export interface ToasterProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
    store: ToastStore;
    /** One toast, with its dismiss. */
    renderToast: (toast: Toast, dismiss: () => void) => ReactNode;
    /** How urgently assistive tech reads a new toast. Default "polite". */
    politeness?: "polite" | "assertive";
}
/**
 * The toasts' live region (`role="status"`, `aria-live`): each visible toast a `[data-toast]` child with
 * `data-tone`. Time pauses while the pointer is over it, while focus is in it and while the tab is hidden.
 */
export declare function Toaster({ store, renderToast, politeness, ...props }: ToasterProps): import("react").JSX.Element;
