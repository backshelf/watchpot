// Values on screen: a progress bar, a meter, a countdown and a slider. Each exposes its share as `--value` (0..1) for
// the game's CSS and keeps the exact figures in ARIA.
import {
  type ComponentPropsWithRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { fmtTimer } from "../core/fmt";
import { useControllable, useLatest } from "./hooks";
import { type AsChild, chain, mergeProps, renderPart } from "./slot";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The share a bar draws: `value` between `min` and `max` as 0..1, snapped to whole steps when `steps` is set (the
 * nearest step, so a bar one step short of full never reads as full until it is). Pure.
 */
export function drawnShare(value: number, min: number, max: number, steps?: number): number {
  const span = max - min;
  const ratio = span > 0 && Number.isFinite(value) ? clamp((value - min) / span, 0, 1) : 0;
  if (!steps || steps < 1) return ratio;
  const lit = Math.round(ratio * steps);
  // A bar that is not yet full keeps its last step dark.
  return (ratio < 1 ? Math.min(lit, steps - 1) : lit) / steps;
}

interface BarProps extends Omit<ComponentPropsWithRef<"div">, "children">, AsChild {
  /** The figure; `null` or absent is indeterminate (progress only). */
  value?: number | null;
  min?: number;
  max?: number;
  /** What assistive tech hears for the value, in the game's words ("4,120 of 6,000 gold"). */
  valueText?: string;
  /** Cut the drawn share into this many steps: one `[data-step]` child each, the lit ones `data-lit`. */
  steps?: number;
  /** A step's own props, by its index and whether it is lit: a class for a zone, a style, a `data-` mark. */
  stepProps?: (index: number, lit: boolean) => ComponentPropsWithRef<"span">;
  /** Drawn inside, after the steps (a label, a fill element the game styles with `--value`). */
  children?: ReactNode;
}

function bar(role: "progressbar" | "meter", props: BarProps) {
  const { value, min = 0, max = 1, valueText, steps, stepProps, asChild, children, style, ...rest } = props;
  const known = value !== null && value !== undefined && Number.isFinite(value);
  const share = known ? drawnShare(value, min, max, steps) : 0;
  const count = steps && steps >= 1 ? Math.floor(steps) : 0;
  const lit = Math.round(share * count);
  const state = !known ? "indeterminate" : share >= 1 ? "complete" : "partial";
  const vars: CSSProperties = { "--value": share, ...(count ? { "--steps": count } : {}) };
  return renderPart(
    "div",
    asChild,
    mergeProps(
      {
        role,
        "aria-valuemin": min,
        "aria-valuemax": max,
        "aria-valuenow": known ? clamp(value, min, max) : undefined,
        "aria-valuetext": known ? valueText : undefined,
        "aria-busy": role === "progressbar" && !known ? true : undefined,
        "data-state": state,
        style: { ...vars, ...style },
        children: (
          <>
            {Array.from({ length: count }, (_, i) => (
              <span key={i} {...stepProps?.(i, i < lit)} data-step={i} data-lit={i < lit ? "" : undefined} />
            ))}
            {children}
          </>
        ),
      },
      rest,
    ),
  );
}

/** Props of `Progress`: the value, its range and words, optional steps, and a div's. */
export type ProgressProps = BarProps;

/**
 * Progress toward a goal (`role="progressbar"`): exact ARIA values, the drawn share as `--value`, `data-state`
 * ("partial" | "complete" | "indeterminate"). Name it with `aria-label` or `aria-labelledby`.
 */
export function Progress(props: ProgressProps) {
  return bar("progressbar", props);
}

/** Props of `Meter`: the value, its range and words, optional steps, and a div's. */
export interface MeterProps extends BarProps {
  value: number;
}

/** A measurement within a range (`role="meter"`): a gauge, a health bar, a heat level. Same data as `Progress`. */
export function Meter(props: MeterProps) {
  return bar("meter", props);
}

// ---------------------------------------------------------------------------------------------------------------
// Countdown

const DAY_SECONDS = 86_400;

/**
 * The default countdown text: "hh:mm:ss" inside a day, "6d 20h" from a day out, never negative. A game passes its
 * own `format` for other words.
 */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < DAY_SECONDS) return fmtTimer(s * 1000);
  return `${Math.floor(s / DAY_SECONDS)}d ${Math.floor((s % DAY_SECONDS) / 3600)}h`;
}

