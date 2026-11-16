// The small hooks the primitives are built from. Each is exported, so a game drawing its own markup can rebuild any
// primitive's behaviour from them.
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { activeElement, focusWithoutScroll, tabbables } from "./focus";

/** A ref that always holds the latest value: handlers read it so effects need not re-run when a callback changes. */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * A value the caller may control (`value` given) or leave to the component (`defaultValue`). The setter calls
 * `onChange` on a real change and updates the inner value only when uncontrolled.
 */
export function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
): [T, (next: T) => void] {
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : inner;
  const latest = useLatest({ current, controlled, onChange });
  const set = useCallback(
    (next: T) => {
      const now = latest.current;
      if (Object.is(next, now.current)) return;
      if (!now.controlled) setInner(next);
      now.onChange?.(next);
    },
    [latest],
  );
  return [current, set];
}

// ---------------------------------------------------------------------------------------------------------------
// What the page already says

/**
 * The value of `name` on the closest ancestor of `ref`'s element that carries it (the element itself included), or
 * null when none does; read before paint and again whenever that ancestor's attribute changes. For a leaf that
 * follows a value its container already writes on the page (a theme, a mode, a tier) with no prop drilled down to
 * it. The ancestor is found as the hook mounts: one that gains the attribute later is not looked for again.
 */
export function useClosestAttribute(ref: RefObject<Element | null>, name: string): string | null {
  const [value, setValue] = useState<string | null>(null);
  useLayoutEffect(() => {
    const host = ref.current?.closest(`[${name}]`);
    if (!host) {
      setValue(null);
      return;
    }
    const read = () => setValue(host.getAttribute(name));
    read();
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(read);
    observer.observe(host, { attributes: true, attributeFilter: [name] });
    return () => observer.disconnect();
  }, [ref, name]);
  return value;
}

/**
 * Whether the CSS media `query` matches now, kept current: for the few things CSS cannot switch alone (a surface
 * not mounted at all on a small screen). False where there is no `matchMedia` (a server, a test DOM).
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (wake) => {
      if (typeof matchMedia !== "function") return () => {};
      const list = matchMedia(query);
      list.addEventListener("change", wake);
      return () => list.removeEventListener("change", wake);
    },
    () => typeof matchMedia === "function" && matchMedia(query).matches,
    () => false,
  );
}

/**
 * Whether something has just arrived: true for `ms` after `shown` turns true on a component that was mounted with
 * it false, and never for what was already there at the mount (a loaded save is not an arrival). The flag is set
 * in a layout effect, so the first frame the thing is painted in is already its arriving one: an entrance played
 * off the flag (the game's keyframes on its own `data-*`) starts from its first keyframe, with no flash of the
 * finished thing. Gone and back again is an arrival again.
 */
export function useArrived(shown: boolean, ms = 700): boolean {
  const was = useRef(shown);
  const [arrived, setArrived] = useState(false);
  useLayoutEffect(() => {
    if (shown && !was.current) setArrived(true);
    was.current = shown;
  }, [shown]);
  useEffect(() => {
    if (!arrived) return;
    const timer = setTimeout(() => setArrived(false), ms);
    return () => clearTimeout(timer);
  }, [arrived, ms]);
  return arrived;
}

// ---------------------------------------------------------------------------------------------------------------
// Escape, by layer

type EscapeLayer = RefObject<(event: KeyboardEvent) => void>;
const layers: EscapeLayer[] = [];
const ambient: EscapeLayer[] = [];

function onDocumentKey(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
  const top = layers[layers.length - 1] ?? ambient[ambient.length - 1];
  if (!top) return;
  event.preventDefault();
  top.current(event);
}

/**
 * Calls `onEscape` on Escape while `enabled`, for the topmost enabled layer only: a popover over a dialog closes
 * first. A key whose default was prevented (a part that used Escape itself, an armed `ConfirmPress`) is left alone.
 * An `ambient` layer (a notice that sits over the page without being a dialog) gets the key only while no ordinary
 * layer is enabled, however late it arrived.
 */
