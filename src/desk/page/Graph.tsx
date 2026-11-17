// One graph of the desk: hand-rolled SVG on a fixed hour axis, in the site's pace-graph manner. It draws what it is
// given (lines, hatched gaps, gate marks) and owns the crosshair: pointer and arrow keys pick one of the `stops`.
import { type KeyboardEvent, type PointerEvent, useId, useRef, useState } from "react";
import { D } from "../../core";
import { hourTicks, short, type YAxis } from "./series";

// The graph's box, in its own units.
const W = 960;
const M = { l: 64, r: 22, t: 22, b: 36 };

export interface GraphLine {
  id: string;
  /** Which of the dash patterns, so a series is the same line everywhere. */
  dash: number;
  /** A seed's own line is a hairline; the median (or the only seed) is `strong`; a wallet is `mid`. */
  weight: "hair" | "mid" | "strong";
  /** `[hours, y]` in the axis' units; `-Infinity` sits on the axis floor. */
  pts: readonly (readonly [number, number])[];
  /** The name written at the line's end. */
  label?: string;
}

/** A gate's marks: a hairline where each seed opened it, a chain-line tick at its planned minute, its key. */
export interface GateMark {
  key: string;
  plannedH: number;
  openings: readonly number[];
  /** Where the key is written. */
  labelH: number;
}

export interface ReadoutRow {
  label: string;
  text: string;
}

export interface GraphProps {
  title: string;
  caption: string;
  height: number;
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

const tickText = (v: number, log: boolean): string => (log ? (v === 0 ? "1" : `1e${v}`) : short(D(v)));

export function Graph(props: GraphProps) {
  const { title, caption, height, endHours, axis, log, lines, gaps, gates, stops, readout, empty } = props;
  const uid = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const last = stops.length - 1;
  const at = cursor === null ? undefined : Math.min(cursor, last);
  const cursorH = at === undefined ? undefined : stops[at];

  const x = (h: number) => M.l + (Math.min(Math.max(h, 0), endHours) / endHours) * (W - M.l - M.r);
  const span = axis.hi - axis.lo || 1;
  const y = (v: number) =>
    height - M.b - ((Math.min(Math.max(v, axis.lo), axis.hi) - axis.lo) / span) * (height - M.t - M.b);
  const d = (pts: readonly (readonly [number, number])[]) =>
    pts.map(([h, v], i) => `${i === 0 ? "M" : "L"}${x(h).toFixed(1)} ${y(v).toFixed(1)}`).join("");

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
    const vx = ((e.clientX - box.left) / box.width) * W;
    setCursor(nearest(((vx - M.l) / (W - M.l - M.r)) * endHours));
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
  const labelAnchor = (h: number) => (h > endHours * 0.8 ? "end" : "start");

  return (
    <section className="plate graph" aria-label={title}>
      <div className="plate__head">
        <h2 className="lettering">{title}</h2>
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
                  <span className="graph__rowname">{r.label}</span> {r.text}
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
          viewBox={`0 0 ${W} ${height}`}
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
              <rect x={M.l} y={M.t} width={W - M.l - M.r} height={height - M.t - M.b} />
            </clipPath>
          </defs>
          {axis.ticks.map((t) => (
            <g key={t}>
              <line className="graph__grid" x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} />
              <text className="graph__tick" x={M.l - 10} y={y(t) + 4} textAnchor="end">
                {tickText(t, log)}
              </text>
            </g>
          ))}
          {xticks.map((h) => (
            <g key={h}>
              <line className="graph__grid" x1={x(h)} x2={x(h)} y1={M.t} y2={height - M.b} />
              <text className="graph__tick" x={x(h)} y={height - M.b + 20} textAnchor="middle">
                {h} h
              </text>
            </g>
          ))}
          <rect
            className="graph__frame-line"
            x={M.l}
            y={M.t}
            width={W - M.l - M.r}
            height={height - M.t - M.b}
          />

          <g clipPath={`url(#${uid}-clip)`}>
            {gaps?.map((poly, i) => (
              <path key={i} className="graph__gap" fill={`url(#${uid}-hatch)`} d={`${d(poly)}Z`} />
            ))}
            {lines.map((l) => (
              <path
                key={l.id}
                className={`graph__line graph__line--${l.weight} dash-${l.dash}`}
                d={d(l.pts)}
              />
            ))}
          </g>

          {gates?.map((g, i) => (
            <g key={g.key} className="graph__gate">
              {g.openings.map((h) => (
                <line
                  key={`${h}-${i}`}
                  className="graph__opened"
                  x1={x(h)}
                  x2={x(h)}
                  y1={M.t}
                  y2={height - M.b}
                />
              ))}
              <line
                className="graph__planned"
                x1={x(g.plannedH)}
                x2={x(g.plannedH)}
                y1={height - M.b - 18}
                y2={height - M.b}
              />
              <text
                className="graph__gatename lettering"
                x={x(g.labelH) + (labelAnchor(g.labelH) === "end" ? -4 : 4)}
                y={M.t + 11 + (i % 3) * 12}
                textAnchor={labelAnchor(g.labelH)}
              >
                {g.key}
              </text>
            </g>
          ))}

          {lines
            .filter((l) => l.label && l.pts.length > 0)
            .map((l) => {
              const end = l.pts[l.pts.length - 1] as readonly [number, number];
              return (
                <text
                  key={l.id}
                  className="graph__linename lettering"
                  x={x(end[0]) + (labelAnchor(end[0]) === "end" ? -4 : 4)}
                  y={y(end[1]) - 6}
                  textAnchor={labelAnchor(end[0])}
                >
                  {l.label}
                </text>
              );
            })}

          {cursorH !== undefined && (
            <g className="graph__cross">
              <line x1={x(cursorH)} x2={x(cursorH)} y1={M.t} y2={height - M.b} />
              {lines
                .filter((l) => l.weight !== "hair")
                .map((l) => {
                  const p = [...l.pts].reverse().find((q) => q[0] <= cursorH + 1e-9);
                  return p ? <circle key={l.id} cx={x(p[0])} cy={y(p[1])} r="3.5" /> : null;
                })}
            </g>
          )}

          {empty && (
            <g className="graph__empty">
              <rect
                className="graph__emptyfield"
                x={M.l}
                y={M.t}
                width={W - M.l - M.r}
                height={height - M.t - M.b}
                fill={`url(#${uid}-hatch)`}
              />
              <rect
                className="graph__emptyplate"
                x={W / 2 - 230}
                y={(M.t + height - M.b) / 2 - 22}
                width="460"
                height="44"
              />
              <text
                className="graph__emptytext lettering"
                x={W / 2}
                y={(M.t + height - M.b) / 2 + 4}
                textAnchor="middle"
              >
                {empty}
              </text>
            </g>
          )}
        </svg>
      </div>
      <p className="graph__caption">{caption}</p>
    </section>
  );
}
