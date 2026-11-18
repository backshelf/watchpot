// One graph of the desk: hand-rolled SVG on a fixed hour axis, in the site's pace-graph manner. It draws what it is
// given (lines, hatched gaps, gate marks) and owns the crosshair: pointer and arrow keys pick one of the `stops`.
// The svg is drawn in the pixels it is shown in (CSS sets its height, a ResizeObserver reports its box), so a series is
// cut to one slice per pixel column (`downsample`) and a stroke is the weight it says on any screen.
//
// The crosshair is a small store, not state of this component — and its hairline is not even that: the pointer sets
// it straight on its DOM node, in its own overlay svg over the plot, so it keeps up with the cursor and repaints
// nothing beneath it. What the store moves is the dots and the readout, the two pieces that subscribe to it, and
// pointer moves are coalesced to one update a frame.
import {
  type KeyboardEvent,
  memo,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { D } from "../../core";
import { compact, downsample, hourTicks, lastAtOrBefore, smooth, type YAxis } from "./series";

// The plot's margins, in px: the left grows with the widest y label, the top with the rows of gate keys above the plot.
const M = { r: 16, b: 26, t: 10 };
const GLYPH = 6.7;
const KEY_GLYPH = 8.6;
const KEY_ROW = 14;
/** The smallest gap between two keys on one row. */
const KEY_GAP = 6;
/** The rows of keys the band takes at most: a plan too dense to label in these is thinned, not stacked. */
const KEY_ROWS = 3;
/** Before the first measure (and where nothing measures: a test) the svg is this big. */
const FALLBACK = { w: 960, h: 400 };

export interface GraphLine {
  id: string;
  /** Which of the six slots (by the series' index in the filter column): the dash pattern and the colour, so a series is the same line everywhere. */
  slot: number;
  /**
   * A seed's own line is a hairline; the median (or the only seed) is `strong`; a wallet is `mid`; the run before is a
   * dashed hairline, listed first so it is drawn under the live lines. `mid` and `strong` carry a faint band: the range
   * of each pixel column.
   */
  weight: "hair" | "mid" | "strong" | "before";
  /** `[hours, y]` in the axis' units; `-Infinity` sits on the axis floor. */
  pts: readonly (readonly [number, number])[];
}

/** A gate's marks: a hairline where each seed opened it, a chain-line tick at its planned minute, its key. */
export interface GateMark {
  key: string;
  plannedH: number;
  openings: readonly number[];
  /** Where the key is written (above the plot). */
  labelH: number;
  /** Its minute or price is set by hand: the planned tick wears the by-hand square. */
  hand?: boolean;
}

export interface ReadoutRow {
  label: string;
  /** The series' slot: its colour and dash, drawn as a key before the name. */
  slot: number;
  /** The value now. */
  text: string;
  /** The value in the run before at the same hour, and the signed difference in orders of magnitude. */
  before?: string;
  delta?: string;
}

export interface GraphProps {
  title: string;
  /** One short muted line under the title. */
  caption: string;
  /** What the graph shows, in full: the caption's `title` and the plate's description. */
  note: string;
  endHours: number;
  axis: YAxis;
  /** The axis is log10, so its ticks read as powers of ten. */
  log: boolean;
  lines: readonly GraphLine[];
  /** Hatched shapes in `[hours, y]`. */
  gaps?: readonly (readonly (readonly [number, number])[])[];
  gates?: readonly GateMark[];
  /** A span of hours drawn as a translucent band behind the lines (a selected dry spell). */
  span?: { from: number; to: number };
  /** The hours a crosshair can sit at, ascending. */
  stops: readonly number[];
  /** The trend window in hours: 0 (the default) draws the lines as they are. */
  trend?: number;
  readout: (hours: number) => ReadoutRow[];
  /** A drawn empty state: what is coming. The axes are still drawn. */
  empty?: string;
  /** Test-only: called each time the series layer renders, for a test that counts them. Not set in the page. */
  onSeriesRender?: () => void;
}

const tickText = (v: number, log: boolean): string => (log ? (v === 0 ? "1" : `1e${v}`) : compact(D(v)));

type Pts = readonly (readonly [number, number])[];

/** The crosshair's position: the index into the stops it sits at, or null when it is hidden. */
interface Crosshair {
  get(): number | null;
  set(at: number | null): void;
  subscribe(onChange: () => void): () => void;
}

/** One graph's crosshair position, written by the pointer and the arrow keys, read by what draws it. */
const useCrosshair = (): Crosshair => {
  const at = useRef<number | null>(null);
  const listeners = useRef(new Set<() => void>());
  return useMemo(
    () => ({
      get: () => at.current,
      set: (next: number | null) => {
        if (next === at.current) return;
        at.current = next;
        for (const fn of listeners.current) fn();
      },
      subscribe: (fn: () => void) => {
        listeners.current.add(fn);
        return () => void listeners.current.delete(fn);
      },
    }),
    [],
  );
};

/** Reads the crosshair's position: only the component that calls this re-renders when it moves. */
const useAt = (crosshair: Crosshair): number | null =>
  useSyncExternalStore(crosshair.subscribe, crosshair.get);

/** The hour the crosshair sits at: its stop, clamped to the stops a newer run may have shortened. */
const hourAt = (at: number | null, stops: readonly number[]): number | undefined =>
  at === null || stops.length === 0 ? undefined : stops[Math.min(at, stops.length - 1)];

/** The stop nearest an hour: a binary search over the stops, which are ascending. */
const nearestStop = (stops: readonly number[], hours: number): number => {
  if (stops.length === 0) return 0;
  let lo = 0;
  let hi = stops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((stops[mid] as number) < hours) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return 0;
  const before = stops[lo - 1] as number;
  const found = stops[lo] as number;
  return Math.abs(before - hours) <= Math.abs(found - hours) ? lo - 1 : lo;
};

/** The reading at the crosshair: the one line of the plate's head that follows the pointer. */
function Readout({
  uid,
  crosshair,
  stops,
  readout,
}: {
  uid: string;
  crosshair: Crosshair;
  stops: readonly number[];
  readout: (hours: number) => ReadoutRow[];
}) {
  const h = hourAt(useAt(crosshair), stops);
  return (
    <p className="graph__readout num" id={`${uid}-read`}>
      {h === undefined ? (
        <span className="graph__hint">Hover or focus the graph, then use the arrow keys, for a reading.</span>
      ) : (
        <>
          <span className="graph__at">{h.toFixed(2)} h</span>
          {readout(h).map((r) => (
            <span key={r.label} className={`graph__row series-${r.slot}`}>
              <svg className="graph__rowkey" viewBox="0 0 28 8" aria-hidden="true">
                <line className={`graph__rowline dash-${r.slot}`} x1="0" x2="28" y1="4" y2="4" />
              </svg>
              <span className="graph__rowname">{r.label}</span>
              {r.before === undefined ? (
                ` ${r.text}`
              ) : (
                <>
                  {" "}
                  <span className="graph__rowname">now</span> {r.text}{" "}
                  <span className="graph__rowname">before</span> {r.before}{" "}
                  <span className="graph__delta">{r.delta}</span>
                </>
              )}
            </span>
          ))}
        </>
      )}
    </p>
  );
}

/** The crosshair's dots: one on every strong line at the hour, found by binary search. The hairline itself is not
 * drawn here — it is placed straight on its own node by the pointer, outside React's frames. */
function Cross({
  crosshair,
  stops,
  lines,
  xOf,
  yOf,
}: {
  crosshair: Crosshair;
  stops: readonly number[];
  lines: readonly GraphLine[];
  xOf: (h: number) => number;
  yOf: (v: number) => number;
}) {
  const h = hourAt(useAt(crosshair), stops);
  if (h === undefined) return null;
  return (
    <g className="graph__cross">
      {lines
        .filter((l) => l.weight !== "hair" && l.weight !== "before")
        .map((l) => {
          const i = lastAtOrBefore((j) => l.pts[j]?.[0] ?? 0, l.pts.length, h);
          const p = i < 0 ? undefined : l.pts[i];
          return p ? (
            <circle key={l.id} className={`series-${l.slot}`} cx={xOf(p[0])} cy={yOf(p[1])} r="3.5" />
          ) : null;
        })}
    </g>
  );
}

/** One line's drawn shapes: the path of its highs, the band of each pixel column's range behind it, and, when a trend
 * window is on, the path of the unsmoothed line under the smoothed one. */
interface Shapes {
  line: string;
  band: string;
  raw: string;
}

/**
 * The plot's data layer: hatched gaps, the bands and the series paths, cut to the pixels they are drawn in. The d
 * strings are built once per data, size, scale or trend-window change, and the crosshair is not a prop, so a move renders
 * none of this; memoised, an unrelated change above (a pin typed, a note set) leaves it alone too.
 */
const Series = memo(function Series({
  uid,
  lines,
  gaps,
  endHours,
  plotW,
  trend,
  xOf,
  yOf,
  onRender,
}: {
  uid: string;
  lines: readonly GraphLine[];
  gaps?: readonly (readonly (readonly [number, number])[])[];
  endHours: number;
  plotW: number;
  /** The trend window in hours: above zero each strong line is drawn smoothed over its own raw line. */
  trend: number;
  xOf: (h: number) => number;
  yOf: (v: number) => number;
  onRender?: () => void;
}) {
  const drawn = useMemo(() => {
    const d = (pts: Pts) =>
      pts.map(([h, v], i) => `${i === 0 ? "M" : "L"}${xOf(h).toFixed(1)} ${yOf(v).toFixed(1)}`).join("");
    const gapDs = gaps?.map((poly) => `${d(poly)}Z`);
    const shapes: Shapes[] = lines.map((l) => {
      // A trend window smooths every line but a seed's own hairline (the run before is smoothed too, on the plotted y:
      // log10 on the log scale, the raw value on linear). The smoothing runs here, inside the memo, keyed on the
      // data, the size, the scale and the window — never on hover.
      const source = trend > 0 && l.weight !== "hair" ? smooth(l.pts, trend) : l.pts;
      const bands = downsample(source, 0, endHours, Math.round(plotW));
      const line = bands.map(
        (b, i) => `${i === 0 ? "M" : "L"}${xOf(b.x).toFixed(1)} ${yOf(b.max).toFixed(1)}`,
      );
      let band = "";
      if (
        trend <= 0 &&
        l.weight !== "hair" &&
        l.weight !== "before" &&
        bands.some((b) => yOf(b.min) - yOf(b.max) >= 0.5)
      ) {
        const hi = bands.map((b) => `${xOf(b.x).toFixed(1)} ${yOf(b.max).toFixed(1)}`);
        const lo = bands.map((b) => `${xOf(b.x).toFixed(1)} ${yOf(b.min).toFixed(1)}`).reverse();
        band = `M${[...hi, ...lo].join("L")}Z`;
      }
      // The raw line a strong line drops to under a trend: the noise the smoothed one leaves out, faint underneath.
      const raw =
        trend > 0 && l.weight !== "hair" && l.weight !== "before"
          ? downsample(l.pts, 0, endHours, Math.round(plotW))
              .map((b, i) => `${i === 0 ? "M" : "L"}${xOf(b.x).toFixed(1)} ${yOf(b.max).toFixed(1)}`)
              .join("")
          : "";
      return { line: line.join(""), band, raw };
    });
    return { gapDs, shapes };
  }, [lines, gaps, endHours, plotW, trend, xOf, yOf]);
  onRender?.();
  return (
    <>
      {drawn.gapDs?.map((d, i) => (
        <path key={i} className="graph__gap" fill={`url(#${uid}-hatch)`} d={d} />
      ))}
      {lines.map((l, i) =>
        drawn.shapes[i]?.band ? (
          <path key={`${l.id}:band`} className={`graph__band series-${l.slot}`} d={drawn.shapes[i]?.band} />
        ) : null,
      )}
      {lines.map((l, i) =>
        drawn.shapes[i]?.raw ? (
          <path
            key={`${l.id}:raw`}
            className={`graph__line graph__line--raw series-${l.slot} dash-${l.slot}`}
            d={drawn.shapes[i]?.raw}
          />
        ) : null,
      )}
      {lines.map((l, i) => (
        <path
          key={l.id}
          className={
            l.weight === "before"
              ? `graph__line graph__line--before series-${l.slot}`
              : l.weight === "hair"
                ? `graph__line graph__line--hair series-${l.slot}`
                : trend > 0
                  ? `graph__line graph__line--trend series-${l.slot} dash-${l.slot}`
                  : `graph__line graph__line--${l.weight} series-${l.slot} dash-${l.slot}`
          }
          d={drawn.shapes[i]?.line}
        />
      ))}
    </>
  );
});

/** A gate's key placed in a row above the plot, never over data. */
interface PlacedKey {
  gate: GateMark;
  row: number;
  x: number;
  anchor: "start" | "end";
}

/** The gate marks, each list already cut to one per pixel column. */
interface Marks {
  opened: readonly number[];
  planned: readonly number[];
  hand: readonly number[];
}

/** The gate marks: a hairline where a seed opened a gate, its planned tick, its by-hand square, and the keys the band
 * had room for — each mark once per pixel column, so a pitched plan stays a texture rather than a smear. */
const GateMarks = memo(function GateMarks({
  placed,
  marks,
  top,
  bottom,
}: {
  placed: readonly PlacedKey[];
  marks: Marks;
  top: number;
  bottom: number;
}) {
  return (
    <>
      {marks.opened.map((x) => (
        <line key={`o${x}`} className="graph__opened" x1={x} x2={x} y1={top} y2={bottom} />
      ))}
      {marks.planned.map((x) => (
        <line key={`p${x}`} className="graph__planned" x1={x} x2={x} y1={bottom - 18} y2={bottom} />
      ))}
      {marks.hand.map((x) => (
        <rect key={`h${x}`} className="graph__hand" x={x - 3.5} y={bottom - 26} width="7" height="7" />
      ))}
      {placed.map(({ gate, row, x, anchor }) => (
        <text
          className="graph__gatename lettering"
          key={gate.key}
          x={x}
          y={top - 5 - row * KEY_ROW}
          textAnchor={anchor}
        >
          {gate.key}
        </text>
      ))}
    </>
  );
});

export function Graph(props: GraphProps) {
  const {
    title,
    caption,
    note,
    endHours,
    axis,
    log,
    lines,
    gaps,
    gates,
    span: band,
    stops,
    trend = 0,
    readout,
    empty,
    onSeriesRender,
  } = props;
  const uid = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const hair = useRef<SVGLineElement>(null);
  const crosshair = useCrosshair();
  const [size, setSize] = useState(FALLBACK);

  useEffect(() => {
    const el = svg.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box && box.width > 0 && box.height > 0)
        setSize({ w: Math.round(box.width), h: Math.round(box.height) });
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const { w: width, h: height } = size;
  const ticks = useMemo(() => axis.ticks.map((t) => ({ t, text: tickText(t, log) })), [axis, log]);
  const left = Math.max(34, Math.ceil(Math.max(...ticks.map((t) => t.text.length)) * GLYPH) + 14);
  const plotW = Math.max(40, width - left - M.r);
  const xOf = useCallback(
    (h: number) => left + (Math.min(Math.max(h, 0), endHours) / endHours) * plotW,
    [left, endHours, plotW],
  );

  // The gate keys sit in rows above the plot, never over data. A game's plan can hold thousands of gates, so a key is
  // drawn only where it can be read: one per pixel column, and one that finds no room in the band's rows is left to the
  // gates table instead of being stacked over its neighbour.
  const placed = useMemo(() => {
    const out: PlacedKey[] = [];
    const ends: number[] = [];
    const columns = new Set<number>();
    for (const gate of [...(gates ?? [])].sort((a, b) => a.labelH - b.labelH)) {
      const x = left + (Math.min(Math.max(gate.labelH, 0), endHours) / endHours) * plotW;
      const column = Math.round(x);
      if (columns.has(column)) continue;
      const span = gate.key.length * KEY_GLYPH + 4;
      const anchor = x + span > left + plotW ? "end" : "start";
      const from = anchor === "end" ? x - span - 4 : x;
      const found = ends.findIndex((e) => e + KEY_GAP <= from);
      if (found < 0 && ends.length >= KEY_ROWS) continue;
      const row = found < 0 ? ends.length : found;
      ends[row] = anchor === "end" ? x : x + span;
      columns.add(column);
      out.push({ gate, row, x: x + (anchor === "end" ? -4 : 4), anchor });
    }
    return { placed: out, rows: ends.length };
  }, [gates, left, plotW, endHours]);

  // The ticks and hairlines, one per pixel column each: thousands of planned minutes and openings would otherwise paint
  // the plot solid and put thousands of nodes in the svg. They are drawn for every gate, labelled or not.
  const marks = useMemo(() => {
    const onePerColumn = (hours: readonly number[]): number[] => {
      const seen = new Set<number>();
      const out: number[] = [];
      for (const h of hours) {
        const x = xOf(h);
        const column = Math.round(x);
        if (seen.has(column)) continue;
        seen.add(column);
        out.push(x);
      }
      return out;
    };
    const all = gates ?? [];
    return {
      opened: onePerColumn(all.flatMap((g) => g.openings)),
      planned: onePerColumn(all.map((g) => g.plannedH)),
      hand: onePerColumn(all.filter((g) => g.hand).map((g) => g.plannedH)),
    };
  }, [gates, xOf]);
  const top = M.t + (placed.rows > 0 ? placed.rows * KEY_ROW : 0);
  const plotH = Math.max(40, height - top - M.b);
  const bottom = top + plotH;
  const span = axis.hi - axis.lo || 1;
  const yOf = useCallback(
    (v: number) => bottom - ((Math.min(Math.max(v, axis.lo), axis.hi) - axis.lo) / span) * plotH,
    [bottom, axis.lo, axis.hi, span, plotH],
  );

  /** Puts the crosshair's hairline at an x in the plot's units, or hides it — straight on its node, so it follows the
   * pointer with no frame of React or the browser's paint between them. */
  const placeHair = useCallback((x: number | null) => {
    const el = hair.current;
    if (!el) return;
    if (x === null) el.style.visibility = "hidden";
    else {
      el.style.visibility = "visible";
      el.style.transform = `translateX(${x.toFixed(1)}px)`;
    }
  }, []);

  // A move only finds the hour; one animation frame applies it, so a burst of pointer events costs one update. The
  // hairline itself is placed above, synchronously at the pointer's exact x — the dots and the readout still snap.
  const frame = useRef<number | undefined>(undefined);
  const pending = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    },
    [],
  );
  // A new geometry (a resize, a new axis) re-seats the hairline where the hour it sits at now is.
  useEffect(() => {
    const at = crosshair.get();
    if (at === null || stops.length === 0) return;
    placeHair(xOf(stops[Math.min(at, stops.length - 1)] ?? 0));
  }, [crosshair, stops, xOf, placeHair]);
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const el = svg.current;
    if (!el || stops.length === 0) return;
    const box = el.getBoundingClientRect();
    if (box.width === 0) return;
    const px = ((e.clientX - box.left) / box.width) * width;
    // The line sits at the pointer's exact x, clamped to the plot — not snapped to the stop the dots will take.
    placeHair(Math.min(Math.max(px, left), left + plotW));
    pending.current = nearestStop(stops, ((px - left) / plotW) * endHours);
    if (frame.current === undefined)
      frame.current = requestAnimationFrame(() => {
        frame.current = undefined;
        crosshair.set(pending.current);
      });
  };
  const onLeave = () => {
    if (frame.current !== undefined) {
      cancelAnimationFrame(frame.current);
      frame.current = undefined;
    }
    placeHair(null);
    crosshair.set(null);
  };
  const last = stops.length - 1;
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (stops.length === 0) return;
    const now = crosshair.get();
    let next: number | null | undefined;
    if (e.key === "ArrowRight") next = now === null ? 0 : Math.min(now + 1, last);
    else if (e.key === "ArrowLeft") next = now === null ? last : Math.max(now - 1, 0);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else if (e.key === "Escape") next = null;
    if (next === undefined) return;
    e.preventDefault();
    // The keyboard sets the line the same way the pointer does: straight to the stop's x, no frame in between.
    placeHair(next === null ? null : xOf(stops[next] ?? 0));
    crosshair.set(next);
  };

  const xticks = hourTicks(endHours);
  const emptyW = Math.min(460, plotW - 24);

  return (
    <section className="plate graph" aria-label={title} aria-describedby={`${uid}-note`}>
      <div className="plate__head">
        <div className="graph__titlerow">
          <h2 className="lettering plate__title">{title}</h2>
          <p className="graph__caption" title={note}>
            {caption}
          </p>
        </div>
        <span id={`${uid}-note`} className="sr">
          {note}
        </span>
        <Readout uid={uid} crosshair={crosshair} stops={stops} readout={readout} />
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: a plot, not a form group */}
      <div
        className="graph__frame"
        role="group"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the plot is a keyboard widget: arrow keys move its crosshair
        tabIndex={0}
        aria-label={`${title}: arrow keys move the crosshair`}
        aria-describedby={`${uid}-read`}
        onKeyDown={onKey}
        onBlur={() => {
          placeHair(null);
          crosshair.set(null);
        }}
      >
        <svg
          ref={svg}
          className="graph__svg"
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          onPointerMove={onMove}
          onPointerLeave={onLeave}
        >
          <defs>
            <pattern
              id={`${uid}-hatch`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-45)"
            >
              <line x1="0" y1="0" x2="0" y2="6" className="graph__hatchline" />
            </pattern>
            <clipPath id={`${uid}-clip`}>
              <rect x={left} y={top} width={plotW} height={plotH} />
            </clipPath>
          </defs>
          {ticks.map(({ t, text }) => (
            <g key={t}>
              <line className="graph__grid" x1={left} x2={left + plotW} y1={yOf(t)} y2={yOf(t)} />
              <text className="graph__tick" x={left - 8} y={yOf(t) + 4} textAnchor="end">
                {text}
              </text>
            </g>
          ))}
          {xticks.map((h) => (
            <g key={h}>
              <line className="graph__grid" x1={xOf(h)} x2={xOf(h)} y1={top} y2={bottom} />
              <text className="graph__tick" x={xOf(h)} y={bottom + 17} textAnchor="middle">
                {h}h
              </text>
            </g>
          ))}
          <line className="graph__axis" x1={left} x2={left + plotW} y1={bottom} y2={bottom} />

          <g clipPath={`url(#${uid}-clip)`}>
            {band && (
              <rect
                className="graph__span"
                x={xOf(band.from)}
                y={top}
                width={Math.max(1, xOf(band.to) - xOf(band.from))}
                height={plotH}
              />
            )}
            <Series
              uid={uid}
              lines={lines}
              gaps={gaps}
              endHours={endHours}
              plotW={plotW}
              trend={trend}
              xOf={xOf}
              yOf={yOf}
              onRender={onSeriesRender}
            />
          </g>

          <GateMarks placed={placed.placed} marks={marks} top={top} bottom={bottom} />

          {empty && (
            <g className="graph__empty">
              <rect
                className="graph__emptyfield"
                x={left}
                y={top}
                width={plotW}
                height={plotH}
                fill={`url(#${uid}-hatch)`}
              />
              <rect
                className="graph__emptyplate"
                x={left + plotW / 2 - emptyW / 2}
                y={top + plotH / 2 - 20}
                width={emptyW}
                height="40"
              />
              <text
                className="graph__emptytext lettering"
                x={left + plotW / 2}
                y={top + plotH / 2 + 4}
                textAnchor="middle"
              >
                {empty}
              </text>
            </g>
          )}
        </svg>
        {/* The crosshair's own sheet: an svg over the plot, the same box and view, painting nothing but the hairline
            and its dots — a move repaints none of the series beneath it. */}
        <svg className="graph__overlay" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          <line ref={hair} className="graph__hairline" x1={0} x2={0} y1={top} y2={bottom} />
          <Cross crosshair={crosshair} stops={stops} lines={lines} xOf={xOf} yOf={yOf} />
        </svg>
      </div>
    </section>
  );
}