export function useEscape(
  onEscape: (event: KeyboardEvent) => void,
  enabled = true,
  options: { ambient?: boolean } = {},
): void {
  const handler = useLatest(onEscape);
  const isAmbient = options.ambient === true;
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const stack = isAmbient ? ambient : layers;
    stack.push(handler);
    if (layers.length + ambient.length === 1) document.addEventListener("keydown", onDocumentKey);
    return () => {
      const at = stack.lastIndexOf(handler);
      if (at >= 0) stack.splice(at, 1);
      if (layers.length + ambient.length === 0) document.removeEventListener("keydown", onDocumentKey);
    };
  }, [enabled, handler, isAmbient]);
}

// ---------------------------------------------------------------------------------------------------------------
// Focus in and out of a layer

/**
 * While `active`, remembers what had focus when it turned on, and gives focus back there when it turns off or the
 * component unmounts (if that element is still in the page). The opener is read as the hook first renders active,
 * before the commit that mounts the layer: a page that turns inert in that same commit (an `inert` prop on the
 * header beside the sheet) has already dropped focus by the time any effect runs. It is restored in a passive
 * cleanup, so call `useInert` first and the page is no longer inert when focus goes back.
 */
export function useOpenerFocus(active: boolean, restore = true): void {
  const restoreRef = useLatest(restore);
  const opener = useRef<HTMLElement | null>(null);
  const was = useRef(false);
  if (active && !was.current) opener.current = activeElement();
  was.current = active;
  useLayoutEffect(() => {
    if (active && !opener.current) opener.current = activeElement();
  }, [active]);
  useEffect(() => {
    if (!active) return;
    return () => {
      // The opener is kept, not cleared: StrictMode runs this cleanup once straight after the mount, and the layer
      // that mounts again must still know where focus goes at its real close. The next activation reads it afresh.
      const el = opener.current;
      if (restoreRef.current && el?.isConnected) focusWithoutScroll(el);
    };
  }, [active, restoreRef]);
}

/** Options of `useFocusTrap`: whether it holds, and where focus lands as it starts. */
export interface FocusTrapOptions {
  /** The trap holds only while true. */
  enabled?: boolean;
  /**
   * Where focus lands as the trap starts: this element, else the first tabbable inside, else the container (give it
   * `tabIndex={-1}`). `false` leaves focus where it is.
   */
  initialFocus?: RefObject<HTMLElement | null> | false;
  /** Wrap Tab at the ends. Default true; false moves focus in and lets it leave (a non-modal panel). */
  contain?: boolean;
}

/**
 * Keeps Tab inside `container` while enabled: focus lands inside as it starts, and Tab and Shift+Tab wrap at the
 * ends (from the container itself too, after a click on its text). The rest of the page is the caller's to make inert.
 */
export function useFocusTrap(container: RefObject<HTMLElement | null>, options: FocusTrapOptions = {}): void {
  const { enabled = true, initialFocus, contain = true } = options;
  const initial = useLatest(initialFocus);
  useEffect(() => {
    const root = container.current;
    if (!enabled || !root) return;
    const first = initial.current;
    if (first !== false) {
      const target = first?.current ?? tabbables(root)[0] ?? root;
      if (!root.contains(activeElement())) focusWithoutScroll(target);
    }
    if (!contain) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.defaultPrevented) return;
      const items = tabbables(root);
      const head = items[0];
      const tail = items[items.length - 1];
      if (!head || !tail) {
        event.preventDefault();
        return;
      }
      const at = activeElement();
      const inside = at !== null && root.contains(at);
      if (event.shiftKey && (!inside || at === head || at === root)) {
        event.preventDefault();
        focusWithoutScroll(tail);
      } else if (!event.shiftKey && (!inside || at === tail)) {
        event.preventDefault();
        focusWithoutScroll(head);
      }
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [container, enabled, contain, initial]);
}

