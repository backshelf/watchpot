// One graph of the desk: hand-rolled SVG on a fixed hour axis, in the site's pace-graph manner. It draws what it is
// given (lines, hatched gaps, gate marks) and owns the crosshair: pointer and arrow keys pick one of the `stops`.
// The svg is drawn in the pixels it is shown in (CSS sets its height, a ResizeObserver reports its box), so a series is
// cut to one slice per pixel column (`downsample`) and a stroke is the weight it says on any screen.
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { D } from "../../core";
import { compact, downsample, hourTicks, type YAxis } from "./series";

// The plot's margins, in px: the left grows with the widest y label, the top with the rows of gate keys above the plot.
const M = { r: 16, b: 26, t: 10 };
const GLYPH = 6.7;
const KEY_GLYPH = 8.6;
const KEY_ROW = 14;
/** Before the first measure (and where nothing measures: a test) the svg is this big. */
const FALLBACK = { w: 960, h: 400 };

export interface GraphLine {
  id: string;
  /** Which of the dash patterns, so a series is the same line everywhere. */
  dash: number;
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
  /** The hours a crosshair can sit at, ascending. */
  stops: readonly number[];
  readout: (hours: number) => ReadoutRow[];
  /** A drawn empty state: what is coming. The axes are still drawn. */
  empty?: string;
}

const tickText = (v: number, log: boolean): string => (log ? (v === 0 ? "1" : `1e${v}`) : compact(D(v)));

type Pts = readonly (readonly [number, number])[];

