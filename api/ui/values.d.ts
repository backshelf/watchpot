import { type ComponentPropsWithRef, type ReactNode } from "react";
import { type AsChild } from "./slot";
/**
 * The share a bar draws: `value` between `min` and `max` as 0..1, snapped to whole steps when `steps` is set (the
 * nearest step, so a bar one step short of full never reads as full until it is). Pure.
 */
export declare function drawnShare(value: number, min: number, max: number, steps?: number): number;
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
/** Props of `Progress`: the value, its range and words, optional steps, and a div's. */
export type ProgressProps = BarProps;
/**
 * Progress toward a goal (`role="progressbar"`): exact ARIA values, the drawn share as `--value`, `data-state`
 * ("partial" | "complete" | "indeterminate"). Name it with `aria-label` or `aria-labelledby`.
 */
export declare function Progress(props: ProgressProps): import("react").JSX.Element;
/** Props of `Meter`: the value, its range and words, optional steps, and a div's. */
export interface MeterProps extends BarProps {
    value: number;
}
/** A measurement within a range (`role="meter"`): a gauge, a health bar, a heat level. Same data as `Progress`. */
export declare function Meter(props: MeterProps): import("react").JSX.Element;
/**
 * The default countdown text: "hh:mm:ss" inside a day, "6d 20h" from a day out, never negative. A game passes its
 * own `format` for other words.
 */
export declare function formatCountdown(totalSeconds: number): string;
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
export declare function useCountdown(secondsLeft: number, options?: {
    warnUnder?: number;
    onEnd?: () => void;
}): {
    left: number;
    ended: boolean;
    warn: boolean;
    dateTime: string;
};
/** Props of `Countdown`: the seconds left, the warn threshold, the end callback, the text and a time element's. */
export interface CountdownProps extends Omit<ComponentPropsWithRef<"time">, "children" | "dateTime">, AsChild {
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
export declare function Countdown({ secondsLeft, warnUnder, onEnd, format, asChild, ...props }: CountdownProps): import("react").JSX.Element;
/** Props of `Slider`: the value, its range and steps, words for the value, and a range input's. */
export interface SliderProps extends Omit<ComponentPropsWithRef<"input">, "type" | "value" | "defaultValue" | "onChange" | "min" | "max" | "step"> {
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
export declare function Slider({ value, defaultValue, onValueChange, min, max, step, pageStep, valueText, style, onKeyDown, ...props }: SliderProps): import("react").JSX.Element;
export {};
