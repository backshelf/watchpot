// The sim lab, run in the page: the same game definition played headless for three days by the auto-player on a
// seeded schedule, plotted on a log axis against a pacing contract. Every line on the chart is a real run, made here.
import { useEffect, useRef, useState } from "react";
import { BANDS, DAYS, type LabRun, MARKS, runLab } from "../game/lab";

const SEEDS = 5;
// Three days from an 08:00 start end at the third night: 63 hours. The axis stops just past it.
const HOURS = 64;
const TOP = 21;

/** How much a unit of pressure is worth: the number the visitor turns. 0.25 is the game as the page runs it. */
const WORTH = [
  { value: 0.05, label: "×0.05" },
  { value: 0.25, label: "×0.25, as shipped" },
  { value: 1, label: "×1" },
] as const;

// The chart's box, in its own units.
const W = 960;
const H = 440;
const M = { l: 56, r: 20, t: 18, b: 40 };
const x = (hours: number) => M.l + (hours / HOURS) * (W - M.l - M.r);
const y = (orders: number) => H - M.b - (Math.min(orders, TOP) / TOP) * (H - M.t - M.b);

const path = (run: LabRun) =>
  run.rows.map((r, i) => `${i === 0 ? "M" : "L"}${x(r.hours).toFixed(1)} ${y(r.boiled).toFixed(1)}`).join("");

/** A run's reading at an hour: the latest row at or before it. */
function at(run: LabRun, hours: number): number | null {
  let value: number | null = null;
  for (const row of run.rows) {
    if (row.hours > hours + 1e-6) break;
    value = row.boiled;
  }
  return value;
}

