// Anticipation without a look: how near a goal is, as data attributes and custom properties a game's CSS lights up.
// `useNear`/`Near` name a band of a 0..1 nearness (with hysteresis, so a value hovering on a threshold does not
// flicker), and `Marquee` rings what it wraps with bulbs that fill like a meter. Nothing here animates.
import {
  type ComponentPropsWithRef,
  type CSSProperties,
  type HTMLAttributes,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useComposedRefs } from "./slot";

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * The band `value` is in among the ascending thresholds `at`: 0 below the first, `i + 1` at or past `at[i]`. Rising
 * takes effect at a threshold; falling only once the value is `hysteresis` under it, so `current` (the band shown
 * now) holds through a wobble. Pure.
 */
export function nearLevel(value: number, at: readonly number[], current: number, hysteresis = 0.02): number {
  const v = Number.isFinite(value) ? value : 0;
  let target = 0;
  for (const [i, threshold] of at.entries()) if (v >= threshold) target = i + 1;
  if (target >= current) return target;
  let level = Math.min(current, at.length);
  while (level > target && v < (at[level - 1] ?? 0) - hysteresis) level -= 1;
  return level;
}

/** Options of `useNear`: the thresholds, the names of the bands past them, and the hysteresis. */
export interface NearOptions {
  /** Ascending 0..1 thresholds. Default `[0.8, 0.95]`. */
  at?: readonly number[];
  /** The `data-near` value of each band past a threshold, in order. Default `["near", "close"]`. */
  names?: readonly string[];
  /** How far under a threshold a falling value must go to leave its band. Default 0.02. */
  hysteresis?: number;
}

/** What `useNear` returns: the band, its name, and the props that carry both. */
export interface NearState {
  level: number;
  name: string | undefined;
  props: { "data-near"?: string; style: CSSProperties };
}

/**
 * How near `value` (0..1) is, as a band: `data-near` holds the band's name (absent below the first threshold) and
 * `--near` the value, for the game's CSS to breathe, glow or lean in.
 */
export function useNear(value: number, options: NearOptions = {}): NearState {
  const { at = [0.8, 0.95], names = ["near", "close"], hysteresis = 0.02 } = options;
  const [shown, setShown] = useState(() => nearLevel(value, at, 0, hysteresis));
  const level = nearLevel(value, at, shown, hysteresis);
  // The band from the last render is state: a change is stored during render, as React's docs recommend for state
  // derived from the previous render.
  if (level !== shown) setShown(level);
  const name = level > 0 ? (names[level - 1] ?? String(level)) : undefined;
  const props: NearState["props"] = { style: { "--near": clamp01(value) } };
  if (name !== undefined) props["data-near"] = name;
  return { level, name, props };
}

/** Props of `Near`: the nearness and its bands, and a span's. */
export interface NearProps extends ComponentPropsWithRef<"span">, NearOptions {
  /** 0..1: how near. */
  value: number;
}

/** A span carrying `useNear`'s `data-near` and `--near` around whatever it wraps (a meter, a price). */
export function Near({ value, at, names, hysteresis, style, ...props }: NearProps) {
  const near = useNear(value, { at, names, hysteresis });
  return <span {...props} {...near.props} style={{ ...near.props.style, ...style }} />;
}

/** A point `d` along the rim of a `w` by `h` box, clockwise from its top-left corner. Pure. */
export function rimPoint(d: number, w: number, h: number): [number, number] {
  const per = 2 * (w + h);
  const p = per > 0 ? ((d % per) + per) % per : 0;
  if (p < w) return [p, 0];
  if (p < w + h) return [w, p - w];
  if (p < 2 * w + h) return [w - (p - w - h), h];
  return [0, h - (p - 2 * w - h)];
}

/** Options of `rimBulbs`: the spacing along the rim, how far out it runs, and the fewest and most bulbs. */
export interface RimOptions {
  /** Between bulbs, px. Default 16. */
  spacing?: number;
  /** How far outside the box the rim runs, px. Default 5. */
  pad?: number;
  /** Default 8. */
  min?: number;
  /** Default 120: the count never follows a huge box past this. */
  max?: number;
}

/** One bulb on the rim: its place relative to the box's top-left corner and its index clockwise. */
export interface RimBulb {
  x: number;
  y: number;
  i: number;
}

/** Bulbs spaced evenly round a `w` by `h` box, clockwise from its top-left corner; none for an unmeasured box. Pure. */
export function rimBulbs(w: number, h: number, options: RimOptions = {}): RimBulb[] {
  const { spacing = 16, pad = 5, min = 8, max = 120 } = options;
  if (!(w > 0) || !(h > 0)) return [];
  const rw = w + pad * 2;
  const rh = h + pad * 2;
  const per = 2 * (rw + rh);
  const lo = Math.max(1, Math.floor(min));
  const n = Math.max(lo, Math.min(Math.max(lo, Math.floor(max)), Math.round(per / Math.max(1, spacing))));
  return Array.from({ length: n }, (_, i) => {
    const [x, y] = rimPoint((i / n) * per, rw, rh);
    return { x: x - pad, y: y - pad, i };
  });
}

/** Props of `Marquee`: how full its ring is, the ring's spacing, a bulb's extra props, and a span's. */
export interface MarqueeProps extends ComponentPropsWithRef<"span">, RimOptions {
  /** 0..1: how many bulbs are lit, clockwise from the top-left. */
  fill: number;
  /** A bulb's own props (a class for every third, a delay). */
  bulbProps?: (index: number, lit: boolean) => HTMLAttributes<HTMLElement>;
}

const RIM_STYLE: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };

/**
 * A ring of bulbs round whatever it wraps (a button that is nearly ready): `fill` lights them clockwise like a meter,
 * and the game's CSS on the root's own `data-*` (a `data-state` it passes) makes them chase or flash. The bulbs are
 * placed once per size (a `ResizeObserver` on the root), at most `max`, each an `<i data-bulb>` with `data-lit`,
 * `data-next` on the first unlit, and `--k` (its index) and `--n` (the count). The ring is `[data-rim]`, hidden
 * from assistive tech.
 */
export function Marquee({
  fill,
  spacing,
  pad,
  min,
  max,
  bulbProps,
  ref,
  style,
  children,
  ...props
}: MarqueeProps) {
  const box = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry?.contentRect;
      if (r) setSize((was) => (was.w === r.width && was.h === r.height ? was : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const refs = useComposedRefs(box, ref);
  const bulbs = rimBulbs(size.w, size.h, { spacing, pad, min, max });
  const lit = Math.round(clamp01(fill) * bulbs.length);
  return (
    <span
      {...props}
      ref={refs}
      data-marquee=""
      style={{ position: "relative", "--n": bulbs.length, ...style }}
    >
      {children}
      <span data-rim="" aria-hidden="true" style={RIM_STYLE}>
        {bulbs.map((b) => {
          const own = bulbProps?.(b.i, b.i < lit);
          return (
            <i
              key={b.i}
              {...own}
              data-bulb=""
              data-lit={b.i < lit ? "" : undefined}
              data-next={b.i === lit ? "" : undefined}
              style={{ ...own?.style, position: "absolute", left: b.x, top: b.y, "--k": b.i }}
            />
          );
        })}
      </span>
    </span>
  );
}
