// The knob panel: the game's knobs in groups, a slider and a number field each, what is set by hand marked and one
// click from being put back; Save writes the lot to the game's tuning file. Pins live in the gates table (Tables.tsx).
import { type CSSProperties, type KeyboardEvent, useId, useState } from "react";
import type { DeskInfo, DeskKnob } from "../protocol";
import { clock, knobText, parseClock } from "./series";

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

/** The two ends of a conversion between what a knob stores and what its field shows. */
const clean = (v: number): number => Number(v.toPrecision(10));

function KnobRow({
  knob,
  value,
  onChange,
  onReset,
}: {
  knob: DeskKnob;
  value: number;
  onChange: (v: number, commit: boolean) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<string>();
  const label = knob.label ?? knob.key;
  const unit = knob.unit;
  // A `%` knob stores a fraction and its field takes percent; an `ms` knob is typed as a clock.
  const clocked = unit === "ms";
  const scale = unit === "%" ? 100 : 1;
  const min = finite(knob.min);
  const max = finite(knob.max);
  const step = finite(knob.step);
  const ranged = min !== undefined && max !== undefined && max > min;
  const hand = value !== knob.code;
  // How far along the track the thumb is, for the fill left of it (drawn by `--dp-fill`: it is data).
  const filled = ranged ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  const text = knobText(value, unit);
  const shown = clocked ? clock(value) : String(clean(value * scale));
  const typed = draft ?? shown;
  const parsed = (t: string): number | undefined => {
    if (clocked) return parseClock(t);
    const n = Number(t);
    return t.trim() !== "" && Number.isFinite(n) ? clean(n / scale) : undefined;
  };
  const out = (min !== undefined && value < min) || (max !== undefined && value > max);
  const bad = draft !== undefined && parsed(draft) === undefined;
  const code = unit === "x" ? String(clean(knob.code)) : knobText(knob.code, unit);

  const nudge = (dir: 1 | -1) => {
    const by = step ?? (ranged ? (max - min) / 100 : 1);
    const next = Number((value + dir * by).toFixed(Math.min(12, places(by))));
    onChange(Math.min(max ?? next, Math.max(min ?? next, next)), true);
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
  // Keys that move the thumb without being an arrow (Home, End, the page keys) commit on release.
  const onKeyUp = (e: KeyboardEvent<HTMLInputElement>) => {
    if (["Home", "End", "PageUp", "PageDown"].includes(e.key)) onChange(Number(e.currentTarget.value), true);
  };
  const commitDraft = () => {
    const n = draft === undefined ? undefined : parsed(draft);
    setDraft(undefined);
    if (n !== undefined) onChange(n, true);
  };

  return (
    <li className="knob" data-hand={hand ? "true" : undefined}>
      <p className="knob__head">
        <span className="knob__label">
          {hand && <HandMark />}
          <span>{label}</span>
        </span>
      </p>
      <div className="knob__ctl">
        {ranged && (
          <input
            className="knob__slider"
            data-hand={hand ? "true" : undefined}
            style={{ "--dp-fill": `${filled}%` } as CSSProperties}
            type="range"
            aria-label={label}
            aria-valuetext={text}
            min={min}
            max={max}
            step={step ?? "any"}
            value={value}
            onChange={(e) => onChange(Number(e.target.value), false)}
            onPointerUp={(e) => onChange(Number(e.currentTarget.value), true)}
            onKeyDown={onKey}
            onKeyUp={onKeyUp}
          />
        )}
        <span className="knob__field">
          {unit === "x" && (
            <span className="knob__unit" aria-hidden="true">
              ×
            </span>
          )}
          <input
            className="field num knob__number"
            type={clocked ? "text" : "number"}
            inputMode={clocked ? "text" : "decimal"}
            placeholder={clocked ? "m:ss" : undefined}
            aria-label={`${label} value`}
            aria-invalid={out || bad}
            min={clocked || min === undefined ? undefined : clean(min * scale)}
            max={clocked || max === undefined ? undefined : clean(max * scale)}
            step={clocked ? undefined : step === undefined ? "any" : clean(step * scale)}
            value={typed}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDraft();
              else if (e.key === "Escape") setDraft(undefined);
            }}
            onBlur={commitDraft}
          />
          {unit === "%" && (
            <span className="knob__unit" aria-hidden="true">
              %
            </span>
          )}
        </span>
        <span className="knob__slot">
          {hand && (
            <button
              type="button"
              className="control knob__reset"
              aria-label={`Reset ${label}`}
              title={`Reset to the code's value, ${code}`}
              onClick={onReset}
            >
              <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                <path
                  d="M2.4 6.2a3.6 3.6 0 1 0 1.2-2.7M2 1.6v2.3h2.3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            </button>
          )}
        </span>
      </div>
      {hand && <p className="knob__code">code {code}</p>}
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
  /** `commit` is false while a slider is dragged and true once the value is settled: only then is a rerun worth it. */
  onKnob: (key: string, value: number, commit: boolean) => void;
  onReset: (key: string) => void;
  onSave: () => void;
  onRevert: () => void;
}

const OPEN_KEY = "watchpot-desk-open-groups";

const readOpen = (): Set<string> => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
};

