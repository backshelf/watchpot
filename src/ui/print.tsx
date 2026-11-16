// Printed figures: small live read-outs drawn as SVG in the current colour (`currentColor`), sized by the game's CSS.
// A real Code 128 barcode, a tick ruler, a strip of level bars, a sparkline with named zones, a clock-and-data
// checker and split-flap text. No words of their own: a barcode's spoken name is a prop. Every count is capped, so
// no figure from the game sizes a loop.
import { type ComponentPropsWithRef, useMemo, useState } from "react";
import { VisuallyHidden } from "./simple";

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const whole = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.floor(Number.isFinite(v) ? v : lo)));

// ---------------------------------------------------------------------------------------------------------------
// Code 128

/** Each symbol's six runs (bar, space, bar, space, bar, space), one to four modules each, by symbol value. */
const PATTERNS =
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 " +
  "123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 " +
  "232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 " +
  "313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 " +
  "111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 " +
  "114311 411113 411311 113141 114131 311141 411131 211412 211214 211232";
const PATTERN = PATTERNS.split(" ");
const START_B = 104;
const STOP = "2331112";
/** The longest text a barcode encodes; the rest is cut. */
export const BARCODE_MAX_CHARS = 80;

/** One bar: its left edge and width, in modules. */
export interface BarcodeBar {
  x: number;
  w: number;
}

/**
 * `text` in Code 128 set B: the start symbol, the data, the checksum (the weighted sum mod 103) and the stop
 * pattern, as bars in modules and the symbol's whole width. A character outside printable ASCII encodes as a space;
 * past `BARCODE_MAX_CHARS` the text is cut. The bars scan. Pure.
 */
export function code128(text: string): { bars: BarcodeBar[]; width: number } {
  const values = [...text.slice(0, BARCODE_MAX_CHARS)].map((ch) => {
    const v = ch.charCodeAt(0) - 32;
    return v >= 0 && v < 95 ? v : 0;
  });
  const check = values.reduce((acc, v, i) => acc + v * (i + 1), START_B) % 103;
  const runs = [START_B, ...values, check].map((v) => PATTERN[v] ?? PATTERN[0]).join("") + STOP;
  const bars: BarcodeBar[] = [];
  let x = 0;
  for (let i = 0; i < runs.length; i++) {
    const w = Number(runs[i]);
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  }
  return { bars, width: x };
}

/** Props of `Barcode`: what it says, what a screen reader hears instead, its height in view units, and an svg's. */
export interface BarcodeProps extends Omit<ComponentPropsWithRef<"svg">, "children"> {
  /** What the bars say (printable ASCII). */
  value: string;
  /** What a screen reader hears. Omitted, the bars are decoration (`aria-hidden`): a labelled wrapper speaks for them. */
  label?: string;
  /** The bars' height in modules (the view box). Default 10; the CSS sets the drawn size. */
  barHeight?: number;
  /**
   * A playhead: the module at this index (from 0) gets its own `<rect data-head>` over the bars, a module wide and
   * full height, for the game to style. Omitted or outside the code, nothing is drawn.
   */
  head?: number;
}

/** The index a playhead stands on, or null when it is not a whole index below `count`. */
const headAt = (head: number | undefined, count: number): number | null =>
  head !== undefined && Number.isFinite(head) && head >= 0 && Math.floor(head) < count
    ? Math.floor(head)
    : null;

/** A real Code 128 barcode of `value`, as wide as its box (`preserveAspectRatio="none"`): one path, `[data-barcode]`. */
export function Barcode({ value, label, barHeight = 10, head, ...props }: BarcodeProps) {
  const hidden = label === undefined;
  const { d, width } = useMemo(() => {
    const { bars, width } = code128(value);
    return { d: bars.map((b) => `M${b.x} 0h${b.w}v${barHeight}h${-b.w}z`).join(""), width };
  }, [value, barHeight]);
  return (
    <svg
      viewBox={`0 0 ${width} ${barHeight}`}
      preserveAspectRatio="none"
      role={hidden ? undefined : "img"}
      aria-label={label}
      aria-hidden={hidden || undefined}
      focusable={hidden ? false : undefined}
      data-barcode=""
      shapeRendering="crispEdges"
      {...props}
    >
      <path d={d} fill="currentColor" />
      <Head at={headAt(head, width)} width={1} height={barHeight} />
    </svg>
  );
}

