// What every sound demo on these pages shares: the engine made live on the page, the words a panel uses, and the
// pieces it draws. Nothing here touches an `AudioContext` at module scope or while a page is drawn: the build draws
// every panel to HTML in a process with no audio, so a demo is a still until the reader's first press.
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";

/** What a demo's engine is doing: nothing yet, booting, its core running, or the fallback where the core cannot. */
export type Live = "asleep" | "booting" | "core" | "fallback";

/** The part of a `Sound` the demos' panels need. */
export interface Engine {
  unlock(): Promise<void>;
  mode(): "locked" | "core" | "fallback";
  setMuted(value: boolean): void;
  output(): AudioNode | null;
}

/**
 * Starts the example's sound on the reader's press and says what came up. The first press is the one browsers need
 * before audio: it resumes the context and boots the core. Leaving the page silences it.
 */
export function useEngine<E extends Engine>(make: () => E) {
  const read = useRef(make);
  useEffect(() => {
    read.current = make;
  }, [make]);
  const [live, setLive] = useState<Live>("asleep");
  const booting = useRef<Promise<void> | null>(null);
  const here = useRef(true);

  const start = useCallback(async (): Promise<E> => {
    const sound = read.current();
    booting.current ??= (async () => {
      setLive("booting");
      await sound.unlock();
      if (here.current) setLive(sound.mode() === "core" ? "core" : "fallback");
    })();
    await booting.current;
    return sound;
  }, []);

  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
      read.current().setMuted(true);
    };
  }, []);

  return { live, start };
}

/** The mode as a person says it, with "locked" read as asleep: nothing has asked for audio yet. */
export const said = (live: Live): string =>
  live === "asleep" ? "asleep" : live === "booting" ? "starting" : live;

/** One figure with its name, in the panel's readouts. */
export function Shown({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="readout">
      <span className="readout__label">{label}</span>
      <span className="readout__value num">{value}</span>
    </div>
  );
}

/** A row of readouts. */
export function ShownRow({ children }: { children: ReactNode }) {
  return <div className="readouts">{children}</div>;
}

/** A line of small words under a control. */
export function Line({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

/**
 * A slider in the panel, in the kit's own shape: its name, the number as it is written, and the track. `onDone` runs
 * when the reader lets go of it: a drag redraws, and the release is what the demo acts on.
 */
export function Control({
  label,
  shown,
  min,
  max,
  step,
  value,
  onChange,
  onDone,
}: {
  label: ReactNode;
  shown: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  onDone?: () => void;
}) {
  const id = useId();
  return (
    <div className="control" data-kind="slider">
      <label className="control__label" htmlFor={id}>
        {label}
      </label>
      <output className="control__value num" htmlFor={id}>
        {shown}
      </output>
      <input
        id={id}
        className="control__slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={shown}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        onPointerUp={onDone}
        onKeyUp={onDone}
        onBlur={onDone}
      />
    </div>
  );
}
