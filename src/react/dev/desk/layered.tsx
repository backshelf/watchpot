/**
 * Controls over one key of the mix, aware of its layers: each shows the value the layer being edited would give,
 * wears the tone of the layer that says it, marks when that is not what is heard, writes into the layer being edited
 * and resets by taking that layer's write away. The same for a mixer's key and for a trim, a source's trim or send,
 * and a tunable.
 */
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeskParam } from "../../../sound/desk";
import s from "../SoundDesk.module.css";
import { useDesk, useView } from "./context";
import { Fader, Knob, Picker, Pip, Segmented, ValueField, type Wear } from "./controls";
import { METER_SCALE } from "./loop";
import { layerName, ownerName, type Resolved, resolve, type Snapshot, toneOf } from "./model";
import {
  dbScale,
  fmtDb,
  fmtValue,
  fromDb,
  gainScale,
  paramScale,
  parseValue,
  type Scale,
  toDb,
} from "./scale";

export const LEVEL = METER_SCALE;
export const TRIM = dbScale(-60, 12);
export const SEND = gainScale(Math.SQRT2);
/** A choice with more options than this is a list rather than a segmented row. */
const SEGMENTS_UP_TO = 4;

export const dbText = (v: number) => `${fmtDb(v)} dB`;
export const parseDb = (text: string) => parseValue(text, "dB");
export const sendText = (v: number) => dbText(toDb(v));
export const parseSend = (text: string) => {
  const v = parseValue(text, "dB");
  return v === null ? null : fromDb(v);
};

/** A key as a control needs it: where it stands, how it is worn, and the writes. */
export interface Layered extends Resolved {
  wear: Wear;
  pip: "written" | "says" | "none";
  /** The layer being edited, by name. */
  editName: string;
  write: (value: number) => void;
  reset: () => void;
  /** A sentence for the hover and the info line: what it shows, who says it, what is heard. */
  info: (what: string, format: (v: number) => string, hint?: string) => string;
}

function infoOf(r: Resolved, snap: Snapshot, editName: string) {
  return (what: string, format: (v: number) => string, hint?: string): string => {
    const lead = hint ? `${what}. ${hint}` : what;
    if (r.locked) return `${lead} Now ${format(r.live)}, held by a mod route: it cannot be set by hand.`;
    const says = r.says
      ? r.written
        ? `${editName} says ${format(r.shown)}, set on the desk (double-click or Delete takes it away).`
        : `${editName} says ${format(r.shown)} in code.`
      : `${editName} does not say it: ${format(r.shown)} is ${r.from === "mix" ? "what All scenes says" : "the code's own value"}.`;
    const heard = r.shadowed ? ` Heard now: ${format(r.live)} from ${ownerName(r.owner, snap)}.` : "";
    return `${lead} ${says}${heard}`;
  };
}

/** Reads one key for the layer being edited. `fallback` is its worth when nothing says it and the desk cannot tell. */
export function useKey(key: string, fallback: number): Layered {
  const { desk } = useDesk();
  const { snap, edit } = useView();
  const r = resolve(desk, snap.file, key, edit, fallback);
  const write = useCallback((v: number) => desk.set(edit, key, v), [desk, edit, key]);
  const reset = useCallback(() => desk.set(edit, key, undefined), [desk, edit, key]);
  const editName = layerName(edit, snap) ?? "This scene";
  return {
    ...r,
    wear: {
      tone: toneOf(r.from),
      says: r.says,
      shadowed: r.shadowed,
      ...(r.shadowed ? { ghost: r.live, ghostTone: toneOf(r.owner) } : {}),
    },
    pip: r.written ? "written" : r.says ? "says" : "none",
    editName,
    write,
    reset,
    info: infoOf(r, snap, editName),
  };
}

/** The mark and reset beside a layered control. */
export function KeyPip({ k, label }: { k: Layered; label: string }) {
  return (
    <Pip
      state={k.locked ? "none" : k.pip}
      label={`Reset ${label} in ${k.editName}`}
      onPress={k.reset}
      info={
        k.pip === "written"
          ? `${k.editName} holds a desk write for ${label}: press to take it away`
          : k.pip === "says"
            ? `${k.editName} says ${label} in code`
            : undefined
      }
    />
  );
}

export interface ParamRowProps {
  /** The key it reads and writes. */
  k: string;
  /** What the row shows as its name. */
  name: ReactNode;
  /** What a screen reader calls the control, and the info line's subject. */
  label: string;
  scale: Scale;
  format: (v: number) => string;
  parse: (text: string) => number | null;
  fallback: number;
  /** A mark on the fader's throw (unity). */
  mark?: number;
  hint?: string;
  /** Lets the name wrap over lines instead of being cut. */
  wrap?: boolean;
}