/** A playhead over a printed track: one `<rect data-head>`, or nothing. */
function Head({ at, width, height }: { at: number | null; width: number; height: number }) {
  return at === null ? null : <rect data-head="" x={at * width} y={0} width={width} height={height} />;
}

// ---------------------------------------------------------------------------------------------------------------
// Ruler

/** A ruler's ticks as one path across a 100-unit view: every `major`th tick long. `ticks` is capped at 200. Pure. */
export function tickPath(ticks: number, major: number, height: number): string {
  const n = whole(ticks, 2, 200);
  const every = whole(major, 1, n);
  let d = "";
  for (let i = 0; i <= n; i++) d += `M${(i / n) * 100} ${height}V${i % every === 0 ? 0 : height / 2}`;
  return d;
}

/** Props of `Ruler`: its divisions, where a caret stands, its height in view units, and a span's. */
export interface RulerProps extends ComponentPropsWithRef<"span"> {
  /** Divisions along it, at most 200. Default 40. */
  ticks?: number;
  /** Every how many ticks a long one. Default 5. */
  major?: number;
  /** 0..1: a `[data-caret]` stands there, at `--at`. */
  at?: number;
  /** The view's height; the drawn size is the CSS's. Default 8. */
  tickHeight?: number;
}

/**
 * A tick ruler as wide as its box: the ticks are one stretched path whose stroke keeps its width, and a caret
 * (`<i data-caret>`, placed by `--at`) marks a figure's place. `[data-ruler]`.
 */
