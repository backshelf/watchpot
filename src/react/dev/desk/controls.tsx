/**
 * The desk's controls: a fader and a knob that answer the pointer, the wheel, the keys and a fine mode; a value field
 * that is typed into, dragged and nudged; mute and solo as toggle buttons; a segmented switch of real radios; a picker
 * over a native select; the mark that says a layer wrote a value; a splitter. Every listener sits on the element
 * itself, so they work in whichever document the desk is drawn into.
 */
import {
  type KeyboardEvent,
  type MouseEvent,
  memo,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import s from "../SoundDesk.module.css";
import type { Tone } from "./model";
import type { Nudge, Scale } from "./scale";

/** What a hover and the info line say of an element: its `title`, and the same text for the desk's foot. */
export const tip = (text: string | undefined) => (text ? { title: text, "data-info": text } : {});

/** How a control wears its layer: who says the value in force, and whether what it shows is what is heard. */
export interface Wear {
  tone?: Tone;
  /** The edit layer says the value shown. */
  says?: boolean;
  /** What is shown is not what is heard. */
  shadowed?: boolean;
  /** The value heard, drawn as a mark when it is not the one shown, in the tone of the layer that says it. */
  ghost?: number;
  ghostTone?: Tone;
}

const wearOf = (w: Wear) => ({
  "data-tone": w.tone ?? "mix",
  "data-says": w.says === false ? "false" : undefined,
  "data-shadowed": w.shadowed || undefined,
  "data-ghost": w.ghost !== undefined ? (w.ghostTone ?? "mix") : undefined,
});

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The step a key asks for, or undefined when the key is not one a control answers. */
function keyMove(
  e: KeyboardEvent,
  scale: Scale,
  value: number,
): { to: number } | { reset: true } | undefined {
  const size: Nudge = e.shiftKey ? "coarse" : e.altKey || e.ctrlKey || e.metaKey ? "fine" : "normal";
  switch (e.key) {
    case "ArrowUp":
    case "ArrowRight":
      return { to: scale.nudge(value, 1, size) };
    case "ArrowDown":
    case "ArrowLeft":
      return { to: scale.nudge(value, -1, size) };
    case "PageUp":
      return { to: scale.nudge(value, 1, "coarse") };
    case "PageDown":
      return { to: scale.nudge(value, -1, "coarse") };
    case "Home":
      return { to: scale.min };
    case "End":
      return { to: scale.max };
    case "Delete":
    case "Backspace":
      return { reset: true };
    default:
      return undefined;
  }
}

interface Drag {
  pointer: number;
  /** Where the drag is anchored: re-anchored whenever shift goes down or up, so fine mode never jumps. */
  coord: number;
  pos: number;
  fine: boolean;
  length: number;
}

interface Live {
  value: number;
  scale: Scale;
  onChange: (value: number) => void;
  onReset: (() => void) | undefined;
  readOnly: boolean;
}

/** What a fader and a knob share: the value held under the hand, the wheel while focused, the keys. */
function useSlider(props: {
  value: number;
  scale: Scale;
  onChange: (value: number) => void;
  onReset?: () => void;
  readOnly: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // The cap follows the hand at once, before the desk's change comes back round.
  const [held, setHeld] = useState<number | null>(null);
  const shown = held ?? props.value;
  const live = useRef<Live>({ ...props, onReset: props.onReset, value: shown });
  live.current = { ...props, onReset: props.onReset, value: shown };

  const emit = (next: number) => {
    const { value, onChange, scale } = live.current;
    const v = Math.min(scale.max, Math.max(scale.min, next));
    if (v === value || Number.isNaN(v)) return;
    onChange(v);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: `emit` reads the live ref; bound once per element
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The wheel moves a control only while it has the focus: scrolling past a row of them moves none.
    const wheel = (e: WheelEvent) => {
      if (live.current.readOnly || el.ownerDocument.activeElement !== el) return;
      // Windows turns shift+wheel into a sideways scroll: read whichever axis moved.
      const d = e.deltaY || e.deltaX;
      if (!d) return;
      e.preventDefault();
      emit(live.current.scale.nudge(live.current.value, d < 0 ? 1 : -1, e.shiftKey ? "fine" : "normal"));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (live.current.readOnly) return;
    const move = keyMove(e, live.current.scale, live.current.value);
    if (!move) return;
    e.preventDefault();
    if ("reset" in move) live.current.onReset?.();
    else emit(move.to);
  };
  const end = () => {
    drag.current = null;
    setHeld(null);
  };
  /** Carries a drag on: `coord` grows as the value should. */
  const move = (e: PointerEvent, coord: number) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const rate = d.fine ? 0.1 : 1;
    let p = d.pos + ((coord - d.coord) / d.length) * rate;
    if (e.shiftKey !== d.fine) {
      // Re-anchor where the cap is now, then carry on at the new rate.
      d.pos = clamp01(p);
      d.coord = coord;
      d.fine = e.shiftKey;
      p = d.pos;
    }
    const v = live.current.scale.fromPos(clamp01(p));
    setHeld(v);
    emit(v);
  };
  return { ref, drag, shown, live, emit, setHeld, onKeyDown, end, move };
}

export interface FaderProps extends Wear {
  value: number;
  scale: Scale;
  onChange: (value: number) => void;
  /** What a screen reader calls it: "music level". */
  label: string;
  /** The value as words: "−6.0 dB". */
  valueText: string;
  orientation?: "vertical" | "horizontal";
  /** Double-click, Delete or Backspace: back to what lies under the layer being edited. */
  onReset?: () => void;
  readOnly?: boolean;
  /** A mark on the throw (unity on a dB fader). */
  mark?: number;
  /** What the hover and the info line say. */
  info?: string;
}

/** The least drag, in pixels, that takes a fader from one end to the other. */
const SHORTEST_THROW = 140;

/**
 * A fader. A drag that starts anywhere on it moves the cap from where it stands: a press never makes it jump (a
 * level that leaps to where a pointer happened to land is heard). Shift drags at a tenth of the travel. The wheel moves it a step while it has the focus (shift: a fine step).
 * Arrows step (shift: coarse, Alt or Ctrl: fine), Page keys step coarse, Home and End go to the ends.
 */
export const Fader = memo(function Fader({
  value,
  scale,
  onChange,
  label,
  valueText,
  orientation = "horizontal",
  onReset,
  readOnly = false,
  mark,
  info,
  ...wear
}: FaderProps) {
  const vertical = orientation === "vertical";
  const sl = useSlider({ value, scale, onChange, onReset, readOnly });
  const coordOf = (e: { clientX: number; clientY: number }) => (vertical ? -e.clientY : e.clientX);
  const pos = scale.toPos(sl.shown);
  return (
    <div
      ref={sl.ref}
      // A native range cannot take a fader law, a fine mode or a relative drag.
      role="slider"
      tabIndex={0}
      className={s.fader}
      data-orient={vertical ? "v" : "h"}
      data-readonly={readOnly || undefined}
      {...wearOf(wear)}
      {...tip(info)}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={scale.min}
      aria-valuemax={scale.max}
      aria-valuenow={Number.isFinite(sl.shown) ? sl.shown : scale.min}
      aria-valuetext={valueText}
      aria-readonly={readOnly || undefined}
      style={{ "--dp-pos": pos }}
      onPointerDown={(e) => {
        if (e.button !== 0 || readOnly) return;
        const el = e.currentTarget;
        el.focus();
        el.setPointerCapture?.(e.pointerId);
        e.preventDefault();
        const r = el.getBoundingClientRect();
        sl.drag.current = {
          pointer: e.pointerId,
          coord: coordOf(e),
          pos: scale.toPos(sl.live.current.value),
          fine: e.shiftKey,
          // A short fader moves as if it were longer, so a setting is not swept end to end in a few pixels.
          length: Math.max(SHORTEST_THROW, vertical ? r.height : r.width),
        };
      }}
      onPointerMove={(e) => sl.move(e, coordOf(e))}
      onPointerUp={(e) => {
        if (sl.drag.current?.pointer === e.pointerId) sl.end();
      }}
      onLostPointerCapture={sl.end}
      onDoubleClick={() => {
        if (!readOnly) onReset?.();
      }}
      onKeyDown={sl.onKeyDown}
    >
      <span className={s.throw} aria-hidden="true">
        <span className={s.fill} />
        {mark !== undefined && <span className={s.unity} style={{ "--dp-at": scale.toPos(mark) }} />}
        {wear.ghost !== undefined && (
          <span className={s.ghost} style={{ "--dp-at": scale.toPos(wear.ghost) }} />
        )}
      </span>
      <span className={s.cap} data-cap="" aria-hidden="true" />
    </div>
  );
});

export interface KnobProps extends Wear {
  value: number;
  scale: Scale;
  onChange: (value: number) => void;
  label: string;
  valueText: string;
  onReset?: () => void;
  readOnly?: boolean;
  info?: string;
}

/** A knob's sweep in pixels of drag, end to end. */
const KNOB_TRAVEL = 160;
/** The arc a knob turns through, as a share of the circle, and where it starts. */
const SWEEP = 0.75;

/** A knob: dragged up and down from where it stands (shift: fine), and otherwise a fader's keys and wheel. */
export const Knob = memo(function Knob({
  value,
  scale,
  onChange,
  label,
  valueText,
  onReset,
  readOnly = false,
  info,
  ...wear
}: KnobProps) {
  const sl = useSlider({ value, scale, onChange, onReset, readOnly });
  const pos = scale.toPos(sl.shown);
  const ghost = wear.ghost !== undefined ? scale.toPos(wear.ghost) : undefined;
  return (
    <div
      ref={sl.ref}
      role="slider"
      tabIndex={0}
      className={s.knob}
      data-readonly={readOnly || undefined}
      {...wearOf(wear)}
      {...tip(info)}
      aria-label={label}
      aria-valuemin={scale.min}
      aria-valuemax={scale.max}
      aria-valuenow={Number.isFinite(sl.shown) ? sl.shown : scale.min}
      aria-valuetext={valueText}
      aria-readonly={readOnly || undefined}
      onPointerDown={(e) => {
        if (e.button !== 0 || readOnly) return;
        e.currentTarget.focus();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        e.preventDefault();
        sl.drag.current = {
          pointer: e.pointerId,
          coord: -e.clientY,
          pos: scale.toPos(sl.live.current.value),
          fine: e.shiftKey,
          length: KNOB_TRAVEL,
        };
      }}
      onPointerMove={(e) => sl.move(e, -e.clientY)}
      onPointerUp={(e) => {
        if (sl.drag.current?.pointer === e.pointerId) sl.end();
      }}
      onLostPointerCapture={sl.end}
      onDoubleClick={() => {
        if (!readOnly) onReset?.();
      }}
      onKeyDown={sl.onKeyDown}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <g transform="rotate(135 12 12)">
          <circle className={s.knobTrack} cx="12" cy="12" r="9" pathLength="100" strokeDasharray="75 100" />
          <circle
            className={s.knobArc}
            cx="12"
            cy="12"
            r="9"
            pathLength="100"
            strokeDasharray={`${(SWEEP * 100 * pos).toFixed(2)} 100`}
          />
          {ghost !== undefined && (
            <line
              className={s.knobGhost}
              x1="18.5"
              y1="12"
              x2="22.5"
              y2="12"
              transform={`rotate(${ghost * 270} 12 12)`}
            />
          )}
          <line
            className={s.knobHand}
            x1="12"
            y1="12"
            x2="19"
            y2="12"
            transform={`rotate(${pos * 270} 12 12)`}
          />
        </g>
      </svg>
    </div>
  );
});

export interface ValueFieldProps extends Wear {
  value: number;
  format: (value: number) => string;
  parse: (text: string) => number | null;
  /** A value typed, dragged or nudged. */
  onCommit: (value: number) => void;
  label: string;
  /** With a scale the field is also dragged up and down and nudged by the arrows. */
  scale?: Scale;
  onReset?: () => void;
  readOnly?: boolean;
  /** Draws its place in the range under the figure: for a value with no fader beside it. */
  bar?: boolean;
  /** A drag is held under the hand and written once, when it ends (for a value each write of which is a step). */
  lazy?: boolean;
  info?: string;
}

/** Pixels of drag across a value field's whole range, and how far the pointer moves before a press is a drag. */
const FIELD_TRAVEL = 300;
const DRAG_SLOP = 3;

/**
 * A value to type: shows the formatted value, takes a number in its unit on Enter or blur, Escape puts it back. With
 * a scale it is a control of its own: dragged up and down (shift: fine), nudged by the up and down arrows, reset by
 * a double click.
 */
export const ValueField = memo(function ValueField({
  value,
  format,
  parse,
  onCommit,
  label,
  scale,
  onReset,
  readOnly = false,
  bar = false,
  lazy = false,
  info,
  ...wear
}: ValueFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const draftRef = useRef<string | null>(null);
  const press = useRef<{ pointer: number; y: number; pos: number; fine: boolean; dragging: boolean } | null>(
    null,
  );
  const heldRef = useRef<number | null>(null);
  const shown = held ?? value;
  const put = (text: string | null) => {
    draftRef.current = text;
    setDraft(text);
  };
  const hold = (v: number | null) => {
    heldRef.current = v;
    setHeld(v);
  };
  const commit = () => {
    const text = draftRef.current;
    put(null);
    if (text === null || text === format(value)) return;
    const v = parse(text);
    if (v !== null && !Number.isNaN(v)) onCommit(scale ? Math.min(scale.max, Math.max(scale.min, v)) : v);
  };
  const send = (v: number) => {
    if (v !== shown && !Number.isNaN(v)) onCommit(v);
  };
  return (
    <input
      className={s.value}
      type="text"
      inputMode="decimal"
      spellCheck={false}
      autoComplete="off"
      aria-label={label}
      readOnly={readOnly}
      data-drag={scale && !readOnly ? "" : undefined}
      data-bar={bar || undefined}
      {...wearOf(wear)}
      {...tip(info)}
      style={bar && scale ? { "--dp-pos": scale.toPos(shown) } : undefined}
      value={draft ?? format(shown)}
      onFocus={(e) => {
        put(format(value));
        e.currentTarget.select();
      }}
      onChange={(e) => put(e.target.value)}
      onBlur={commit}
      onPointerDown={(e) => {
        if (!scale || readOnly || e.button !== 0) return;
        // While it is being typed into, a drag selects its text as in any field.
        if (e.currentTarget.ownerDocument.activeElement === e.currentTarget) return;
        // Held from the press: a quick drag leaves so small a field before its first move arrives.
        e.currentTarget.setPointerCapture?.(e.pointerId);
        press.current = {
          pointer: e.pointerId,
          y: e.clientY,
          pos: scale.toPos(value),
          fine: e.shiftKey,
          dragging: false,
        };
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p || !scale || p.pointer !== e.pointerId) return;
        if (!p.dragging) {
          if (Math.abs(e.clientY - p.y) < DRAG_SLOP) return;
          p.dragging = true;
          put(null);
          e.currentTarget.blur();
        }
        const rate = p.fine ? 0.1 : 1;
        let pos = p.pos + ((p.y - e.clientY) / FIELD_TRAVEL) * rate;
        if (e.shiftKey !== p.fine) {
          p.pos = clamp01(pos);
          p.y = e.clientY;
          p.fine = e.shiftKey;
          pos = p.pos;
        }
        const v = scale.fromPos(clamp01(pos));
        hold(v);
        if (!lazy) send(v);
        e.preventDefault();
      }}
      onPointerUp={(e) => {
        const p = press.current;
        if (p?.pointer !== e.pointerId) return;
        press.current = null;
        if (p.dragging && lazy && heldRef.current !== null && heldRef.current !== value)
          onCommit(heldRef.current);
        hold(null);
      }}
      onLostPointerCapture={() => {
        press.current = null;
        hold(null);
      }}
      onDoubleClick={(e) => {
        if (!onReset || readOnly) return;
        e.preventDefault();
        put(null);
        e.currentTarget.blur();
        onReset();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          put(null);
          e.currentTarget.blur();
        } else if (scale && !readOnly && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
          e.preventDefault();
          const size: Nudge = e.shiftKey ? "coarse" : e.altKey || e.ctrlKey || e.metaKey ? "fine" : "normal";
          const next = scale.nudge(value, e.key === "ArrowUp" ? 1 : -1, size);
          put(format(next));
          draftRef.current = null;
          send(next);
        }
      }}
    />
  );
});

