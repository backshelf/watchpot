// Feedback that comes and goes: floating numbers at a press, and toasts. Neither animates: the game's CSS keyframes
// drive both, and the engine only adds, times and removes.
import {
  type AnimationEvent,
  type ComponentPropsWithRef,
  type FocusEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { mergeProps } from "./slot";

// ---------------------------------------------------------------------------------------------------------------
// Floating numbers

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
export function useFloatingNumbers(options: FloatingNumbersOptions = {}): FloatingNumbersApi {
  const { max = 32, lifetime = 1500 } = options;
  const [items, setItems] = useState<FloatItem[]>([]);
  const next = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t !== undefined) clearTimeout(t);
    timers.current.delete(id);
    setItems((list) => list.filter((f) => f.id !== id));
  }, []);

  const spawn = useCallback(
    (float: FloatSpawn) => {
      const id = next.current++;
      timers.current.set(
        id,
        setTimeout(() => remove(id), lifetime),
      );
      setItems((list) => {
        const all = [...list, { ...float, id }];
        const drop = all.slice(0, Math.max(0, all.length - max));
        for (const f of drop) {
          const t = timers.current.get(f.id);
          if (t !== undefined) clearTimeout(t);
          timers.current.delete(f.id);
        }
        return all.slice(drop.length);
      });
    },
    [lifetime, max, remove],
  );

  useEffect(() => {
    const all = timers.current;
    return () => {
      for (const t of all.values()) clearTimeout(t);
      all.clear();
    };
  }, []);

  return { spawn, remove, items };
}

/** Props of `FloatingNumbers`: the floats from `useFloatingNumbers`, and a div's. */
export interface FloatingNumbersProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  floats: FloatingNumbersApi;
}

/**
 * The floats' host, hidden from assistive tech (say a gain elsewhere, once). Each float is a `[data-float]` span
 * placed absolutely at its point (`--x`, `--y` too), removed when its own CSS animation ends. Position the host.
 */
export function FloatingNumbers({ floats, ...props }: FloatingNumbersProps) {
  return (
    <div aria-hidden="true" {...props}>
      {floats.items.map((f) => (
        <span
          key={f.id}
          data-float=""
          className={f.className}
          style={{ position: "absolute", left: f.x, top: f.y, "--x": `${f.x}px`, "--y": `${f.y}px` }}
          onAnimationEnd={(event: AnimationEvent) => {
            // Only its own animation: a child's ending bubbles here too.
            if (event.target === event.currentTarget) floats.remove(f.id);
          }}
        >
          {f.node}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Toasts

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
  push: (toast: Omit<Toast, "id"> & { id?: string }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
  /** Holds every visible toast's time (hover, focus, a hidden tab). */
  pause: () => void;
  resume: () => void;
  subscribe: (listener: () => void) => () => void;
  snapshot: () => ToastsSnapshot;
}

interface Timed {
  toast: Toast;
  remaining: number;
  startedAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * A toast store outside React (a game pushes from anywhere): toasts show up to `max` at once (one in "queue" mode),
 * each for its duration; time pauses while `pause` holds and resumes with what was left.
 */
export function createToasts(options: ToastsOptions = {}): ToastStore {
  const { mode = "stack", duration = 4000, now = () => performance.now() } = options;
  const max = mode === "queue" ? 1 : Math.max(1, options.max ?? 3);
  const all: Timed[] = [];
  const listeners = new Set<() => void>();
  let paused = false;
  let seq = 0;
  let snap: ToastsSnapshot = { visible: [], waiting: 0, paused };

  const emit = () => {
    snap = { visible: all.slice(0, max).map((t) => t.toast), waiting: Math.max(0, all.length - max), paused };
    for (const l of listeners) l();
  };
  const halt = (t: Timed) => {
    if (t.timer !== null) clearTimeout(t.timer);
    if (t.startedAt !== null) t.remaining -= now() - t.startedAt;
    t.timer = null;
    t.startedAt = null;
  };
  const run = () => {
    all.slice(0, max).forEach((t) => {
      if (paused || t.timer !== null || !Number.isFinite(t.remaining)) return;
      t.startedAt = now();
      t.timer = setTimeout(() => store.dismiss(t.toast.id), Math.max(0, t.remaining));
    });
  };

  const store: ToastStore = {
    push(input) {
      const id = input.id ?? `toast-${++seq}`;
      const toast: Toast = { ...input, id };
      const life = toast.duration ?? duration;
      const held = all.find((t) => t.toast.id === id);
      if (held) {
        halt(held);
        held.toast = toast;
        held.remaining = life;
      } else all.push({ toast, remaining: life, startedAt: null, timer: null });
      run();
      emit();
      return id;
    },
    dismiss(id) {
      const at = all.findIndex((t) => t.toast.id === id);
      const t = all[at];
      if (!t) return;
      halt(t);
      all.splice(at, 1);
      run();
      emit();
    },
    clear() {
      for (const t of all) halt(t);
      all.length = 0;
      emit();
    },
    pause() {
      if (paused) return;
      paused = true;
      for (const t of all) halt(t);
      emit();
    },
    resume() {
      if (!paused) return;
      paused = false;
      run();
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => snap,
  };
  return store;
}

/** The store's snapshot in React: the visible toasts, how many wait, whether time is paused. */
export function useToasts(store: ToastStore): ToastsSnapshot {
  return useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
}

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
export function Toaster({ store, renderToast, politeness = "polite", ...props }: ToasterProps) {
  const { visible } = useToasts(store);
  const reasons = useRef(new Set<string>());
  const hold = useCallback(
    (reason: string, on: boolean) => {
      if (on) reasons.current.add(reason);
      else reasons.current.delete(reason);
      if (reasons.current.size > 0) store.pause();
      else store.resume();
    },
    [store],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => hold("hidden", document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [hold]);

  // A browser fires no blur when the focused element is removed (a dismissed toast's own button): focus that went
  // with a toast is let go once the toasts change, or the time would hold for good.
  const region = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = region.current;
    if (
      visible.length >= 0 &&
      el &&
      reasons.current.has("focus") &&
      !el.contains(el.ownerDocument.activeElement)
    )
      hold("focus", false);
  }, [visible, hold]);

  return (
    <div
      {...mergeProps(
        {
          ref: region,
          role: politeness === "assertive" ? "alert" : "status",
          "aria-live": politeness,
          onPointerEnter: () => hold("hover", true),
          onPointerLeave: () => hold("hover", false),
          onFocus: () => hold("focus", true),
          onBlur: (event: FocusEvent<HTMLElement>) => {
            const to = event.relatedTarget as Node | null;
            if (!to || !event.currentTarget.contains(to)) hold("focus", false);
          },
        },
        props,
      )}
    >
      {visible.map((t) => (
        <div key={t.id} data-toast={t.id} data-tone={t.tone}>
          {renderToast(t, () => store.dismiss(t.id))}
        </div>
      ))}
    </div>
  );
}
