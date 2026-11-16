import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { prefersReducedMotion } from "./motion";

/**
 * The currency flight: a claim sends a handful of glyphs from the thing pressed into its currency's pill, which
 * bumps as they land. `FlightHost` (mounted once per page) owns the layer; `useFlight()` returns `fly`. Headless:
 * the layer and each glyph carry only what the flight needs to work (placement, the pointer, the animation); the
 * glyph's size and ink are the game's class, and the pill's bump is the game's CSS on `[data-pill][data-bump]`.
 */

/** The flight's numbers, ms and px. Tuned on `#fx`; the README's tuning record says why. */
export const FLIGHT = {
  count: 6,
  max: 12,
  /** Between one glyph's landing and the next. */
  stagger: 40,
  /** The whole stagger never spreads wider than this, so twelve glyphs do not queue for half a second. */
  staggerSpan: 280,
  /** Out of the source to each glyph's scatter point, on the spring. */
  burst: 160,
  /** From the scatter point into the pill, accelerating. */
  travel: 320,
  /** How long the pill holds `data-bump`. */
  bump: 160,
  scatterMin: 28,
  scatterMax: 52,
  /** How far each path bows off the straight line, as a share of its length. */
  bow: 0.28,
} as const;

/** The page root a flight is scoped to: the nearest themed root (the game page, the playground's stage). */
const PAGE_ROOT = "[data-theme]";
const GOLDEN_ANGLE = 2.399963;
const BURST_STEPS = 5;
const TRAVEL_STEPS = 16;

/** A point in CSS pixels. */
export interface Point {
  x: number;
  y: number;
}

/** One glyph's path as keyframes: positions, their times (0..1), the wait at the scatter point and the life, ms. */
export interface GlyphPath {
  x: number[];
  y: number[];
  times: number[];
  hold: number;
  duration: number;
}

/** The gap between landings for a flight of `count`: `FLIGHT.stagger`, narrowed so the spread stays capped. */
export function staggerOf(count: number): number {
  return count > 1 ? Math.min(FLIGHT.stagger, FLIGHT.staggerSpan / (count - 1)) : 0;
}

/**
 * Glyph `index` of `count`: it springs out of `from` to its own scatter point (golden-angle spread, so no two
 * overlap), waits its turn, then falls along its own quadratic into `to`, bowed to alternate sides. Pure.
 */
export function flightPath(from: Point, to: Point, index: number, count: number, seed = 0): GlyphPath {
  const spread = (index * 0.618034 + 0.3) % 1;
  const angle = seed + index * GOLDEN_ANGLE;
  const radius = FLIGHT.scatterMin + (FLIGHT.scatterMax - FLIGHT.scatterMin) * spread;
  const sx = from.x + Math.cos(angle) * radius;
  const sy = from.y + Math.sin(angle) * radius;
  const dx = to.x - sx;
  const dy = to.y - sy;
  const len = Math.hypot(dx, dy) || 1;
  const bow = FLIGHT.bow * len * (index % 2 === 0 ? 1 : -1) * (0.6 + 0.4 * spread);
  const cx = (sx + to.x) / 2 - (dy / len) * bow;
  const cy = (sy + to.y) / 2 + (dx / len) * bow;

  const hold = index * staggerOf(count);
  const duration = FLIGHT.burst + hold + FLIGHT.travel;
  const path: GlyphPath = { x: [], y: [], times: [], hold, duration };
  const at = (ms: number, x: number, y: number) => {
    path.times.push(ms / duration);
    path.x.push(x);
    path.y.push(y);
  };
  for (let i = 0; i <= BURST_STEPS; i++) {
    const u = i / BURST_STEPS;
    const e = 1 - (1 - u) ** 3;
    at(u * FLIGHT.burst, from.x + (sx - from.x) * e, from.y + (sy - from.y) * e);
  }
  if (hold > 0) at(FLIGHT.burst + hold, sx, sy);
  for (let i = 1; i <= TRAVEL_STEPS; i++) {
    const v = i / TRAVEL_STEPS;
    const t = v * v;
    const a = (1 - t) ** 2;
    const b = 2 * (1 - t) * t;
    const c = t * t;
    at(FLIGHT.burst + hold + v * FLIGHT.travel, a * sx + b * cx + c * to.x, a * sy + b * cy + c * to.y);
  }
  return path;
}

