/**
 * The game's own numbers that have no place in a grid: by group, each a full-width row whose label is never cut (it
 * wraps), with a hover that says the label, what the number does and its id.
 */
import { useCallback, useMemo } from "react";
import type { DeskTunable } from "../../sound/desk";
import s from "../SoundDesk.module.css";
import { useView } from "./context";
import { ParamRow } from "./layered";
import { tuneKey, written } from "./model";
import { fmtValue, linScale, parseValue } from "./scale";

/** A tunable's scale, format and parse, from its range, step and unit. */
export function useTunable(t: Pick<DeskTunable, "min" | "max" | "step" | "unit">) {
  const unit = t.unit ?? "";
  const scale = useMemo(() => linScale(t.min, t.max, t.step), [t.min, t.max, t.step]);
  const format = useCallback((v: number) => fmtValue(v, unit, t.step), [unit, t.step]);
  const parse = useCallback(
    (text: string) => {
      const v = parseValue(text, unit);
      return v === null ? null : Math.min(t.max, Math.max(t.min, v));
    },
    [unit, t.min, t.max],
  );
  return { scale, format, parse };
}

/** What a tunable's hover says after its label: what it does, its range and its id. */
export const tunableHint = (t: DeskTunable, format: (v: number) => string) =>
  `${t.hint ? `${t.hint} ` : ""}Range ${format(t.min)} to ${format(t.max)}; declared ${format(t.initial)}. Id ${t.id}.`;

export function Tunables() {
  const { snap, edit } = useView();
  const list = snap.tunables.filter((t) => !t.cell);
  if (list.length === 0)
    return (
      <p className={s.empty}>
        The game declares no numbers of its own here. A <code>tunable()</code> in its code appears as a row.
      </p>
    );
  const groups = new Map<string, DeskTunable[]>();
  for (const t of list) {
    const g = groups.get(t.group);
    if (g) g.push(t);
    else groups.set(t.group, [t]);
  }
  return (
    <div className={s.tunables}>
      <div className={s.tuneColumns}>
        {[...groups].map(([group, rows]) => {
          const moved = rows.filter((t) => written(snap.file, edit, tuneKey(t.id))).length;
          return (
            <section key={group} className={s.tuneGroup} aria-label={group}>
              <h3 className={s.blockTitle}>
                {group}
                {moved > 0 && (
                  <span className={s.count} data-moved="" title="Written in the layer being edited">
                    {moved}
                  </span>
                )}
              </h3>
              {rows.map((t) => (
                <TunableRow key={t.id} t={t} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TunableRow({ t }: { t: DeskTunable }) {
  const { scale, format, parse } = useTunable(t);
  return (
    <ParamRow
      k={tuneKey(t.id)}
      name={t.label}
      label={t.label}
      scale={scale}
      format={format}
      parse={parse}
      fallback={t.initial}
      hint={tunableHint(t, format)}
      wrap
    />
  );
}
