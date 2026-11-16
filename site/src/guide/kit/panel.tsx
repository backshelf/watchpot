// The live panel: a real game on the engine, ticking beside the page's words, and the pieces a page shows of it.
import { type ReactNode, useId, useState } from "react";
import { D, fmt, fmtPlayed } from "watchpot/core";
import { useGuide, useSnapshot, useView } from "./context";

/**
 * The panel's frame: a plate with its name in a strip, and a mark that is lit while the engine's clock ticks the
 * game. `title` names the game ("The pot"); the rest is what the page shows of it.
 */
export function Panel({ title, children }: { title: ReactNode; children: ReactNode }) {
  const { clock } = useSnapshot();
  const { data } = useGuide();
  return (
    <section className="panel" aria-label="The game on this page">
      <header className="panel__bar">
        <span className="panel__title">{title}</span>
        <span className="panel__state" data-running={clock ? "" : undefined}>
          <span className="panel__lamp" aria-hidden="true" />
          {clock ? "Running" : "Stopped"}
        </span>
      </header>
      <div className="panel__body">{children}</div>
      <footer className="panel__foot">
        Running <a href={data.source.href}>{data.source.file}</a> on the engine, in this page.
      </footer>
    </section>
  );
}

/** A figure out of the state, with its name. `big` sets it as the panel's headline number. */
export function Readout<S = Record<string, unknown>>({
  label,
  select,
  big = false,
  unit,
}: {
  label: ReactNode;
  select: (state: S) => string | number;
  big?: boolean;
  unit?: ReactNode;
}) {
  const value = useView(select as (state: Record<string, unknown>) => string | number);
  return (
    <div className="readout" data-big={big ? "" : undefined}>
      <span className="readout__label">{label}</span>
      <span className="readout__value num" aria-live={big ? "off" : undefined}>
        {value}
        {unit ? <span className="readout__unit"> {unit}</span> : null}
      </span>
    </div>
  );
}

/** A figure out of the state inside a line of words (a button's price): the figure alone, in the mono face. */
export function Value<S = Record<string, unknown>>({ select }: { select: (state: S) => string | number }) {
  const value = useView(select as (state: Record<string, unknown>) => string | number);
  return <span className="num">{value}</span>;
}

/** A row of readouts. */
export function Readouts({ children }: { children: ReactNode }) {
  return <div className="readouts">{children}</div>;
}

/**
 * A button that calls one of the game's actions, by its path on the state (`pot.tap`). `ready` says whether it can
 * be pressed now: a press the game would refuse is drawn dashed, and one it would take is lit.
 */
export function Act<S = Record<string, unknown>>({
  call,
  args = [],
  ready,
  children,
}: {
  call: string;
  args?: unknown[];
  ready?: (state: S) => boolean;
  children: ReactNode;
}) {
  const { host } = useGuide();
  const can = useView((ready ?? (() => true)) as (state: Record<string, unknown>) => boolean);
  return (
    <button
      type="button"
      className="button act"
      data-ready={ready && can ? "" : undefined}
      aria-disabled={!can}
      onClick={() => {
        if (can) host.call(call, ...args);
      }}
    >
      {children}
    </button>
  );
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className="actions">{children}</div>;
}

/** The engine's clock, on or off, and the passes it has run. */
export function ClockSwitch() {
  const { host } = useGuide();
  const { clock, passes } = useSnapshot();
  const id = useId();
  return (
    <div className="panel__row">
      <span className="panel__label" id={id}>
        The clock
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={clock}
        aria-labelledby={id}
        className="control__switch"
        onClick={() => host.setClock(!clock)}
      >
        <span className="control__switch-on">Ticking</span>
        <span className="control__switch-off">Stopped</span>
      </button>
      <span className="panel__passes num" title="Passes the engine has run since the page opened">
        {passes.toLocaleString("en")} {passes === 1 ? "tick" : "ticks"}
      </span>
    </div>
  );
}

const AWAY_STOPS = [60_000, 10 * 60_000, 3_600_000, 4 * 3_600_000, 12 * 3_600_000, 24 * 3_600_000];

