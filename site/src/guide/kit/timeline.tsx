// Time made visible in the panel: what the engine did over the last few seconds, as marks on a strip that runs from
// "a few seconds ago" on the left to "now" on the right. The tick strip marks each tick and what it paid; the save
// strip marks each change to the state and each time the store wrote its save.
import { useEffect, useId, useRef, useState } from "react";
import { useGuide, useSnapshot } from "./context";
import type { Snapshot } from "./host";

interface Mark<E> {
  /** When the page heard it, ms (`performance.now`). */
  at: number;
  e: E;
}

const reduced = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * What the host did, as marks kept for `keepMs`: `take` is called with each new snapshot and the one before it and
 * returns the marks it makes (none, or several). The strip redraws every frame while it has marks (four times a
 * second under reduced motion), so they slide left as they age.
 */
function useMarks<E>(take: (next: Snapshot, prev: Snapshot) => E[], keepMs: number) {
  const { host } = useGuide();
  const marks = useRef<Mark<E>[]>([]);
  const takeRef = useRef(take);
  takeRef.current = take;
  const [now, setNow] = useState(0);
  useEffect(() => {
    let prev = host.snapshot();
    const off = host.subscribe(() => {
      const next = host.snapshot();
      if (next === prev) return;
      const at = performance.now();
      for (const e of takeRef.current(next, prev)) marks.current.push({ at, e });
      prev = next;
    });
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const draw = () => {
      const t = performance.now();
      marks.current = marks.current.filter((m) => t - m.at <= keepMs);
      setNow(t);
      if (reduced()) timer = setTimeout(draw, 250);
      else frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      off();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [host, keepMs]);
  return { marks: marks.current, now };
}

const W = 320;
const H = 56;

/** The strip's frame: a baseline, a rule each second, and "now" at the right. */
function Ruler({ keepMs, label }: { keepMs: number; label: string }) {
  const seconds = Math.floor(keepMs / 1000);
  return (
    <>
      {Array.from({ length: seconds + 1 }, (_, i) => {
        const x = W - (i * 1000 * W) / keepMs;
        return (
          <g key={i}>
            <line className="strip__second" x1={x} x2={x} y1={0} y2={H} />
            <text
              className="strip__when"
              x={x}
              y={H + 13}
              textAnchor={i === 0 ? "end" : i === seconds ? "start" : "middle"}
            >
              {i === 0 ? "now" : `${i} s ago`}
            </text>
          </g>
        );
      })}
      <line className="strip__base" x1={0} x2={W} y1={H} y2={H} />
      <title>{label}</title>
    </>
  );
}

interface Tick {
  dt: number;
  paid: number;
}

/**
 * Every tick of the last three seconds, as a mark as tall as what it paid (a full mark is `scale`), with what the
 * ticks paid a second worked out from them: what each tick paid, over the time each covered. `measure` reads the
 * number the ticks pay into.
 */
export function TickStrip<S = Record<string, unknown>>({
  measure,
  scale = 1,
  unit = "bubbles",
}: {
  measure: (state: S) => number;
  scale?: number;
  unit?: string;
}) {
  const keepMs = 3000;
  const read = measure as (state: Record<string, unknown>) => number;
  const { marks, now } = useMarks<Tick>((next, prev) => {
    const seen = (s: Snapshot) => (s.state.clock as { lastSeen?: number } | undefined)?.lastSeen ?? 0;
    const dt = seen(next) - seen(prev);
    // A tick moves the clock by a little; a catch-up or a new store by a lot, or back.
    if (dt <= 0 || dt > 2000 || next.build !== prev.build) return [];
    return [{ dt, paid: read(next.state) - read(prev.state) }];
  }, keepMs);
  const recent = marks.filter((m) => now - m.at <= 2000);
  const time = recent.reduce((sum, m) => sum + m.e.dt, 0);
  const paid = recent.reduce((sum, m) => sum + m.e.paid, 0);
  const last = marks[marks.length - 1]?.e;
  const lastSecond = marks.filter((m) => now - m.at <= 1000).length;
  return (
    <div className="strip">
      <div className="readouts">
        <div className="readout">
          <span className="readout__label">Paid a second</span>
          <span className="readout__value num">{time > 0 ? ((paid * 1000) / time).toFixed(2) : "–"}</span>
        </div>
        <div className="readout">
          <span className="readout__label">Ticks a second</span>
          <span className="readout__value num">{lastSecond}</span>
        </div>
      </div>
      <p className="panel__label">
        Each tick, as tall as what it paid{scale === 1 ? ` (full height: one ${unit.replace(/s$/, "")})` : ""}
      </p>
      <svg
        className="strip__svg"
        viewBox={`-2 -4 ${W + 4} ${H + 22}`}
        role="img"
        aria-label="The last three seconds of ticks"
      >
        <Ruler keepMs={keepMs} label="Each mark is one tick, as tall as what it paid" />
        {marks.map((m, i) => {
          const x = W - ((now - m.at) * W) / keepMs;
          const h = Math.max(1.5, Math.min(1, m.e.paid / scale) * H);
          return (
            <rect
              key={`${m.at}-${i}`}
              className="strip__tick"
              data-last={i === marks.length - 1 ? "" : undefined}
              x={x - 1.5}
              y={H - h}
              width={3}
              height={h}
            />
          );
        })}
      </svg>
      <p className="strip__note">
        {last ? (
          <>
            Last tick: <span className="num">{Math.round(last.dt)} ms</span>, paid{" "}
            <span className="num">{last.paid.toFixed(3)}</span> {unit}.
          </>
        ) : (
          "No ticks: the clock is stopped."
        )}
      </p>
    </div>
  );
}

const TICK_STOPS = [50, 100, 200, 250, 500, 1000];

/** How often the page's clock ticks: a slider over a few lengths, the engine's own 100 ms among them. */
export function TickLength() {
  const { host } = useGuide();
  const { interval } = useSnapshot();
  const id = useId();
  const at = Math.max(0, TICK_STOPS.indexOf(interval));
  return (
    <div className="ticklength control" data-changed={interval !== 100 ? "" : undefined}>
      <label className="panel__label" htmlFor={id}>
        A tick every
      </label>
      <output className="control__value num" htmlFor={id}>
        {interval} ms
      </output>
      <input
        id={id}
        className="control__slider"
        type="range"
        min={0}
        max={TICK_STOPS.length - 1}
        step={1}
        value={at}
        aria-valuetext={`${interval} milliseconds`}
        onChange={(e) => host.setInterval?.(TICK_STOPS[Number(e.currentTarget.value)] ?? 100)}
      />
    </div>
  );
}

type SaveMark = "change" | "write";

/**
 * The last five seconds of the save: a dot for each change to the state, a bar for each time the store wrote it.
 * Changes come as often as the game moves; writes, at most once a second.
 */
export function SaveStrip() {
  const keepMs = 5000;
  const { writes } = useSnapshot();
  const { marks, now } = useMarks<SaveMark>((next, prev) => {
    const out: SaveMark[] = [];
    if (next.state !== prev.state && next.build === prev.build) out.push("change");
    if (next.writes > prev.writes) out.push("write");
    return out;
  }, keepMs);
  const lastWrite = [...marks].reverse().find((m) => m.e === "write");
  return (
    <div className="strip">
      <p className="panel__label">Changes to the state, and writes of the save</p>
      <p className="strip__legend">
        <span className="strip__key" data-kind="change" aria-hidden="true" /> a change{" "}
        <span className="strip__key" data-kind="write" aria-hidden="true" /> a write
      </p>
      <svg
        className="strip__svg"
        viewBox={`-2 -4 ${W + 4} ${H + 22}`}
        role="img"
        aria-label="The last five seconds: changes to the state, and the writes of the save"
      >
        <Ruler keepMs={keepMs} label="Dots are changes to the state; bars are the save being written" />
        {marks.map((m, i) => {
          const x = W - ((now - m.at) * W) / keepMs;
          return m.e === "change" ? (
            <circle key={`${m.at}-${i}`} className="strip__change" cx={x} cy={H / 4 + 2} r={1.8} />
          ) : (
            <rect
              key={`${m.at}-${i}`}
              className="strip__tick"
              data-last={m === lastWrite ? "" : undefined}
              x={x - 2}
              y={H / 2 + 4}
              width={4}
              height={H / 2 - 4}
            />
          );
        })}
      </svg>
      <p className="strip__note">
        Written <span className="num">{writes.toLocaleString("en")}</span> {writes === 1 ? "time" : "times"}{" "}
        since the page opened
        {lastWrite ? (
          <>
            , last <span className="num">{((now - lastWrite.at) / 1000).toFixed(1)} s</span> ago
          </>
        ) : null}
        .
      </p>
    </div>
  );
}
