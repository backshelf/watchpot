// One tooltip for the whole page, by event delegation: anything that carries the tip attribute has a tip, and
// nothing is mounted for it until it is asked for. A page with hundreds of tipped words pays for one listener set
// and one floating box, where a `Tooltip` each would mount hundreds. Placed by `usePlacement`; no look, no words.
import {
  type ComponentPropsWithoutRef,
  Fragment,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useEscape } from "./hooks";
import { Portal } from "./portal";
import { type PlaceOptions, type Side, usePlacement } from "./position";

/** What a touch does on a tipped element: a tap toggles its tip, or a held press shows it (and is not a press). */
export type TipTouch = "tap" | "hold";

/** One part of an open tip: the key an element carried, and what it says. */
export interface TipPart {
  key: string;
  node: ReactNode;
}

/** Props of `HoverTips`: what a key says, the attributes it listens for, its timing, and a div's own. */
export interface HoverTipsProps extends Omit<ComponentPropsWithoutRef<"div">, "content" | "children"> {
  /** What a key says, or null when it says nothing (no tip opens on it). Called only when a tip is asked for. */
  content: (key: string) => ReactNode;
  /** The attribute a tipped element carries, its value the key. `<attr>-side` and `<attr>-touch` tune one element. */
  attr?: string;
  /**
   * An attribute that groups tipped things (a row): keyboard focus on any control inside shows all of their tips,
   * after `scopeDelay`, so words that are not tab stops can still be read without a pointer.
   */
  scopeAttr?: string;
  /** Hover delay before a tip opens, ms. Moving from one tip to the next is quicker. Default 450. */
  delay?: number;
  /** How long after the pointer leaves it closes, ms. Default 120. */
  closeDelay?: number;
  /** How long focus rests on a control before its group's tips open, ms. Its own tip opens at once. Default 700. */
  scopeDelay?: number;
  /** How long a touch is held before a `hold` tip opens, ms. Default 500. */
  holdDelay?: number;
  /** The most tips one group shows together. Default 5. */
  scopeMost?: number;
  /** Nothing opens. */
  disabled?: boolean;
  /** Where the box sits by its anchor (`<attr>-side` on an element wins for that element). */
  place?: PlaceOptions;
  /** Draws the open tip from its parts (one for a hover, several for a group). Default: one after another. */
  children?: (parts: readonly TipPart[]) => ReactNode;
}

/** What does something when pressed: a tip on one of these waits for a held touch, so a tap stays a press. */
const INTERACTIVE =
  'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"], [role="option"]';

/** Moving from an open tip to another opens it this soon, ms. */
const WARM_MS = 70;
/** A tip that closed this recently counts as still open for the next one, ms. */
const WARM_FOR_MS = 400;
/** A touch that moves this far is a scroll, not a hold, px. */
const SLOP_PX = 10;

/** The keys `useTipSlot` hands out start with this; a game's own keys do not. */
const SLOT = "slot:";
const slots = new Map<string, { current: ReactNode }>();

/**
 * A tip whose content is not a key but a node of the caller's own: the key to put in the tip attribute. The node
 * is read when the tip opens; one that must move while it is open subscribes to what it shows itself. Any
 * `HoverTips` on the page answers it, whatever its `content` says.
 */
export function useTipSlot(content: ReactNode): string {
  const key = `${SLOT}${useId()}`;
  const ref = useRef(content);
  ref.current = content;
  useEffect(() => {
    slots.set(key, ref);
    return () => {
      slots.delete(key);
    };
  }, [key]);
  return key;
}

type Opened = "hover" | "focus" | "touch";

interface Open {
  anchor: Element;
  keys: readonly string[];
  by: Opened;
}

/**
 * The page's tips. Mounted once. Hover opens after `delay`, keyboard focus at once (a group's after `scopeDelay`),
 * Escape or leaving closes, a press on the thing itself closes. On a touch, a tap on a tipped word toggles its tip
 * (and is not a press on the button the word sits in), and a button with a tip shows it on a held press (which then
 * is not a press either). The box is `role="tooltip"` and describes its anchor while open; `data-state`,
 * `data-side`, `data-align` and `data-by` ("hover" | "focus" | "touch") style it. A box that takes the pointer
 * stays open while the pointer is on it; one the game gives `pointer-events: none` lets the page under it be read.
 */
