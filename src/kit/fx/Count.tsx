import { type CSSProperties, useEffect, useRef } from "react";
import { D, type Decimal, type DecimalSource } from "../../core/decimal";
import { prefersReducedMotion } from "./motion";

/**
 * A figure counted up like a slot machine's win: it rolls from one Decimal to another over a set time, slowing at the
 * end, then sits. It never counts through the value: each frame works out the figure in log space (a figure past
 * 1e300 rolls through its exponent), so a frame costs one format whatever the size, and a run is at most `maxFrames`
 * frames however the clock behaves. The text is written straight to the element: no React render per frame. Under
 * reduced motion it shows the end at once.
 */

/** The ease a count lands on by default: fast, then slow at the end. */
export const countEase = (t: number): number => 1 - (1 - t) ** 3;

/**
 * The figure `t` (0..1) of the way from `a` to `b`: in log space when `b` is at least 1 and the larger passes a
 * thousand (so 1 to 1e300 shows every order of magnitude), else straight. A roll up from under 1 (from nothing) to a
 * large figure goes in log space from 1, through the orders of magnitude; a small one stays straight from `a`. Pure.
 */
export function countBetween(a: Decimal, b: Decimal, t: number): Decimal {
  if (t >= 1) return b;
  if (t <= 0) return a;
  if (b.lt(1) || a.max(b).lt(1000)) return a.add(b.sub(a).mul(t));
  const la = a.max(1).log10();
  const lb = b.log10();
  return D(10).pow(la.add(lb.sub(la).mul(t)));
}

/** The most frames a run of `ms` takes: a 240 Hz screen's worth, plus the first. */
export const countFrameCap = (ms: number): number => Math.ceil((Math.max(0, ms) * 240) / 1000) + 1;

/** Options of `countUp`. */
export interface CountUpOptions {
  to: DecimalSource;
  from?: DecimalSource;
  /** How long the roll takes, ms. Default 900. */
  ms?: number;
  /** A wait before it starts, ms. Default 0. */
  delay?: number;
  format: (value: Decimal) => string;
  /** The curve over 0..1. Default `countEase`. */
  ease?: (t: number) => number;
  /** Called once, when it lands (or is finished early); not when cancelled. */
  onLand?: () => void;
  /** Called with each figure written (for a caller that tracks where the roll is). */
  onFigure?: (value: Decimal) => void;
  /** The most frames the run takes; it lands on the last. Default `countFrameCap(delay + ms)`. */
  maxFrames?: number;
  /** Show the end at once. Default `prefersReducedMotion()`. */
  reduced?: boolean;
  /** The frame scheduler. Default `requestAnimationFrame` (and `cancelAnimationFrame`). */
  frame?: (cb: (time: number) => void) => number;
  cancelFrame?: (id: number) => void;
}

/** A run in progress: `cancel` stops it where it is, `finish` writes the end and lands now. */
export interface CountRun {
  cancel(): void;
  finish(): void;
}

/** Counts `node`'s text from `from` to `to`. */
export function countUp(node: { textContent: string | null }, options: CountUpOptions): CountRun {
  const target = D(options.to);
  const start = D(options.from ?? 0);
  const { format, onLand, onFigure, ms = 900, delay = 0, ease = countEase } = options;
  const reduced = options.reduced ?? prefersReducedMotion();
  const frame = options.frame ?? ((cb: (time: number) => void) => requestAnimationFrame(cb));
  const cancelFrame = options.cancelFrame ?? ((id: number) => cancelAnimationFrame(id));
  const cap = Math.max(1, options.maxFrames ?? countFrameCap(delay + ms));
  let last = "";
  let id = 0;
  let over = false;
  const write = (value: Decimal) => {
    const text = format(value);
    if (text !== last) {
      node.textContent = text;
      last = text;
    }
    onFigure?.(value);
  };
  const land = () => {
    if (over) return;
    over = true;
    write(target);
    onLand?.();
  };
  if (reduced || ms <= 0 || typeof frame !== "function") {
    land();
    return { cancel: () => {}, finish: () => {} };
  }
  write(start);
  let began = -1;
  let frames = 0;
  const step = (time: number) => {
    if (over) return;
    frames += 1;
    if (began < 0) began = time + delay;
    const t = Math.max(0, Math.min(1, (time - began) / ms));
    if (t >= 1 || frames >= cap) {
      land();
      return;
    }
    write(countBetween(start, target, ease(t)));
    id = frame(step);
  };
  id = frame(step);
  return {
    cancel() {
      over = true;
      cancelFrame(id);
    },
    finish() {
      cancelFrame(id);
      land();
    },
  };
}

/** Props of `Count`: the figures, the timing, the formatter, and the span's class and style. */
export interface CountProps {
  to: DecimalSource;
  /** Where it starts. Default: the figure it shows now (0 at first), so a new `to` rolls on from there. */
  from?: DecimalSource;
  /** Default 900. */
  ms?: number;
  delay?: number;
  format: (value: Decimal) => string;
  ease?: (t: number) => number;
  /** Called once when it lands. */
  onLand?: () => void;
  /** Jump to the end now (a press that skips the roll). */
  skip?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * `countUp` as a span: it rolls on mount and again whenever `to` or `from` changes (by value, not identity), stops
 * on unmount, and lands at once under reduced motion or when `skip` turns on. `[data-counting]` is set while it rolls.
 */
export function Count({
  to,
  from,
  ms = 900,
  delay = 0,
  format,
  ease,
  onLand,
  skip,
  className,
  style,
}: CountProps) {
  const el = useRef<HTMLSpanElement>(null);
  const run = useRef<CountRun | null>(null);
  const shown = useRef<Decimal | null>(null);
  const latest = useRef({ format, ease, onLand });
  latest.current = { format, ease, onLand };
  const toKey = D(to).toString();
  const fromKey = from === undefined ? "" : D(from).toString();

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    node.setAttribute("data-counting", "");
    const r = countUp(node, {
      to: toKey,
      from: fromKey === "" ? (shown.current ?? 0) : fromKey,
      ms,
      delay,
      format: (v) => latest.current.format(v),
      ease: latest.current.ease,
      onFigure: (v) => {
        shown.current = v;
      },
      onLand: () => {
        node.removeAttribute("data-counting");
        latest.current.onLand?.();
      },
    });
    run.current = r;
    return () => {
      r.cancel();
      node.removeAttribute("data-counting");
      if (run.current === r) run.current = null;
    };
  }, [toKey, fromKey, ms, delay]);

  useEffect(() => {
    if (skip) run.current?.finish();
  }, [skip]);

  return <span ref={el} className={className} style={style} />;
}