/** Options for a currency flight: the currency whose pill it lands on, what was pressed, a count and a glyph. */
export interface FlyOptions {
  /** A currency id: the target is `[data-pill="<currency>"]` in the page root. */
  currency: string;
  /** What was pressed, or its box. */
  from: Element | DOMRect;
  /** Glyphs to fly: default 6, at most 12. */
  count?: number;
  /** The glyph for an event currency; otherwise the host's `glyphOf` draws one, and with none the pill only bumps. */
  glyph?: ReactNode;
}

interface Glyph {
  id: number;
  node: ReactNode;
  path: GlyphPath;
}

interface Host {
  root: Element;
  layer: HTMLElement;
  glyphOf: (currency: string) => ReactNode;
  add: (glyphs: Glyph[]) => void;
  remove: (id: number) => void;
  later: (ms: number, run: () => void) => void;
}

/** The mounted hosts, newest last. A flight goes to the host whose root holds `from`, else the newest. */
const hosts: Host[] = [];
let nextId = 1;
let flights = 0;

/** Sets `data-bump` on the pill for `FLIGHT.bump`; an arrival while it is still set rides the same bump. */
function bump(pill: Element): void {
  if (pill.hasAttribute("data-bump")) return;
  // Read the style first so a bump right after the last one restarts the keyframe instead of continuing it.
  void getComputedStyle(pill).animationName;
  pill.setAttribute("data-bump", "");
  setTimeout(() => pill.removeAttribute("data-bump"), FLIGHT.bump);
}

function fly({ currency, from, count = FLIGHT.count, glyph }: FlyOptions): void {
  const host =
    (from instanceof Element ? hosts.findLast((h) => h.root.contains(from)) : undefined) ?? hosts.at(-1);
  const pill = host?.root.querySelector(`[data-pill=${JSON.stringify(currency)}]`);
  if (!host || !pill) return;
  const node = glyph ?? host.glyphOf(currency) ?? null;
  if (prefersReducedMotion() || node === null) {
    bump(pill);
    return;
  }
  const box = host.layer.getBoundingClientRect();
  const a = from instanceof Element ? from.getBoundingClientRect() : from;
  const b = pill.getBoundingClientRect();
  const start = { x: a.left + a.width / 2 - box.left, y: a.top + a.height / 2 - box.top };
  // A pill's glyph sits at its start, a half-height in: the glyphs land on it, not on the number.
  const end = { x: b.left + b.height / 2 - box.left, y: b.top + b.height / 2 - box.top };
  const n = Math.max(1, Math.min(FLIGHT.max, Math.floor(count)));
  const seed = flights++ * 1.3;
  const glyphs = Array.from({ length: n }, (_, i) => ({
    id: nextId++,
    node,
    path: flightPath(start, end, i, n, seed),
  }));
  host.add(glyphs);
  for (const g of glyphs) {
    host.later(g.path.duration, () => {
      host.remove(g.id);
      if (pill.isConnected) bump(pill);
    });
  }
}

/** Returns `fly`: measure `from` and the currency's pill, fly the glyphs, bump the pill as they land. */
export function useFlight(): (opts: FlyOptions) => void {
  return fly;
}

/** The glyph's size over its life, ms: springs out to 1.16 and settles, then shrinks to the pill glyph's 0.64. */
function scaleAt(ms: number, path: GlyphPath): number {
  const peak = FLIGHT.burst * 0.6;
  const shrink = FLIGHT.burst + path.hold + FLIGHT.travel / 2;
  if (ms < peak) return 0.2 + 0.96 * (1 - (1 - ms / peak) ** 2);
  if (ms < FLIGHT.burst) return 1.16 - 0.16 * ((ms - peak) / (FLIGHT.burst - peak));
  if (ms < shrink) return 1;
  return 1 - 0.36 * ((ms - shrink) / (path.duration - shrink)) ** 2;
}

