// The knob panel: the game's knobs in groups, a slider and a number field each, what is set by hand marked and one
// click from being put back; Save writes the lot to the game's tuning file. Pins live in the gates table (Tables.tsx).
import { type KeyboardEvent, useState } from "react";
import type { DeskInfo, DeskKnob } from "../protocol";
import { knobText } from "./series";

/** The mark of a value set by hand: a filled square in the ink, with its meaning for a reader that cannot see it. */
export function HandMark() {
  return (
    <span className="hand__mark">
      <span className="sr">by hand</span>
    </span>
  );
}

const finite = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** The decimals a step has, so stepping does not drift: `0.05` has two. */
const places = (step: number): number => {
  const text = String(step);
  const e = /e-(\d+)$/.exec(text);
  return e ? Number(e[1]) : (text.split(".")[1]?.length ?? 0);
};

function KnobRow({
  knob,
  value,
  onChange,
  onReset,
}: {
  knob: DeskKnob;
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<string>();
  const label = knob.label ?? knob.key;
  const min = finite(knob.min);
  const max = finite(knob.max);
  const step = finite(knob.step);
  const ranged = min !== undefined && max !== undefined && max > min;
  const hand = value !== knob.code;
  const text = knobText(value, knob.unit);
  // A number typed halfway ("1.") is kept as typed while it still means the value held.
  const typed = draft !== undefined && Number(draft) === value ? draft : String(value);
  const out = (min !== undefined && value < min) || (max !== undefined && value > max);

  const nudge = (dir: 1 | -1) => {
    const by = step ?? (ranged ? (max - min) / 100 : 1);
    const next = Number((value + dir * by).toFixed(Math.min(12, places(by))));
    onChange(Math.min(max ?? next, Math.max(min ?? next, next)));
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? -1
          : 0;
    if (dir === 0) return;
    e.preventDefault();
    nudge(dir);
  };

  return (
    <li className="knob" data-hand={hand ? "true" : undefined}>
      <p className="knob__head">
        <span className="knob__label">
          {hand && <HandMark />}
          <span>{label}</span>
        </span>
        <span className="knob__value num">
          {hand ? (
            <>
              <strong>{text}</strong>
              <s className="hand__code">{knobText(knob.code, knob.unit)}</s>
            </>
          ) : (
            text
          )}
        </span>
      </p>
      <div className="knob__ctl">
        {ranged && (
          <input
            className="knob__slider"
            type="range"
            aria-label={label}
            aria-valuetext={text}
            min={min}
            max={max}
            step={step ?? "any"}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            onKeyDown={onKey}
          />
        )}
        <input
          className="field num knob__number"
          type="number"
          inputMode="decimal"
          aria-label={`${label} value`}
          aria-invalid={out}
          min={min}
          max={max}
          step={step ?? "any"}
          value={typed}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => setDraft(undefined)}
        />
        {hand && (
          <button type="button" className="control control--small" onClick={onReset}>
            Reset
          </button>
        )}
      </div>
    </li>
  );
}

export interface PanelProps {
  knobs: readonly DeskKnob[];
  values: Readonly<Record<string, number>>;
  tuningFile: string;
  /** What is set differs from what is saved. */
  dirty: boolean;
  saving: boolean;
  /** The strip's line after a save: what was written, or what went wrong. */
  note?: { kind: "saved" | "error"; text: string };
  onKnob: (key: string, value: number) => void;
  onReset: (key: string) => void;
  onSave: () => void;
  onRevert: () => void;
}

export function Panel(p: PanelProps) {
  const groups: { name: string; knobs: DeskKnob[] }[] = [];
  for (const k of p.knobs) {
    const name = k.group ?? "Knobs";
    const found = groups.find((g) => g.name === name);
    if (found) found.knobs.push(k);
    else groups.push({ name, knobs: [k] });
  }
  return (
    <aside className="panel" aria-label="Knobs">
      <div className="plate">
        <div className="plate__head panel__head">
          <h2 className="lettering">Knobs</h2>
          <div className="panel__controls">
            <button type="button" className="control" disabled={!p.dirty} onClick={p.onRevert}>
              Revert
            </button>
            <button type="button" className="control" disabled={!p.dirty || p.saving} onClick={p.onSave}>
              Save
            </button>
          </div>
          {p.note?.kind === "error" ? (
            <p className="panel__strip panel__strip--error num" role="alert">
              {p.note.text}
            </p>
          ) : (
            <p className="panel__strip num" aria-live="polite">
              {p.dirty ? "Unsaved changes" : (p.note?.text ?? `Saves to ${p.tuningFile}`)}
            </p>
          )}
        </div>
        {groups.length === 0 ? (
          <p className="empty">
            This game names no knobs. Name the numbers worth turning with <code>defineKnobs</code> and each
            gets a slider here.
          </p>
        ) : (
          groups.map((g) => (
            <section className="knobs" key={g.name} aria-label={g.name}>
              <h3 className="knobs__head lettering">{g.name}</h3>
              <ul className="knobs__list">
                {g.knobs.map((k) => (
                  <KnobRow
                    key={k.key}
                    knob={k}
                    value={p.values[k.key] ?? k.code}
                    onChange={(v) => p.onKnob(k.key, v)}
                    onReset={() => p.onReset(k.key)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}

export type Hand = { knobs: Record<string, number>; pins: NonNullable<DeskInfo["pins"]> };