/**
 * Sends the reader away: a choice of how long, and a button that moves the page's clock forward by it and lets the
 * engine pay for the gap the way it does when a player reopens the game. `paid` reads what the absence made.
 */
export function Away<S = Record<string, unknown>>({ measure }: { measure?: (state: S) => number }) {
  const { host } = useGuide();
  const { away } = useSnapshot();
  const [stop, setStop] = useState(2);
  const [before, setBefore] = useState<number | null>(null);
  const id = useId();
  const ms = AWAY_STOPS[stop] ?? 3_600_000;
  const after = useView((measure ?? (() => 0)) as (state: Record<string, unknown>) => number);
  const made = before === null || !measure ? null : after - before;
  return (
    <div className="away">
      <div className="away__row">
        <label className="panel__label" htmlFor={id}>
          Be away for
        </label>
        <output className="num away__ms" htmlFor={id}>
          {fmtPlayed(ms)}
        </output>
        <input
          id={id}
          className="control__slider"
          type="range"
          min={0}
          max={AWAY_STOPS.length - 1}
          step={1}
          value={stop}
          aria-valuetext={fmtPlayed(ms)}
          onChange={(e) => setStop(Number(e.currentTarget.value))}
        />
        <button
          type="button"
          className="button"
          onClick={() => {
            setBefore(after);
            host.away(ms);
          }}
        >
          Leave and come back
        </button>
      </div>
      {away ? (
        <p className="away__note" role="status">
          Back after {fmtPlayed(away.ms)}.
          {made !== null ? <> The time away paid {fmt(Math.max(0, made)).text}.</> : null}
        </p>
      ) : null}
    </div>
  );
}

/** The save as the engine wrote it: its text, as it stands in storage now. */
export function SaveText() {
  const { saved } = useSnapshot();
  return (
    <details className="savetext">
      <summary className="panel__label">The save, as stored</summary>
      <pre className="savetext__body num">{saved ? pretty(saved) : "Nothing saved yet."}</pre>
    </details>
  );
}

function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 1);
  } catch {
    return text;
  }
}

/** The game's state as a tree of keys and values, the slices named (all of them, or the ones in `only`). */
export function StateTree({ only, label = "The state" }: { only?: readonly string[]; label?: ReactNode }) {
  const { state } = useSnapshot();
  const keys = Object.keys(state).filter((k) => (only ? only.includes(k) : true));
  return (
    <div className="statetree">
      <p className="panel__label">{label}</p>
      <ul className="statetree__list num">
        {keys.map((key) => (
          <Branch key={key} name={key} value={state[key]} />
        ))}
      </ul>
    </div>
  );
}

function Branch({ name, value }: { name: string; value: unknown }) {
  if (typeof value === "function") return null;
  if (value && typeof value === "object" && !isDecimalLike(value)) {
    const entries = Object.entries(value).filter(([, v]) => typeof v !== "function");
    return (
      <li>
        <span className="statetree__key">{name}</span>
        <ul>
          {entries.map(([k, v]) => (
            <Branch key={k} name={k} value={v} />
          ))}
        </ul>
      </li>
    );
  }
  const decimal = value !== null && typeof value === "object";
  return (
    <li>
      <span className="statetree__key">{name}</span> <span className="statetree__value">{leaf(value)}</span>
      {decimal ? <span className="statetree__type"> Decimal</span> : null}
    </li>
  );
}

const isDecimalLike = (v: object) => "mag" in v && "layer" in v && "sign" in v;

/** A value as the state holds it: a Decimal's own digits up to three decimals (a million and up, as `fmt` prints). */
function leaf(value: unknown): string {
  if (value && typeof value === "object") {
    const d = D(value as never);
    return d.abs().lt(1e6) ? String(Number(d.toNumber().toFixed(3))) : fmt(d).text;
  }
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

/** Starts the game over: forgets the save, as `clearSave` does. */
export function StartOver() {
  const { host } = useGuide();
  return (
    <button type="button" className="button button--small" onClick={() => host.reset()}>
      Start over
    </button>
  );
}