/**
 * Sets `inert` on `target` while `enabled` (the page behind a modal), restoring what it was after. Skipped when the
 * target holds `except` (the modal itself), which would leave nothing reachable.
 */
export function useInert(
  target: RefObject<HTMLElement | null> | HTMLElement | null | undefined,
  enabled: boolean,
  except?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const el = target && "current" in target ? target.current : target;
    if (!enabled || !el) return;
    const keep = except?.current;
    if (keep && el.contains(keep)) return;
    const was = el.hasAttribute("inert");
    el.setAttribute("inert", "");
    return () => {
      if (!was) el.removeAttribute("inert");
    };
  }, [target, enabled, except]);
}

// ---------------------------------------------------------------------------------------------------------------
// Roving focus

/** Which arrows move a roving group: left/right, up/down, or both. */
export type Orientation = "horizontal" | "vertical" | "both";

/**
 * Where a key moves the focus in a list of `count` items from `index`: arrows along `orientation` (both ways in a
 * right-to-left page), Home and End to the ends; wrapping when `loop`. `null` for a key the group does not use. Pure.
 */
export function rovingIndex(
  key: string,
  index: number,
  count: number,
  orientation: Orientation = "horizontal",
  loop = true,
  rtl = false,
): number | null {
  if (count <= 0) return null;
  const horizontal = orientation !== "vertical";
  const vertical = orientation !== "horizontal";
  let step = 0;
  if (horizontal && key === "ArrowRight") step = rtl ? -1 : 1;
  else if (horizontal && key === "ArrowLeft") step = rtl ? 1 : -1;
  else if (vertical && key === "ArrowDown") step = 1;
  else if (vertical && key === "ArrowUp") step = -1;
  else if (key === "Home") return 0;
  else if (key === "End") return count - 1;
  else return null;
  const next = index + step;
  if (loop) return (next + count) % count;
  return Math.min(count - 1, Math.max(0, next));
}

/** Options of `useRovingFocus`: the items' selector, the axis, wrapping and what happens after a move. */
export interface RovingFocusOptions {
  /** The items inside the container, as a selector; `[data-roving-item]` by default. */
  items?: string;
  orientation?: Orientation;
  /** Wrap from the last item to the first. Default true. */
  loop?: boolean;
  /** Called with the item focus moved to: select it here for selection-follows-focus. */
  onMove?: (item: HTMLElement, index: number) => void;
}

/**
 * One tab stop for a group: the returned key handler (put it on the container) moves focus between the items by
 * `rovingIndex`. The caller gives the current item `tabIndex={0}` and the rest -1. Items are read from the DOM at the
 * keypress, so the group needs no registration; disabled items (`disabled` or `aria-disabled="true"`) are skipped.
 */
export function useRovingFocus(
  container: RefObject<HTMLElement | null>,
  options: RovingFocusOptions = {},
): (event: ReactKeyboardEvent) => void {
  const latest = useLatest(options);
  return useCallback(
    (event: ReactKeyboardEvent) => {
      const root = container.current;
      if (!root || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const { items = "[data-roving-item]", orientation, loop = true, onMove } = latest.current;
      const list = [...root.querySelectorAll<HTMLElement>(items)].filter(
        (el) => !(el as HTMLButtonElement).disabled && el.getAttribute("aria-disabled") !== "true",
      );
      const from = list.findIndex((el) => el === event.target || el.contains(event.target as Node));
      if (from < 0) return;
      const rtl = getComputedStyle(root).direction === "rtl";
      const to = rovingIndex(event.key, from, list.length, orientation, loop, rtl);
      if (to === null) return;
      event.preventDefault();
      const el = list[to];
      if (!el) return;
      focusWithoutScroll(el);
      onMove?.(el, to);
    },
    [container, latest],
  );
}