export function Ruler({ ticks = 40, major = 5, at, tickHeight = 8, style, ...props }: RulerProps) {
  const d = useMemo(() => tickPath(ticks, major, tickHeight), [ticks, major, tickHeight]);
  return (
    <span {...props} data-ruler="" aria-hidden="true" style={{ position: "relative", ...style }}>
      <svg
        viewBox={`0 0 100 ${tickHeight}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
        style={{ display: "block", width: "100%", height: "100%" }}
      >
        <path d={d} stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" fill="none" />
      </svg>
      {at !== undefined && (
        <i
          data-caret=""
          style={{ position: "absolute", left: `${clamp01(at) * 100}%`, "--at": clamp01(at) }}
        />
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Level bars

/**
 * A strip of `bars` bars, one per reading (0..1, oldest first, the newest at the right), mirrored about the middle,
 * each `barWidth` wide with `gap` between; missing readings at the left draw as the floor. Capped at 240 bars. Pure.
 */
export function levelBarsPath(
  values: readonly number[],
  bars: number,
  height: number,
  barWidth = 2,
  gap = 1,
): { d: string; width: number } {
  const n = whole(bars, 1, 240);
  const from = Math.max(0, values.length - n);
  const pad = n - (values.length - from);
  const step = barWidth + gap;
  let d = "";
  for (let i = 0; i < n; i++) {
    const v = i < pad ? 0 : clamp01(values[from + i - pad] ?? 0);
    const h = Math.max(1, v * height);
    d += `M${i * step} ${(height - h) / 2}h${barWidth}v${h}h${-barWidth}z`;
  }
  return { d, width: n * step - gap };
}

/** Props of `LevelBars`: the readings, how many bars, the view's height, and an svg's. */
export interface LevelBarsProps extends Omit<ComponentPropsWithRef<"svg">, "children" | "values"> {
  /** 0..1 readings, oldest first. */
  values: readonly number[];
  /** Default 48, at most 240. */
  bars?: number;
  /** Default 24. */
  barsHeight?: number;
}

/** A level strip (a meter's history, a waveform): one path, `[data-level-bars]`. */
export function LevelBars({ values, bars = 48, barsHeight = 24, ...props }: LevelBarsProps) {
  const { d, width } = levelBarsPath(values, bars, barsHeight);
  return (
    <svg
      viewBox={`0 0 ${width} ${barsHeight}`}
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
      data-level-bars=""
      {...props}
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Sparkline

/** The box and range a series is drawn in. */
export interface SeriesFrame {
  width: number;
  height: number;
  /** The value at the foot. Default the series' least. */
  min?: number;
  /** The value at the top. Default the series' greatest. */
  max?: number;
  /** Space kept above and below, in view units. Default 3. */
  pad?: number;
}

/** Where `value` sits in the frame, top down, clamped inside it. Pure. */
export function seriesY(value: number, min: number, max: number, height: number, pad = 3): number {
  const span = max - min;
  const level = span > 0 ? clamp01((value - min) / span) : 0.5;
  return pad + (1 - level) * Math.max(0, height - pad * 2);
}

/** The most points a sparkline draws: a longer series keeps its newest. */
export const SERIES_MAX_POINTS = 512;

/**
 * A series as points spread evenly across the frame, oldest at the left (the newest `SERIES_MAX_POINTS`), and the
 * range they were drawn in. Non-finite values are skipped. Pure.
 */
export function seriesPoints(
  values: readonly number[],
  frame: SeriesFrame,
): { points: [number, number][]; min: number; max: number } {
  const shown = values.slice(-SERIES_MAX_POINTS).filter((v) => Number.isFinite(v));
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const v of shown) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const min = frame.min ?? (shown.length > 0 ? lo : 0);
  const max = frame.max ?? (shown.length > 0 ? hi : 1);
  const last = Math.max(1, shown.length - 1);
  const points = shown.map(
    (v, i) => [(i / last) * frame.width, seriesY(v, min, max, frame.height, frame.pad)] as [number, number],
  );
  return { points, min, max };
}

/**
 * A band across the chart between two values, named for the game's CSS (`[data-zone="<name>"]`). An end at or past
 * the range's `min` or `max` runs to the frame's edge, through the pad.
 */
export interface SeriesZone {
  name: string;
  from: number;
  to: number;
}

/** A rule across the chart at a value (`[data-rule="<name>"]`): an average, a cost basis, a target. */
export interface SeriesRule {
  name: string;
  at: number;
}

/** Props of `Sparkline`: the series, its frame, its zones and rules, and an svg's. */
export interface SparklineProps
  extends Omit<ComponentPropsWithRef<"svg">, "children" | "values" | "width" | "height" | "min" | "max">,
    SeriesFrame {
  values: readonly number[];
  /** What a screen reader hears (the price now, the trend). */
  label: string;
  zones?: readonly SeriesZone[];
  rules?: readonly SeriesRule[];
  /** Fill under the line (`[data-area]`). Default false. */
  area?: boolean;
  /** A dot on the newest point (`[data-dot]`). Default true. */
  dot?: boolean;
  /** Its radius in view units. Default 3. */
  dotRadius?: number;
}

/**
 * A series as a line (`[data-line]`), over named bands (`[data-zone]`: a buy zone and a sell zone) and rules
 * (`[data-rule]`), with a dot on the newest point. Stretched to its box; strokes keep their width. The colours, the
 * fill and the stroke are the game's CSS on those attributes.
 */
export function Sparkline({
  values,
  label,
  width,
  height,
  min,
  max,
  pad = 3,
  zones = [],
  rules = [],
  area = false,
  dot = true,
  dotRadius = 3,
  ...props
}: SparklineProps) {
  const series = seriesPoints(values, { width, height, min, max, pad });
  const y = (v: number) => seriesY(v, series.min, series.max, height, pad);
  // A zone that runs to the range's end runs to the frame's edge, past the pad.
  const edge = (v: number) => (v >= series.max ? 0 : v <= series.min ? height : y(v));
  const line = series.points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const last = series.points.at(-1);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      data-sparkline=""
      {...props}
    >
      {zones.map((z) => {
        const top = Math.min(edge(z.from), edge(z.to));
        const foot = Math.max(edge(z.from), edge(z.to));
        return <rect key={z.name} data-zone={z.name} x={0} y={top} width={width} height={foot - top} />;
      })}
      {rules.map((r) => (
        <path
          key={r.name}
          data-rule={r.name}
          d={`M0 ${y(r.at)}H${width}`}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {area && line && <polyline data-area="" points={`0,${height} ${line} ${width},${height}`} />}
      {line && <polyline data-line="" points={line} fill="none" vectorEffect="non-scaling-stroke" />}
      {dot && last && <circle data-dot="" cx={last[0]} cy={last[1]} r={dotRadius} />}
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Checker

/** A whole number's low bits as 0s and 1s, `width` long (at most 64), highest first. Pure. */
export function bitsOf(value: number, width = 24): string {
  const w = whole(width, 1, 64);
  let v = Number.isFinite(value) ? Math.abs(Math.floor(value)) : 0;
  let out = "";
  for (let i = 0; i < w; i++) {
    out = (v % 2 === 1 ? "1" : "0") + out;
    v = Math.floor(v / 2);
  }
  return out;
}

/** Props of `Checker`: the data track's bits, the cell size, and an svg's. */
export interface CheckerProps extends Omit<ComponentPropsWithRef<"svg">, "children"> {
  /** 0s and 1s (at most 64 read). */
  bits: string;
  /** Default 4. */
  cell?: number;
  /**
   * A playhead: the cell at this index (from 0) gets its own `<rect data-head>` over both tracks, for the game to
   * style. Omitted or outside the cells, nothing is drawn.
   */
  head?: number;
}

/** A clock track of alternating cells over a data track that is `bits`: a figure printed as a machine reads it. */
export function Checker({ bits, cell = 4, head, ...props }: CheckerProps) {
  const data = bits.slice(0, 64);
  const n = Math.max(1, data.length);
  let d = "";
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) d += `M${i * cell} 0h${cell}v${cell}h${-cell}z`;
    if (data[i] === "1") d += `M${i * cell} ${cell}h${cell}v${cell}h${-cell}z`;
  }
  return (
    <svg
      viewBox={`0 0 ${n * cell} ${cell * 2}`}
      width={n * cell}
      height={cell * 2}
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
      data-checker=""
      {...props}
    >
      <path d={d} fill="currentColor" />
      <Head at={headAt(head, n)} width={cell} height={cell * 2} />
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Split-flap text

/** Props of `SplitFlap`: the text, the characters that are gaps, and a span's. */
export interface SplitFlapProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  text: string;
  /** Characters drawn as a gap (`data-gap`), not a flap. Default space and colon. */
  gaps?: string;
  /** The longest text shown; the rest is cut. Default 32. */
  maxChars?: number;
}

/**
 * Text on split flaps: each character its own `[data-flap]` cell, keyed by its place and character, so a cell whose
 * character changes is a new element and the game's flip keyframes run on it alone. `data-prev` holds the character
 * it replaced (for the falling half), `data-gap` marks a separator. A screen reader hears the whole text once,
 * from a visually hidden copy; the cells are hidden from it.
 */
export function SplitFlap({ text, gaps = " :", maxChars = 32, ...props }: SplitFlapProps) {
  const chars = [...text].slice(0, whole(maxChars, 1, 256));
  // The text it showed before this one is state from the last render, stored as React's docs recommend.
  const [seen, setSeen] = useState({ text, prev: text });
  if (seen.text !== text) setSeen({ text, prev: seen.text });
  const before = [...(seen.text === text ? seen.prev : seen.text)];
  return (
    <span {...props} data-split-flap="">
      <VisuallyHidden>{text}</VisuallyHidden>
      {chars.map((c, i) => (
        <span
          key={`${i}-${c}`}
          aria-hidden="true"
          data-flap=""
          data-prev={before[i] !== undefined && before[i] !== c ? before[i] : undefined}
          data-gap={gaps.includes(c) ? "" : undefined}
          style={{ "--i": i }}
        >
          {c}
        </span>
      ))}
    </span>
  );
}
