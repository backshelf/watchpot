// Decoration that steps aside: marks printed on a backdrop (a margin's figures, a ruler, a barcode) are hidden where
// a solid panel would sit over part of them, so nothing reads half-covered. Measured on a scroll, a resize and a slow
// interval, batched into one frame, every rect read before any attribute is written: no layout thrash.
import { type RefObject, useEffect } from "react";

/** The edges of a box in client pixels, as `getBoundingClientRect` gives them. */
export interface Edges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Options of `coveredBy`: the slack round each mark and the window the solids are seen through. */
export interface CoverOptions {
  /** A solid this close to a mark counts as over it, px. Default 4. */
  margin?: number;
  /** Solids are clipped to this box (the scrolling stage): a part scrolled out of it covers nothing. */
  view?: Edges;
}

/**
 * For each mark, whether any solid sits over part of it (within `margin`, clipped to `view`). A mark with no size
 * (hidden, not laid out) is never covered. Pure.
 */
export function coveredBy(
  marks: readonly Edges[],
  solids: readonly Edges[],
  options: CoverOptions = {},
): boolean[] {
  const m = options.margin ?? 4;
  const view = options.view;
  return marks.map((mark) => {
    if (mark.right - mark.left <= 0 && mark.bottom - mark.top <= 0) return false;
    const top = view ? Math.max(mark.top - m, view.top) : mark.top - m;
    const bottom = view ? Math.min(mark.bottom + m, view.bottom) : mark.bottom + m;
    return solids.some(
      (r) => r.right > mark.left - m && r.left < mark.right + m && r.bottom > top && r.top < bottom,
    );
  });
}

/** Options of `useClearUnder`. */
export interface ClearUnderOptions extends Omit<CoverOptions, "view"> {
  /** The decorative marks inside the first root. Default `[data-clear]`. */
  marks?: string;
  /** The solids inside the second root. Default `[data-solid]`. */
  solids?: string;
  /** Set on a covered mark (your CSS fades it). Default `data-covered`. */
  attr?: string;
  /** Also measure this often, ms, for solids that move without a resize. Default 1000; 0 for never. */
  everyMs?: number;
  /** Measure again from scratch when this changes (the open page: new panels). */
  key?: unknown;
}

/**
 * Hides decoration under solid panels: every `marks` element inside `decor` that a `solids` element inside `over`
 * sits over gets `attr`, and loses it when the panels move off. Measured once at mount, on a scroll of `over`, on a
 * resize of `over` or its first child, and every `everyMs`, at most once a frame.
 */
export function useClearUnder(
  decor: RefObject<HTMLElement | null>,
  over: RefObject<HTMLElement | null>,
  options: ClearUnderOptions = {},
): void {
  const {
    marks = "[data-clear]",
    solids = "[data-solid]",
    attr = "data-covered",
    margin = 4,
    everyMs = 1000,
    key,
  } = options;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the caller's signal to measure from scratch.
  useEffect(() => {
    const host = decor.current;
    const stage = over.current;
    if (!host || !stage) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      // Every read first, then the writes: an attribute written between two reads would force a layout each time.
      const solidBoxes = [...stage.querySelectorAll(solids)].map((el) => el.getBoundingClientRect());
      const view = stage.getBoundingClientRect();
      const els = [...host.querySelectorAll<HTMLElement>(marks)];
      const hits = coveredBy(
        els.map((el) => el.getBoundingClientRect()),
        solidBoxes,
        { margin, view },
      );
      els.forEach((el, i) => {
        const hit = hits[i] ?? false;
        if (hit !== el.hasAttribute(attr)) el.toggleAttribute(attr, hit);
      });
    };
    const soon = () => {
      if (raf === 0) raf = requestAnimationFrame(check);
    };
    check();
    stage.addEventListener("scroll", soon, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(soon);
    ro?.observe(stage);
    if (stage.firstElementChild) ro?.observe(stage.firstElementChild);
    const id = everyMs > 0 ? setInterval(soon, everyMs) : undefined;
    return () => {
      stage.removeEventListener("scroll", soon);
      ro?.disconnect();
      clearInterval(id);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [decor, over, marks, solids, attr, margin, everyMs, key]);
}
