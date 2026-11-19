// What every sim demo on these pages shares: a run that happens on the reader's press and never while the page is
// drawn, the panel's own figures, and the plan's gates as rows. The build draws each panel to HTML in a process with
// no clock and no worker, so a demo is a still until the first press; a run is a small plan, a few milliseconds.
import { type ReactNode, useEffect, useRef, useState } from "react";
import { fmtClock } from "watchpot/sim";
import { useExample } from "../../kit";

/** A demo's run, and the example it was run against. */
export interface Run<R> {
  /** The run's answer, or null before the first press and after a control moved the example under it. */
  result: R | null;
  /** Whether the reader has pressed it at all. */
  ran: boolean;
  /** Runs it again, at the example as it stands. */
  again: () => void;
  /** Changes what the run answered (a proof of the fit it just made). */
  set: (update: (prior: R) => R) => void;
}

/**
 * A demo that runs on a press. `run` is called with the example's exports: a control moved rebuilds the example, so
 * the run is redone in an effect at the new one (never during the render), once the reader has pressed it at all.
 */
export function useRun<E, R>(run: (example: E) => R): Run<R> {
  const example = useExample<E>();
  const [state, setState] = useState<{ example: E; result: R } | null>(null);
  const most = useRef(run);
  most.current = run;
  const ran = useRef(false);
  const current = state !== null && state.example === example ? state.result : null;
  useEffect(() => {
    if (!ran.current || state === null || state.example === example) return;
    setState({ example, result: most.current(example) });
  }, [example, state]);
  return {
    result: current,
    ran: ran.current,
    again: () => {
      ran.current = true;
      setState({ example, result: most.current(example) });
    },
    set: (update) =>
      setState((prior) =>
        prior !== null && prior.example === example ? { example, result: update(prior.result) } : prior,
      ),
  };
}

/** One figure with its name, at the panel's own size. */
export function Shown({ label, value, unit }: { label: ReactNode; value: ReactNode; unit?: ReactNode }) {
  return (
    <div className="readout">
      <span className="readout__label">{label}</span>
      <span className="readout__value num">
        {value}
        {unit ? <span className="readout__unit"> {unit}</span> : null}
      </span>
    </div>
  );
}

/** A row of figures. */
export function ShownRow({ children }: { children: ReactNode }) {
  return <div className="readouts">{children}</div>;
}

/** A press in the panel: the demo's own button, not a move in a game. */
export function Press({ onPress, children }: { onPress: () => void; children: ReactNode }) {
  return (
    <button type="button" className="button" onClick={onPress}>
      {children}
    </button>
  );
}

/** A gate as a row: its name and its price, then the minute it was planned for against the minute it opened. */
export interface GateRow {
  key: string;
  atMs: number;
  openedMs?: number;
  value?: string;
}

/** The plan's gates, priced or not: a gate the fit never opened says "never". */
export function GateRows({ gates }: { gates: readonly GateRow[] }) {
  return (
    <ul className="buyrows">
      {gates.map((gate) => (
        <li key={gate.key} className="buyrows__row">
          <span className="buyrows__name">{gate.key}</span>
          <span className="num">{gate.value ?? "unpriced"}</span>
          <span className="num buyrows__line">
            planned {fmtClock(gate.atMs)}
            {gate.openedMs === undefined ? "" : `, opened ${fmtClock(gate.openedMs)}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Minutes of play, as the plan says them: `0:04`. */
export const minute = (ms: number): string => fmtClock(ms);
