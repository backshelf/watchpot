import { type CSSProperties } from "react";
import { type Decimal, type DecimalSource } from "../../core/decimal";
/**
 * A figure counted up like a slot machine's win: it rolls from one Decimal to another over a set time, slowing at the
 * end, then sits. It never counts through the value: each frame works out the figure in log space (a figure past
 * 1e300 rolls through its exponent), so a frame costs one format whatever the size, and a run is at most `maxFrames`
 * frames however the clock behaves. The text is written straight to the element: no React render per frame. Under
 * reduced motion it shows the end at once.
 */
/** The ease a count lands on by default: fast, then slow at the end. */
export declare const countEase: (t: number) => number;
/**
 * The figure `t` (0..1) of the way from `a` to `b`: in log space when `b` is at least 1 and the larger passes a
 * thousand (so 1 to 1e300 shows every order of magnitude), else straight. A roll up from under 1 (from nothing) to a
 * large figure goes in log space from 1, through the orders of magnitude; a small one stays straight from `a`. Pure.
 */
export declare function countBetween(a: Decimal, b: Decimal, t: number): Decimal;
/** The most frames a run of `ms` takes: a 240 Hz screen's worth, plus the first. */
export declare const countFrameCap: (ms: number) => number;
/** Options of `countUp`. */
export interface CountUpOptions {
    to: DecimalSource;
    from?: DecimalSource;
    /** How long the roll takes, ms. Default 900. */
    ms?: number;
    /** A wait before it starts, ms. Default 0. */
    delay?: number;
    format: (value: Decimal) => string;
    /** The curve over 0..1. Default `countEase`. */
    ease?: (t: number) => number;
    /** Called once, when it lands (or is finished early); not when cancelled. */
    onLand?: () => void;
    /** Called with each figure written (for a caller that tracks where the roll is). */
    onFigure?: (value: Decimal) => void;
    /** The most frames the run takes; it lands on the last. Default `countFrameCap(delay + ms)`. */
    maxFrames?: number;
    /** Show the end at once. Default `prefersReducedMotion()`. */
    reduced?: boolean;
    /** The frame scheduler. Default `requestAnimationFrame` (and `cancelAnimationFrame`). */
    frame?: (cb: (time: number) => void) => number;
    cancelFrame?: (id: number) => void;
}
/** A run in progress: `cancel` stops it where it is, `finish` writes the end and lands now. */
export interface CountRun {
    cancel(): void;
    finish(): void;
}
/** Counts `node`'s text from `from` to `to`. */
export declare function countUp(node: {
    textContent: string | null;
}, options: CountUpOptions): CountRun;
/** Props of `Count`: the figures, the timing, the formatter, and the span's class and style. */
export interface CountProps {
    to: DecimalSource;
    /** Where it starts. Default: the figure it shows now (0 at first), so a new `to` rolls on from there. */
    from?: DecimalSource;
    /** Default 900. */
    ms?: number;
    delay?: number;
    format: (value: Decimal) => string;
    ease?: (t: number) => number;
    /** Called once when it lands. */
    onLand?: () => void;
    /** Jump to the end now (a press that skips the roll). */
    skip?: boolean;
    className?: string;
    style?: CSSProperties;
}
/**
 * `countUp` as a span: it rolls on mount and again whenever `to` or `from` changes (by value, not identity), stops
 * on unmount, and lands at once under reduced motion or when `skip` turns on. `[data-counting]` is set while it rolls.
 */
export declare function Count({ to, from, ms, delay, format, ease, onLand, skip, className, style, }: CountProps): import("react").JSX.Element;