/** Mute or solo: a real toggle button, its state in `aria-pressed`. */
export function Toggle({
  kind,
  on,
  label,
  onPress,
  title,
}: {
  kind: "mute" | "solo";
  on: boolean;
  label: string;
  onPress: (e: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={s.toggle}
      data-kind={kind}
      aria-pressed={on}
      aria-label={label}
      {...tip(title ?? label)}
      onClick={onPress}
    >
      {kind === "mute" ? "M" : "S"}
    </button>
  );
}

/** A choice of a few, as real radios drawn as one segmented strip. */
export function Segmented({
  label,
  options,
  value,
  onChange,
  disabled = false,
  wear,
}: {
  label: string;
  options: readonly { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  wear?: Wear;
}) {
  const name = useId();
  return (
    <div className={s.segmented} role="radiogroup" aria-label={label} {...(wear ? wearOf(wear) : {})}>
      {options.map((o) => (
        <label key={o.value} className={s.segment} {...tip(o.hint)}>
          <input
            className={s.radio}
            type="radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            disabled={disabled}
            onChange={() => onChange(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

export interface PickOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * A choice from a list, over a native select (its list is the platform's own: it opens outside any scrolling pane
 * and answers the keyboard). `face` is what the closed control shows when that is not the chosen option's own label.
 */
export function Picker({
  label,
  value,
  options,
  onChange,
  face,
  look = "field",
  disabled = false,
  info,
  tone,
}: {
  label: string;
  value: string;
  options: readonly PickOption[];
  onChange: (value: string) => void;
  face?: ReactNode;
  /** `field`: a boxed value; `quiet`: text until hovered; `button`: an action that opens a list. */
  look?: "field" | "quiet" | "button";
  disabled?: boolean;
  info?: string;
  tone?: Tone | "live";
}) {
  const chosen = options.find((o) => o.value === value);
  return (
    <span
      className={s.pick}
      data-look={look}
      data-disabled={disabled || undefined}
      data-tone={tone}
      {...tip(info)}
    >
      <span className={s.pickFace} aria-hidden="true">
        {face ?? chosen?.label ?? value}
      </span>
      {look !== "button" && <Chevron />}
      <select
        className={s.pickNative}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * The mark beside a control that says the layer being edited wrote its value: pressed, it takes the write away. A
 * layer that says the value in code alone wears a ring that cannot be pressed; one that says nothing wears none.
 */
export function Pip({
  state,
  label,
  onPress,
  info,
}: {
  state: "written" | "says" | "none";
  label: string;
  onPress: () => void;
  info?: string;
}) {
  return (
    <button
      type="button"
      className={s.pip}
      data-state={state}
      aria-label={label}
      disabled={state !== "written"}
      {...tip(info ?? label)}
      onClick={onPress}
    />
  );
}

/** A small square button holding an icon. */
export function IconButton({
  label,
  onPress,
  children,
  disabled,
  pressed,
  tone,
  info,
}: {
  label: string;
  onPress: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  tone?: "bad" | "on";
  info?: string;
}) {
  return (
    <button
      type="button"
      className={s.icon}
      aria-label={label}
      aria-pressed={pressed}
      data-tone={tone}
      disabled={disabled}
      {...tip(info ?? label)}
      onClick={onPress}
    >
      {children}
    </button>
  );
}

/**
 * The bar between two panes: dragged, or moved by the arrows while it has the focus. `value` is the size in pixels of
 * the pane it sizes; `grow` says which way the pointer moves to make that pane larger.
 */
export function Splitter({
  label,
  orientation,
  value,
  min,
  max,
  grow,
  onChange,
}: {
  label: string;
  /** `horizontal`: a bar across, dragged up and down. */
  orientation: "horizontal" | "vertical";
  value: number;
  min: number;
  max: number;
  grow: 1 | -1;
  onChange: (value: number) => void;
}) {
  const from = useRef<{ pointer: number; coord: number; value: number } | null>(null);
  const across = orientation === "horizontal";
  const set = (v: number) => onChange(Math.round(Math.min(max, Math.max(min, v))));
  return (
    // biome-ignore lint/a11y/useSemanticElements: a separator that is dragged is not an <hr>
    <div
      role="separator"
      tabIndex={0}
      className={s.splitter}
      data-orient={across ? "h" : "v"}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      {...tip(`${label}: drag, or use the arrow keys`)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        e.preventDefault();
        from.current = { pointer: e.pointerId, coord: across ? e.clientY : e.clientX, value };
      }}
      onPointerMove={(e) => {
        const f = from.current;
        if (!f || f.pointer !== e.pointerId) return;
        set(f.value + ((across ? e.clientY : e.clientX) - f.coord) * grow);
      }}
      onPointerUp={() => {
        from.current = null;
      }}
      onLostPointerCapture={() => {
        from.current = null;
      }}
      onKeyDown={(e) => {
        const more = across ? (grow > 0 ? "ArrowDown" : "ArrowUp") : grow > 0 ? "ArrowRight" : "ArrowLeft";
        const less = across ? (grow > 0 ? "ArrowUp" : "ArrowDown") : grow > 0 ? "ArrowLeft" : "ArrowRight";
        if (e.key !== more && e.key !== less) return;
        e.preventDefault();
        set(value + (e.key === more ? 1 : -1) * (e.shiftKey ? 64 : 16));
      }}
    />
  );
}

// ---- Icons: one stroke, one weight -----------------------------------------------------------------------------

const Svg = ({ children, size = 12 }: { children: ReactNode; size?: number }) => (
  <svg
    viewBox="0 0 12 12"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const Chevron = () => (
  <svg className={s.chev} viewBox="0 0 8 8" width="7" height="7" aria-hidden="true">
    <path d="M1.2 2.6 4 5.4l2.8-2.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);
export const PlayIcon = () => (
  <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
    <path d="M2.5 1.5v7l6-3.5z" fill="currentColor" />
  </svg>
);
export const UndoIcon = () => (
  <Svg>
    <path d="M4.2 2 1.8 4.4l2.4 2.4" />
    <path d="M2 4.4h5a3 3 0 0 1 0 6H5" />
  </Svg>
);
export const RedoIcon = () => (
  <Svg>
    <path d="M7.8 2l2.4 2.4-2.4 2.4" />
    <path d="M10 4.4H5a3 3 0 0 0 0 6h2" />
  </Svg>
);
export const CloseIcon = () => (
  <Svg size={10}>
    <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
  </Svg>
);
export const PlusIcon = () => (
  <Svg size={10}>
    <path d="M6 2v8M2 6h8" />
  </Svg>
);
export const PowerIcon = () => (
  <Svg>
    <path d="M6 1.5v4" />
    <path d="M3.4 3.4a3.8 3.8 0 1 0 5.2 0" />
  </Svg>
);
export const LeftIcon = () => (
  <Svg size={10}>
    <path d="M7.5 2 3.5 6l4 4" />
  </Svg>
);
export const RightIcon = () => (
  <Svg size={10}>
    <path d="M4.5 2l4 4-4 4" />
  </Svg>
);
export const OutIcon = () => (
  <Svg size={10}>
    <path d="M1.5 6h8M6.5 3l3 3-3 3" />
  </Svg>
);
export const Disclosure = ({ open }: { open: boolean }) => (
  <svg className={s.disclosure} data-open={open} viewBox="0 0 8 8" width="8" height="8" aria-hidden="true">
    <path d="M2.4 1.2 5.4 4l-3 2.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);
