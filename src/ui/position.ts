// A tiny anchored-positioning helper: place a box beside another, flip to the far side when it does not fit, and
// shift along the edge to stay inside the viewport. No dependency; the geometry is pure and tested.
import { type CSSProperties, type RefObject, useLayoutEffect, useState } from "react";
import { useLatest } from "./hooks";

/** The side of the anchor a floating box sits on. */
export type Side = "top" | "right" | "bottom" | "left";
/** Where along that side: its start, centre or end. */
export type Align = "start" | "center" | "end";

/** A box in viewport pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Options of `place`: the side and alignment wanted, the gap to the anchor and the margin kept to the viewport. */
export interface PlaceOptions {
  side?: Side;
  align?: Align;
  /** Gap between anchor and box. Default 8. */
  offset?: number;
  /** Margin kept from the viewport's edges. Default 8. */
  padding?: number;
  /** Move to the opposite side when that overflows less. Default true. */
  flip?: boolean;
}

/** Where `place` put the box: its top-left corner and the side and alignment it ended on. */
export interface Placement {
  x: number;
  y: number;
  side: Side;
  align: Align;
}

const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

function along(anchorStart: number, anchorSize: number, size: number, align: Align): number {
  if (align === "start") return anchorStart;
  if (align === "end") return anchorStart + anchorSize - size;
  return anchorStart + (anchorSize - size) / 2;
}

function at(anchor: Box, box: { width: number; height: number }, side: Side, align: Align, offset: number) {
  switch (side) {
    case "top":
      return { x: along(anchor.x, anchor.width, box.width, align), y: anchor.y - box.height - offset };
    case "bottom":
      return { x: along(anchor.x, anchor.width, box.width, align), y: anchor.y + anchor.height + offset };
    case "left":
      return { x: anchor.x - box.width - offset, y: along(anchor.y, anchor.height, box.height, align) };
    case "right":
      return { x: anchor.x + anchor.width + offset, y: along(anchor.y, anchor.height, box.height, align) };
  }
}

/** How far a box at `x, y` spills out of the viewport on its main axis (0 when it fits). */
function spill(
  p: { x: number; y: number },
  box: { width: number; height: number },
  side: Side,
  view: { width: number; height: number },
  pad: number,
): number {
  switch (side) {
    case "top":
      return Math.max(0, pad - p.y);
    case "bottom":
      return Math.max(0, p.y + box.height - (view.height - pad));
    case "left":
      return Math.max(0, pad - p.x);
    case "right":
      return Math.max(0, p.x + box.width - (view.width - pad));
  }
}

const shift = (n: number, size: number, limit: number, pad: number) =>
  size > limit - 2 * pad ? pad : Math.min(limit - pad - size, Math.max(pad, n));

/**
 * Where to put a box of `floating` size beside `anchor` inside `viewport`: on `side` (flipped to the opposite side
 * when that spills less), aligned, then shifted along the edge to stay `padding` inside the viewport. Pure.
 */
export function place(
  anchor: Box,
  floating: { width: number; height: number },
  viewport: { width: number; height: number },
  options: PlaceOptions = {},
): Placement {
  const { align = "center", offset = 8, padding = 8, flip = true } = options;
  let side = options.side ?? "top";
  let p = at(anchor, floating, side, align, offset);
  const out = spill(p, floating, side, viewport, padding);
  if (flip && out > 0) {
    const other = OPPOSITE[side];
    const q = at(anchor, floating, other, align, offset);
    if (spill(q, floating, other, viewport, padding) < out) {
      side = other;
      p = q;
    }
  }
  const vertical = side === "top" || side === "bottom";
  return vertical
    ? { x: shift(p.x, floating.width, viewport.width, padding), y: p.y, side, align }
    : { x: p.x, y: shift(p.y, floating.height, viewport.height, padding), side, align };
}

/** What `usePlacement` hands back: the fixed position for the floating element's style and where it landed. */
export interface PlacementState {
  style: CSSProperties;
  side: Side;
  align: Align;
}

/**
 * Keeps `floating` placed beside the anchor while `open`: measured before paint, again on resize and on any scroll.
 * `anchor` is read at measure time; `deps` re-measure when the anchor changes. The returned style is the one inline
 * style a floating part carries: `position: fixed` and its corner, which is behaviour, not look.
 */
export function usePlacement(
  anchor: () => Element | null,
  floating: RefObject<HTMLElement | null>,
  open: boolean,
  options: PlaceOptions = {},
  deps: readonly unknown[] = [],
): PlacementState {
  const opts = useLatest(options);
  const getAnchor = useLatest(anchor);
  const [state, setState] = useState<Placement>({ x: 0, y: 0, side: options.side ?? "top", align: "center" });
  // `deps` names the anchor's identity: a new anchor is measured afresh.
  useLayoutEffect(() => {
    if (!open || typeof window === "undefined") return;
    const measure = () => {
      const a = getAnchor.current();
      const f = floating.current;
      if (!a || !f) return;
      const r = a.getBoundingClientRect();
      const box = f.getBoundingClientRect();
      const next = place(
        { x: r.left, y: r.top, width: r.width, height: r.height },
        { width: box.width, height: box.height },
        { width: window.innerWidth, height: window.innerHeight },
        opts.current,
      );
      setState((was) =>
        was.x === next.x && was.y === next.y && was.side === next.side && was.align === next.align
          ? was
          : next,
      );
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, floating, getAnchor, opts, ...deps]);
  return { style: { position: "fixed", left: state.x, top: state.y }, side: state.side, align: state.align };
}