/** One setting as a row: its name, a fader, its value to type or drag, and its layer mark. */
export function ParamRow({
  k,
  name,
  label,
  scale,
  format,
  parse,
  fallback,
  mark,
  hint,
  wrap,
}: ParamRowProps) {
  const key = useKey(k, fallback);
  const info = key.info(label, format, hint);
  return (
    <div className={s.row} data-wrap={wrap || undefined} data-locked={key.locked || undefined}>
      <span className={s.rowName} title={info} data-info={info}>
        {name}
      </span>
      <Fader
        value={key.shown}
        scale={scale}
        onChange={key.write}
        onReset={key.reset}
        label={label}
        valueText={format(key.shown)}
        readOnly={key.locked}
        mark={mark}
        info={info}
        {...key.wear}
      />
      <ValueField
        value={key.shown}
        format={format}
        parse={parse}
        onCommit={key.write}
        onReset={key.reset}
        scale={scale}
        label={`${label} value`}
        readOnly={key.locked}
        info={info}
        tone={key.wear.tone}
        says={key.says}
        shadowed={key.shadowed}
      />
      <KeyPip k={key} label={label} />
    </div>
  );
}

/** A setting that is one of a few: a segmented row, or a list when there are many. */
export function ChoiceRow({
  k,
  name,
  label,
  choices,
  fallback,
}: {
  k: string;
  name: ReactNode;
  label: string;
  choices: readonly string[];
  fallback: number;
}) {
  const key = useKey(k, fallback);
  const options = useMemo(() => choices.map((c, i) => ({ value: String(i), label: c })), [choices]);
  const value = String(Math.round(key.shown));
  const info = key.info(label, (v) => choices[Math.round(v)] ?? String(v));
  const write = (v: string) => key.write(Number(v));
  return (
    <div className={s.row} data-choice="" data-locked={key.locked || undefined}>
      <span className={s.rowName} title={info} data-info={info}>
        {name}
      </span>
      <span className={s.rowWide} title={info} data-info={info}>
        {options.length <= SEGMENTS_UP_TO ? (
          <Segmented
            label={label}
            options={options}
            value={value}
            onChange={write}
            disabled={key.locked}
            wear={key.wear}
          />
        ) : (
          <Picker
            label={label}
            value={value}
            options={options}
            onChange={write}
            disabled={key.locked}
            tone={key.wear.tone}
          />
        )}
      </span>
      <KeyPip k={key} label={label} />
    </div>
  );
}

/** An effect's setting as its row: a choice, or a fader on the setting's own scale. */
export function FxParamRow({ k, param, label }: { k: string; param: DeskParam; label: string }) {
  const scale = useMemo(() => paramScale(param), [param]);
  const format = useCallback((v: number) => fmtValue(v, param.unit), [param.unit]);
  const parse = useCallback(
    (text: string) => {
      const v = parseValue(text, param.unit);
      return v === null ? null : Math.min(param.max, Math.max(param.min, v));
    },
    [param.unit, param.min, param.max],
  );
  const name = paramName(param.param);
  if (param.scale === "choice")
    return (
      <ChoiceRow
        k={k}
        name={name}
        label={`${label} ${name}`}
        choices={param.choices ?? []}
        fallback={param.initial}
      />
    );
  return (
    <ParamRow
      k={k}
      name={name}
      label={`${label} ${name}`}
      scale={scale}
      format={format}
      parse={parse}
      fallback={param.initial}
    />
  );
}

const ROW = 22;

/**
 * A panel's rows, flowing into as many columns as its height asks for: it counts the rows that fit and the grid
 * makes a column for each that many. (A grid cannot be left to count them itself: asked how wide it is before it
 * knows how tall, it answers with one row and every setting in a column of its own.)
 */
export function Params({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(6);
  useEffect(() => {
    const el = ref.current;
    const Observer = (
      el?.ownerDocument.defaultView as { ResizeObserver?: typeof ResizeObserver } | null | undefined
    )?.ResizeObserver;
    if (!el || !Observer) return;
    const measure = () => setRows(Math.max(2, Math.floor((el.clientHeight - 6) / ROW)));
    measure();
    const watch = new Observer(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return (
    <div ref={ref} className={s.params} style={{ "--dp-rows": rows }}>
      {children}
    </div>
  );
}

/** A setting's name as words: `lowFreq` is "low freq", `mid1Q` is "mid 1 q". */
export const paramName = (param: string) =>
  param
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .toLowerCase();

/** A send as a knob with its target and level beside it: a bus's (`send:`) or a source's own (`chsend:`). */
export function SendKnob({
  k,
  to,
  label,
  fallback = 0,
}: {
  k: string;
  to: string;
  label: string;
  fallback?: number;
}) {
  const key = useKey(k, fallback);
  const info = key.info(label, sendText);
  return (
    <div className={s.send}>
      <Knob
        value={key.shown}
        scale={SEND}
        onChange={key.write}
        onReset={key.reset}
        label={label}
        valueText={sendText(key.shown)}
        readOnly={key.locked}
        info={info}
        {...key.wear}
      />
      <span className={s.sendText} title={info} data-info={info}>
        <span className={s.sendTo}>{to}</span>
        <span className={s.sendLevel} data-says={key.says ? undefined : "false"}>
          {key.shown <= 0 ? "off" : fmtDb(toDb(key.shown))}
        </span>
      </span>
      <KeyPip k={key} label={label} />
    </div>
  );
}