export function SimLab() {
  const [runs, setRuns] = useState<LabRun[]>([]);
  const [worth, setWorth] = useState(0.25);
  const [busy, setBusy] = useState(false);
  const batch = useRef(0);
  const section = useRef<HTMLElement>(null);
  const started = useRef(false);

  // One run a timeslice, so the lines are plotted as they are played and the page stays live between them.
  const play = (pressure: number) => {
    const mine = ++batch.current;
    setRuns([]);
    setBusy(true);
    let i = 0;
    const next = () => {
      if (batch.current !== mine) return;
      const run = runLab(`seed-${mine}-${i}`, { pressure });
      setRuns((before) => (batch.current === mine ? [...before, run] : before));
      i += 1;
      if (i < SEEDS) setTimeout(next, 30);
      else setBusy(false);
    };
    setTimeout(next, 30);
  };
  const playRef = useRef(play);
  playRef.current = play;

  // The first batch runs when the sheet comes into view, not before.
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (started.current || !entries.some((e) => e.isIntersecting)) return;
        started.current = true;
        playRef.current(0.25);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ms = runs.reduce((a, r) => a + r.ms, 0);
  const looks = runs.reduce((a, r) => a + r.looks, 0);
  const rows = MARKS.map((hours, k) => {
    const values = runs.map((r) => at(r, hours)).filter((v): v is number => v !== null);
    const band = BANDS[k] ?? [0, 0];
    const inside = values.filter((v) => v >= band[0] && v <= band[1]).length;
    return { hours, band, values, inside, ok: values.length > 0 && inside * 2 > values.length };
  });

  return (
    <section className="sheet section" id="sim" aria-labelledby="sim-title" ref={section}>
      <header className="section__head">
        <h2 id="sim-title">Played for days before anyone plays it.</h2>
        <p className="section__lede">
          The sim lab plays the same game definition with nobody there: a store on a clock the sim owns, a
          player who looks in a few times a day, three days of it. Then it judges the timeline against a
          pacing contract written as data. Change a number and the three days are played again.
        </p>
      </header>

      <div className="plate simlab">
        <div className="plate__head">
          <h3>Steam boiled, three days, {SEEDS} seeds</h3>
          <p className="simlab__time num" role="status">
            {runs.length === 0
              ? "not run yet"
              : `${runs.length} of ${SEEDS} runs · ${runs.length * DAYS} days played in ${Math.round(ms)} ms here · ${looks.toLocaleString("en")} looks`}
          </p>
        </div>
        <div className="plate__body">
          <svg
            className="simlab__chart"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Steam boiled over ${HOURS} hours on a log axis, ${runs.length} runs, with the contract's band at each marked hour.`}
          >
            <defs>
              <pattern
                id="simlab-hatch"
                width="5"
                height="5"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(-45)"
              >
                <line x1="0" y1="0" x2="0" y2="5" className="simlab__hatchline" />
              </pattern>
            </defs>
            {[0, 3, 6, 9, 12, 15, 18, 21].map((o) => (
              <g key={o}>
                <line className="simlab__grid" x1={M.l} x2={W - M.r} y1={y(o)} y2={y(o)} />
                <text className="simlab__tick" x={M.l - 10} y={y(o) + 4} textAnchor="end">
                  {o === 0 ? "1" : `1e${o}`}
                </text>
              </g>
            ))}
            {[0, 12, 24, 36, 48, 60].map((h) => (
              <g key={h}>
                <line
                  className={h % 24 === 0 ? "simlab__grid simlab__grid--day" : "simlab__grid"}
                  x1={x(h)}
                  x2={x(h)}
                  y1={M.t}
                  y2={H - M.b}
                />
                <text className="simlab__tick" x={x(h)} y={H - M.b + 20} textAnchor="middle">
                  {h} h
                </text>
              </g>
            ))}
            {rows.map((row) => (
              <g key={row.hours} data-ok={row.values.length === 0 ? undefined : row.ok ? "yes" : "no"}>
                <rect
                  className="simlab__band"
                  x={x(row.hours) - 9}
                  width="18"
                  y={y(row.band[1])}
                  height={y(row.band[0]) - y(row.band[1])}
                />
                <path
                  className="simlab__bandends"
                  d={`M${x(row.hours) - 14} ${y(row.band[1])}h28M${x(row.hours) - 14} ${y(row.band[0])}h28`}
                />
              </g>
            ))}
            {runs.map((run, i) => (
              <path
                key={run.seed}
                className="simlab__run"
                data-latest={busy && i === runs.length - 1 ? "" : undefined}
                d={path(run)}
              />
            ))}
          </svg>
          <p className="caption">
            Each line is one seed: three days from an 08:00 start, hours along the bottom, steam ever boiled
            up the side in powers of ten. A flat stretch is the tab closed; the step after it is the catch-up.
            A hatched box is a band of the contract; a dashed, empty one is a band most of these seeds miss.
          </p>

          <div className="simlab__under">
            <table className="simlab__table">
              <caption className="visually-hidden">The contract, band by band</caption>
              <thead>
                <tr>
                  <th scope="col">By hour</th>
                  <th scope="col">Band</th>
                  <th scope="col">These seeds</th>
                  <th scope="col">In band</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const lo = Math.min(...row.values);
                  const hi = Math.max(...row.values);
                  return (
                    <tr key={row.hours} data-ok={row.values.length === 0 ? undefined : row.ok ? "yes" : "no"}>
                      <th scope="row" className="num">
                        {row.hours}
                      </th>
                      <td className="num">
                        1e{row.band[0]} to 1e{row.band[1]}
                      </td>
                      <td className="num">
                        {row.values.length === 0 ? "…" : `1e${lo.toFixed(1)} to 1e${hi.toFixed(1)}`}
                      </td>
                      <td className="simlab__verdict">
                        {row.values.length === 0
                          ? "…"
                          : `${row.inside} of ${row.values.length}: ${row.ok ? "holds" : "misses"}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="simlab__turn">
              <div className="field">
                <span id="worth-label">What a unit of pressure is worth</span>
                <div className="seg">
                  {WORTH.map((w) => (
                    <button
                      key={w.value}
                      type="button"
                      aria-label={`Pressure worth ${w.label}`}
                      aria-pressed={worth === w.value}
                      onClick={() => {
                        setWorth(w.value);
                        play(w.value);
                      }}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" className="button" onClick={() => play(worth)} disabled={busy}>
                {busy ? "Playing…" : `Play ${SEEDS} new seeds`}
              </button>
              <p className="caption">
                The page's own pot stays as shipped: the sim builds its own store from the turned definition,
                on its own clock, and writes no save.
              </p>
            </div>
          </div>
        </div>
      </div>

      <dl className="tb">
        <div>
          <dt className="lettering">Entry</dt>
          <dd className="num">watchpot/sim</dd>
        </div>
        <div>
          <dt className="lettering">In this figure</dt>
          <dd className="num">createSimWorld, playDays, autoPlayer, sampler, judge</dd>
        </div>
        <div>
          <dt className="lettering">Recipes</dt>
          <dd>
            <a href="./docs/pacing-contract.html">A pacing contract</a>,{" "}
            <a href="./docs/persona.html">a persona</a>, <a href="./docs/plan-and-fit.html">plan and fit</a>
          </dd>
        </div>
      </dl>
    </section>
  );
}