export function Graph(props: GraphProps) {
  const { title, caption, note, endHours, axis, log, lines, gaps, gates, stops, readout, empty } = props;
  const uid = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [size, setSize] = useState(FALLBACK);
  const last = stops.length - 1;
  const at = cursor === null ? undefined : Math.min(cursor, last);
  const cursorH = at === undefined ? undefined : stops[at];

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

  // The gate keys sit in rows above the plot, never over data: a key that would overlap the one before drops a row.
  const keys = useMemo(() => {
    const placed: { gate: GateMark; row: number; x: number; anchor: "start" | "end" }[] = [];
    const ends: number[] = [];
    for (const gate of [...(gates ?? [])].sort((a, b) => a.labelH - b.labelH)) {
      const x = left + (Math.min(Math.max(gate.labelH, 0), endHours) / endHours) * plotW;
      const span = gate.key.length * KEY_GLYPH + 4;
      const anchor = x + span > left + plotW ? "end" : "start";
      const from = anchor === "end" ? x - span - 4 : x;
      let row = ends.findIndex((e) => e + 6 <= from);
      if (row < 0) row = Math.min(ends.length, 2);
      ends[row] = anchor === "end" ? x : x + span;
      placed.push({ gate, row, x: x + (anchor === "end" ? -4 : 4), anchor });
    }
    return { placed, rows: ends.length };
  }, [gates, left, plotW, endHours]);
  const top = M.t + (keys.rows > 0 ? keys.rows * KEY_ROW : 0);
  const plotH = Math.max(40, height - top - M.b);
  const bottom = top + plotH;
  const span = axis.hi - axis.lo || 1;
  const yOf = useCallback(
    (v: number) => bottom - ((Math.min(Math.max(v, axis.lo), axis.hi) - axis.lo) / span) * plotH,
    [bottom, axis.lo, axis.hi, span, plotH],
  );

  const d = (pts: Pts) =>
    pts.map(([h, v], i) => `${i === 0 ? "M" : "L"}${xOf(h).toFixed(1)} ${yOf(v).toFixed(1)}`).join("");
  const drawn = useMemo(
    () =>
      lines.map((l) => {
        const bands = downsample(l.pts, 0, endHours, Math.round(plotW));
        const line = bands.map(
          (b, i) => `${i === 0 ? "M" : "L"}${xOf(b.x).toFixed(1)} ${yOf(b.max).toFixed(1)}`,
        );
        let band = "";
        if (
          l.weight !== "hair" &&
          l.weight !== "before" &&
          bands.some((b) => yOf(b.min) - yOf(b.max) >= 0.5)
        ) {
          const hi = bands.map((b) => `${xOf(b.x).toFixed(1)} ${yOf(b.max).toFixed(1)}`);
          const lo = bands.map((b) => `${xOf(b.x).toFixed(1)} ${yOf(b.min).toFixed(1)}`).reverse();
          band = `M${[...hi, ...lo].join("L")}Z`;
        }
        return { line: line.join(""), band };
      }),
    [lines, endHours, plotW, xOf, yOf],
  );

  const nearest = (hours: number): number => {
    let best = 0;
    stops.forEach((s, i) => {
      if (Math.abs(s - hours) < Math.abs((stops[best] ?? 0) - hours)) best = i;
    });
    return best;
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const el = svg.current;
    if (!el || stops.length === 0) return;
    const box = el.getBoundingClientRect();
    if (box.width === 0) return;
    const px = ((e.clientX - box.left) / box.width) * width;
    setCursor(nearest(((px - left) / plotW) * endHours));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (stops.length === 0) return;
    const now = at;
    let next: number | null | undefined;
    if (e.key === "ArrowRight") next = now === undefined ? 0 : Math.min(now + 1, last);
    else if (e.key === "ArrowLeft") next = now === undefined ? last : Math.max(now - 1, 0);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else if (e.key === "Escape") next = null;
    if (next === undefined) return;
    e.preventDefault();
    setCursor(next);
  };

  const rows = cursorH === undefined ? [] : readout(cursorH);
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
        <p className="graph__readout num" id={`${uid}-read`}>
          {cursorH === undefined ? (
            <span className="graph__hint">
              Hover or focus the graph, then use the arrow keys, for a reading.
            </span>
          ) : (
            <>
              <span className="graph__at">{cursorH.toFixed(2)} h</span>
              {rows.map((r) => (
                <span key={r.label} className="graph__row">
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
        onBlur={() => setCursor(null)}
      >
        <svg
          ref={svg}
          className="graph__svg"
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          onPointerMove={onMove}
          onPointerLeave={() => setCursor(null)}
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
            {gaps?.map((poly, i) => (
              <path key={i} className="graph__gap" fill={`url(#${uid}-hatch)`} d={`${d(poly)}Z`} />
            ))}
            {lines.map((l, i) =>
              drawn[i]?.band ? (
                <path key={`${l.id}:band`} className="graph__band" d={drawn[i]?.band} />
              ) : null,
            )}
            {lines.map((l, i) => (
              <path
                key={l.id}
                className={
                  l.weight === "before"
                    ? "graph__line graph__line--before"
                    : `graph__line graph__line--${l.weight} dash-${l.dash}`
                }
                d={drawn[i]?.line}
              />
            ))}
          </g>

          {keys.placed.map(({ gate: g, row, x, anchor }, i) => (
            <g key={g.key} className="graph__gate">
              {g.openings.map((h) => (
                <line
                  key={`${h}-${i}`}
                  className="graph__opened"
                  x1={xOf(h)}
                  x2={xOf(h)}
                  y1={top}
                  y2={bottom}
                />
              ))}
              <line
                className="graph__planned"
                x1={xOf(g.plannedH)}
                x2={xOf(g.plannedH)}
                y1={bottom - 18}
                y2={bottom}
              />
              {g.hand && (
                <rect
                  className="graph__hand"
                  x={xOf(g.plannedH) - 3.5}
                  y={bottom - 26}
                  width="7"
                  height="7"
                />
              )}
              <text
                className="graph__gatename lettering"
                x={x}
                y={top - 5 - row * KEY_ROW}
                textAnchor={anchor}
              >
                {g.key}
              </text>
            </g>
          ))}

          {cursorH !== undefined && (
            <g className="graph__cross">
              <line x1={xOf(cursorH)} x2={xOf(cursorH)} y1={top} y2={bottom} />
              {lines
                .filter((l) => l.weight !== "hair" && l.weight !== "before")
                .map((l) => {
                  let p: readonly [number, number] | undefined;
                  for (let k = l.pts.length - 1; k >= 0; k--) {
                    const q = l.pts[k] as readonly [number, number];
                    if (q[0] <= cursorH + 1e-9) {
                      p = q;
                      break;
                    }
                  }
                  return p ? <circle key={l.id} cx={xOf(p[0])} cy={yOf(p[1])} r="3.5" /> : null;
                })}
            </g>
          )}

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
      </div>
    </section>
  );
}