export function HoverTips({
  content,
  attr = "data-tip",
  scopeAttr = "data-tip-scope",
  delay = 450,
  closeDelay = 120,
  scopeDelay = 700,
  holdDelay = 500,
  scopeMost = 5,
  disabled = false,
  place,
  children,
  style,
  ...rest
}: HoverTipsProps) {
  const [open, setOpen] = useState<Open | null>(null);
  const floating = useRef<HTMLDivElement>(null);
  const id = useId();
  const latest = useRef({ content, open });
  latest.current = { content, open };

  const side = (open?.anchor.getAttribute(`${attr}-side`) as Side | null) ?? place?.side;
  const placement = usePlacement(
    () => latest.current.open?.anchor ?? null,
    floating,
    open !== null,
    {
      ...place,
      side,
    },
    [open?.anchor, open?.keys.join("\n")],
  );
  useEscape(() => setOpen(null), open !== null, { ambient: true });

  // The box describes its anchor while it is open, and goes when the anchor does.
  useEffect(() => {
    if (!open) return;
    const { anchor } = open;
    const was = anchor.getAttribute("aria-describedby");
    anchor.setAttribute("aria-describedby", was ? `${was} ${id}` : id);
    const gone = setInterval(() => {
      if (!anchor.isConnected) setOpen(null);
    }, 250);
    return () => {
      clearInterval(gone);
      if (was === null) anchor.removeAttribute("aria-describedby");
      else anchor.setAttribute("aria-describedby", was);
    };
  }, [open, id]);

  useEffect(() => {
    if (disabled) {
      setOpen(null);
      return;
    }
    const selector = `[${attr}]`;
    type Timer = ReturnType<typeof setTimeout> | undefined;
    let openTimer: Timer;
    let closeTimer: Timer;
    let holdTimer: Timer;
    let closedAt = Number.NEGATIVE_INFINITY;
    let lastPointer = "mouse";
    let held = false;
    let touchAt: { x: number; y: number } | null = null;

    const says = (key: string): boolean => {
      const node = key.startsWith(SLOT) ? slots.get(key)?.current : latest.current.content(key);
      return node !== null && node !== undefined && node !== false;
    };
    /** The keys of these elements that say something, each once. */
    const keysOf = (els: readonly Element[]): string[] => {
      const keys: string[] = [];
      for (const el of els) {
        const key = el.getAttribute(attr);
        if (key && !keys.includes(key) && says(key)) keys.push(key);
      }
      return keys;
    };
    /** The element a tip is about to open on. */
    let pending: Element | null = null;
    let pendingBy: Opened | null = null;
    const clearOpen = () => {
      clearTimeout(openTimer);
      openTimer = undefined;
      pending = null;
    };
    const clearClose = () => {
      clearTimeout(closeTimer);
      closeTimer = undefined;
    };
    /** Closes the open tip. A tip on its way to opening elsewhere is left to: leaving one is not leaving the next. */
    const hide = () => {
      clearClose();
      if (latest.current.open) closedAt = performance.now();
      setOpen(null);
    };
    const show = (anchor: Element, keys: readonly string[], by: Opened) => {
      clearOpen();
      clearClose();
      if (keys.length === 0 || !anchor.isConnected) return;
      setOpen({ anchor, keys, by });
    };
    const showAfter = (ms: number, anchor: Element, keys: () => readonly string[], by: Opened) => {
      clearOpen();
      pending = anchor;
      pendingBy = by;
      openTimer = setTimeout(() => show(anchor, keys(), by), ms);
    };
    const closeSoon = () => {
      if (closeTimer) return;
      closeTimer = setTimeout(hide, closeDelay);
    };
    const tipOf = (target: EventTarget | null): Element | null =>
      target instanceof Element ? target.closest(selector) : null;
    const touchOf = (el: Element): TipTouch => {
      const set = el.getAttribute(`${attr}-touch`);
      if (set === "tap" || set === "hold") return set;
      return el.matches(INTERACTIVE) ? "hold" : "tap";
    };

    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const now = latest.current.open;
      // Onto the words themselves (a box that takes the pointer): it stays while the pointer is on it.
      if (now && e.target instanceof Node && floating.current?.contains(e.target)) {
        clearOpen();
        clearClose();
        return;
      }
      const el = tipOf(e.target);
      if (!el) {
        clearOpen();
        if (now && now.by !== "focus") closeSoon();
        return;
      }
      if (el === now?.anchor) {
        clearOpen();
        clearClose();
        return;
      }
      // Still inside the thing a tip is already on its way to: the wait is not started over.
      if (el === pending) return;
      const warm = now !== null || performance.now() - closedAt < WARM_FOR_MS;
      showAfter(warm ? WARM_MS : delay, el, () => keysOf([el]), "hover");
      if (now && now.by !== "focus") closeSoon();
    };
    const out = (e: PointerEvent) => {
      // Out of the window altogether.
      if (e.relatedTarget !== null || e.pointerType === "touch") return;
      clearOpen();
      if (latest.current.open?.by === "hover") closeSoon();
    };
    const down = (e: PointerEvent) => {
      lastPointer = e.pointerType;
      held = false;
      clearOpen();
      clearTimeout(holdTimer);
      const el = tipOf(e.target);
      if (e.pointerType !== "touch") {
        // A press on the thing is about the thing: the tip gets out of the way.
        hide();
        return;
      }
      touchAt = el ? { x: e.clientX, y: e.clientY } : null;
      if (!el) {
        hide();
        return;
      }
      if (touchOf(el) === "hold")
        holdTimer = setTimeout(() => {
          const keys = keysOf([el]);
          if (keys.length === 0) return;
          held = true;
          show(el, keys, "touch");
        }, holdDelay);
    };
    const move = (e: PointerEvent) => {
      if (!touchAt || e.pointerType !== "touch") return;
      if (Math.hypot(e.clientX - touchAt.x, e.clientY - touchAt.y) < SLOP_PX) return;
      touchAt = null;
      clearTimeout(holdTimer);
    };
    const up = () => clearTimeout(holdTimer);
    const click = (e: MouseEvent) => {
      const type = (e as PointerEvent).pointerType || lastPointer;
      if (type !== "touch") return;
      const swallow = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (held) {
        // The press was held to read the tip: it is not a press on the thing.
        held = false;
        swallow();
        return;
      }
      const el = tipOf(e.target);
      if (!el || touchOf(el) !== "tap") return;
      const keys = keysOf([el]);
      if (keys.length === 0) return;
      if (latest.current.open?.anchor === el) hide();
      else show(el, keys, "touch");
      // A word inside a button: the tap was for the word.
      if (el.parentElement?.closest(INTERACTIVE)) swallow();
    };
    const focusIn = (e: FocusEvent) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      // Focus a press put there says nothing: only the keyboard's.
      let byKeys = true;
      try {
        byKeys = el.matches(":focus-visible");
      } catch {
        // An engine without the selector: every focus counts.
      }
      if (!byKeys) return;
      const own = el.hasAttribute(attr) ? keysOf([el]) : [];
      const scope = scopeAttr ? el.closest(`[${scopeAttr}]`) : null;
      const around = () =>
        scope
          ? keysOf([...scope.querySelectorAll(selector)].filter((x) => x !== el)).slice(0, scopeMost)
          : [];
      if (own.length > 0) show(el, [...own, ...around().filter((k) => !own.includes(k))], "focus");
      else if (scope) showAfter(scopeDelay, el, around, "focus");
    };
    const focusOut = () => {
      clearOpen();
      if (latest.current.open?.by === "focus") hide();
    };
    const scroll = (e: Event) => {
      // A tip the pointer opened does not ride its page as it scrolls; one focus opened stays with its control.
      // Something else scrolling (a log feeding itself) is nothing to do with it.
      if (!(e.target instanceof Node)) return;
      if (pending && pendingBy !== "focus" && e.target.contains(pending)) clearOpen();
      const now = latest.current.open;
      if (now && now.by !== "focus" && e.target.contains(now.anchor)) hide();
    };

    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    document.addEventListener("click", click, true);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    window.addEventListener("scroll", scroll, { capture: true, passive: true });
    return () => {
      clearOpen();
      clearClose();
      clearTimeout(holdTimer);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [disabled, attr, scopeAttr, delay, closeDelay, scopeDelay, holdDelay, scopeMost]);

  if (typeof document === "undefined") return null;
  const parts: TipPart[] = [];
  if (open && !disabled)
    for (const key of open.keys) {
      const node = key.startsWith(SLOT) ? slots.get(key)?.current : content(key);
      if (node !== null && node !== undefined && node !== false) parts.push({ key, node });
    }
  const shown = parts.length > 0;
  return (
    <Portal>
      <div
        {...rest}
        ref={floating}
        id={id}
        role="tooltip"
        hidden={!shown}
        style={{ ...style, ...placement.style }}
        data-state={shown ? "open" : "closed"}
        data-side={placement.side}
        data-align={placement.align}
        data-by={open?.by}
      >
        {shown && (children ? children(parts) : parts.map((p) => <Fragment key={p.key}>{p.node}</Fragment>))}
      </div>
    </Portal>
  );
}