/** The path as Web Animations keyframes: translate, scale and opacity at every sampled point. Pure. */
export function flightKeyframes(path: GlyphPath): Keyframe[] {
  return path.times.map((offset, k) => {
    const ms = offset * path.duration;
    const fade = Math.min(1, ms / 40, (path.duration - ms) / 60);
    return {
      offset,
      opacity: Math.max(0, fade),
      transform: `translate(${path.x[k] ?? 0}px, ${path.y[k] ?? 0}px) scale(${scaleAt(ms, path)})`,
    };
  });
}

/** What a flying glyph needs to work: placed at the layer's corner, centred on its point, unseen until animated. */
const GLYPH_STYLE = { position: "absolute", left: 0, top: 0, translate: "-50% -50%", opacity: 0 } as const;
/** The layer covers the page root and never takes the pointer. */
const LAYER_STYLE = { position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" } as const;

function FlyingGlyph({ glyph, className }: { glyph: Glyph; className: string | undefined }) {
  const ref = useRef<HTMLSpanElement>(null);
  // Before paint, so the glyph never shows at the layer's corner. No cancel on unmount: it lands as it goes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    el.animate(flightKeyframes(glyph.path), {
      duration: glyph.path.duration,
      easing: "linear",
      fill: "both",
    });
  }, [glyph]);
  return (
    <span ref={ref} className={className} style={GLYPH_STYLE} data-flight-glyph="">
      {glyph.node}
    </span>
  );
}

/** Props of `FlightHost`: the glyph a currency flies as, and the classes of the layer and of each glyph. */
export interface FlightHostProps {
  /** The glyph a currency flies as when `fly` names none, or null to only bump its pill. Read at each flight. */
  glyphOf: (currency: string) => ReactNode;
  /** The layer's class: its stacking order over the page's sheets. */
  className?: string;
  /** Each glyph's class: its size (it is centred on its point) and ink. */
  glyphClassName?: string;
}

/**
 * The flight's layer, portalled to the nearest page root (`[data-theme]`) and covering it. Mount once per page.
 * Glyphs are removed by timers at their landing, not by the animation's end, so a hidden tab still cleans up.
 */
export function FlightHost({ glyphOf, className, glyphClassName }: FlightHostProps) {
  // Through a ref, so a new resolver each render never re-registers the host (which would drop the glyphs in flight).
  const resolver = useRef(glyphOf);
  resolver.current = glyphOf;
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const [glyphs, setGlyphs] = useState<Glyph[]>([]);
  const root = anchor ? (anchor.closest(PAGE_ROOT) ?? anchor.ownerDocument.body) : null;

  useEffect(() => {
    if (!root || !layer) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const host: Host = {
      root,
      layer,
      glyphOf: (currency) => resolver.current(currency),
      add: (list) => setGlyphs((g) => [...g, ...list]),
      remove: (id) => setGlyphs((g) => g.filter((x) => x.id !== id)),
      later: (ms, run) => {
        const t = setTimeout(() => {
          timers.delete(t);
          run();
        }, ms);
        timers.add(t);
      },
    };
    hosts.push(host);
    return () => {
      hosts.splice(hosts.indexOf(host), 1);
      for (const t of timers) clearTimeout(t);
      setGlyphs([]);
    };
  }, [root, layer]);

  return (
    <>
      <span ref={setAnchor} hidden />
      {root &&
        createPortal(
          <div
            ref={setLayer}
            className={className}
            style={LAYER_STYLE}
            aria-hidden="true"
            data-flight-layer=""
          >
            {glyphs.map((g) => (
              <FlyingGlyph key={g.id} glyph={g} className={glyphClassName} />
            ))}
          </div>,
          root,
        )}
    </>
  );
}