const writeOpen = (open: ReadonlySet<string>) => {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
  } catch {
    // No storage: the panel still works, it just forgets.
  }
};

export function Panel(p: PanelProps) {
  const [open, setOpen] = useState(readOpen);
  const [query, setQuery] = useState("");
  const [changed, setChanged] = useState(false);
  const listId = useId();
  const toggle = (name: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      writeOpen(next);
      return next;
    });
  const value = (k: DeskKnob) => p.values[k.key] ?? k.code;
  const byHand = (k: DeskKnob) => value(k) !== k.code;
  const groups: { name: string; plain: boolean; knobs: DeskKnob[] }[] = [];
  for (const k of p.knobs) {
    const name = k.group ?? "Knobs";
    const found = groups.find((g) => g.name === name);
    if (found) found.knobs.push(k);
    else groups.push({ name, plain: k.group === undefined, knobs: [k] });
  }
  const needle = query.trim().toLowerCase();
  const filtering = needle !== "" || changed;
  const matches = (k: DeskKnob) =>
    (!changed || byHand(k)) &&
    (needle === "" || [k.key, k.label ?? "", k.group ?? ""].some((t) => t.toLowerCase().includes(needle)));
  const shown = groups
    .map((g) => ({ ...g, all: g.knobs, knobs: filtering ? g.knobs.filter(matches) : g.knobs }))
    .filter((g) => g.knobs.length > 0);
  const single = groups.length === 1 && groups[0]?.plain === true;
  return (
    <aside className="panel" aria-label="Knobs">
      <div className="panel__stick">
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
              <p className="panel__strip panel__strip--error" role="alert">
                {p.note.text}
              </p>
            ) : (
              <p className="panel__strip" aria-live="polite">
                {p.dirty
                  ? "Unsaved changes"
                  : (p.note?.text ?? `Saves to ${p.tuningFile.split(/[\\/]/).pop()}`)}
              </p>
            )}
          </div>
          {groups.length > 0 && (
            <div className="panel__filter">
              <input
                className="field panel__search"
                type="search"
                aria-label="Filter knobs"
                placeholder="Filter knobs"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="button"
                className="control"
                aria-pressed={changed}
                onClick={() => setChanged((c) => !c)}
              >
                Changed only
              </button>
            </div>
          )}
          {groups.length === 0 ? (
            <p className="empty">
              This game names no knobs. Name the numbers worth turning with <code>defineKnobs</code> and each
              gets a slider here.
            </p>
          ) : shown.length === 0 ? (
            <p className="empty panel__none">No knobs match.</p>
          ) : (
            shown.map((g) => {
              const collapsible = !(single && g.plain);
              const isOpen = !collapsible || filtering || open.has(g.name);
              const hands = g.all.filter(byHand).length;
              const id = `${listId}-${g.name.replace(/\s+/g, "-")}`;
              return (
                <section className="knobs" key={g.name} aria-label={g.name}>
                  {collapsible ? (
                    <h3 className="knobs__head lettering">
                      <button
                        type="button"
                        className="knobs__toggle"
                        aria-expanded={isOpen}
                        aria-controls={id}
                        onClick={() => toggle(g.name)}
                      >
                        {`${g.name} · ${g.all.length} knobs${hands > 0 ? ` · ${hands} by hand` : ""}`}
                      </button>
                    </h3>
                  ) : (
                    <h3 className="knobs__head lettering">{g.name}</h3>
                  )}
                  {isOpen && (
                    <ul className="knobs__list" id={id}>
                      {g.knobs.map((k) => (
                        <KnobRow
                          key={k.key}
                          knob={k}
                          value={value(k)}
                          onChange={(v, commit) => p.onKnob(k.key, v, commit)}
                          onReset={() => p.onReset(k.key)}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}

export type Hand = { knobs: Record<string, number>; pins: NonNullable<DeskInfo["pins"]> };