/** What `useCountdown` reads off the seconds left: whole seconds, ended, warn, and the `dateTime` duration. */
export interface CountdownState {
  left: number;
  ended: boolean;
  warn: boolean;
  dateTime: string;
}

/**
 * A countdown's facts from the caller's `secondsLeft` (it owns no clock), calling `onEnd` once each time the count
 * crosses to zero (not on a mount already at zero).
 */
export function useCountdown(secondsLeft: number, options: { warnUnder?: number; onEnd?: () => void } = {}) {
  const left = Math.max(0, Math.floor(Number.isFinite(secondsLeft) ? secondsLeft : 0));
  const onEnd = useLatest(options.onEnd);
  const previous = useRef(left);
  useEffect(() => {
    if (previous.current > 0 && left === 0) onEnd.current?.();
    previous.current = left;
  }, [left, onEnd]);
  return {
    left,
    ended: left === 0,
    warn: options.warnUnder !== undefined && left > 0 && left < options.warnUnder,
    dateTime: `PT${left}S`,
  } satisfies CountdownState;
}

/** Props of `Countdown`: the seconds left, the warn threshold, the end callback, the text and a time element's. */
export interface CountdownProps
  extends Omit<ComponentPropsWithRef<"time">, "children" | "dateTime">,
    AsChild {
  /** Seconds left; the caller ticks it. Negative reads as zero. */
  secondsLeft: number;
  /** `data-warn` while above zero and under this many seconds. */
  warnUnder?: number;
  /** Called once on the edge to zero. */
  onEnd?: () => void;
  /** The text for whole seconds left; `formatCountdown` by default. */
  format?: (secondsLeft: number) => ReactNode;
}

/**
 * A countdown as a `<time dateTime>`: the caller passes `secondsLeft`, the text comes from `format`, `onEnd` fires
 * once at zero. `data-warn` and `data-ended` style it; words around it ("Ends in") are the game's.
 */
export function Countdown({
  secondsLeft,
  warnUnder,
  onEnd,
  format = formatCountdown,
  asChild,
  ...props
}: CountdownProps) {
  const c = useCountdown(secondsLeft, { warnUnder, onEnd });
  return renderPart(
    "time",
    asChild,
    mergeProps(
      {
        dateTime: c.dateTime,
        "data-warn": c.warn ? "" : undefined,
        "data-ended": c.ended ? "" : undefined,
        children: format(c.left),
      },
      props,
    ),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Slider

/** Props of `Slider`: the value, its range and steps, words for the value, and a range input's. */
export interface SliderProps
  extends Omit<
    ComponentPropsWithRef<"input">,
    "type" | "value" | "defaultValue" | "onChange" | "min" | "max" | "step"
  > {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** PageUp and PageDown move this far. Default ten steps. */
  pageStep?: number;
  /** What assistive tech hears for a value ("70 percent"). */
  valueText?: (value: number) => string;
}

/**
 * A native range input: the browser's keyboard and ARIA, plus PageUp/PageDown by `pageStep` and Home/End to the
 * ends everywhere, `--value` (0..1) for the game's track fill and `aria-valuetext` from `valueText`.
 */
export function Slider({
  value,
  defaultValue,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  pageStep = step * 10,
  valueText,
  style,
  onKeyDown,
  ...props
}: SliderProps) {
  const [current, setCurrent] = useControllable(value, defaultValue ?? min, onValueChange);
  const snap = (n: number) => clamp(Math.round((n - min) / step) * step + min, min, max);
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    const to =
      event.key === "PageUp"
        ? current + pageStep
        : event.key === "PageDown"
          ? current - pageStep
          : event.key === "Home"
            ? min
            : event.key === "End"
              ? max
              : null;
    if (to === null) return;
    event.preventDefault();
    setCurrent(snap(to));
  };
  return (
    <input
      {...props}
      type="range"
      min={min}
      max={max}
      step={step}
      value={current}
      aria-valuetext={valueText?.(current)}
      style={{ "--value": drawnShare(current, min, max), ...style }}
      onChange={(event) => setCurrent(Number(event.currentTarget.value))}
      onKeyDown={chain(onKeyDown, keys)}
    />
  );
}
