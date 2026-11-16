import { type ComponentPropsWithRef } from "react";
/** The longest text a barcode encodes; the rest is cut. */
export declare const BARCODE_MAX_CHARS = 80;
/** One bar: its left edge and width, in modules. */
export interface BarcodeBar {
    x: number;
    w: number;
}
/**
 * `text` in Code 128 set B: the start symbol, the data, the checksum (the weighted sum mod 103) and the stop
 * pattern, as bars in modules and the symbol's whole width. A character outside printable ASCII encodes as a space;
 * past `BARCODE_MAX_CHARS` the text is cut. The bars scan. Pure.
 */
export declare function code128(text: string): {
    bars: BarcodeBar[];
    width: number;
};
/** Props of `Barcode`: what it says, what a screen reader hears instead, its height in view units, and an svg's. */
export interface BarcodeProps extends Omit<ComponentPropsWithRef<"svg">, "children"> {
    /** What the bars say (printable ASCII). */
    value: string;
    /** What a screen reader hears. Omitted, the bars are decoration (`aria-hidden`): a labelled wrapper speaks for them. */
    label?: string;
    /** The bars' height in modules (the view box). Default 10; the CSS sets the drawn size. */
    barHeight?: number;
    /**
     * A playhead: the module at this index (from 0) gets its own `<rect data-head>` over the bars, a module wide and
     * full height, for the game to style. Omitted or outside the code, nothing is drawn.
     */
    head?: number;
}
/** A real Code 128 barcode of `value`, as wide as its box (`preserveAspectRatio="none"`): one path, `[data-barcode]`. */
export declare function Barcode({ value, label, barHeight, head, ...props }: BarcodeProps): import("react").JSX.Element;
/** A ruler's ticks as one path across a 100-unit view: every `major`th tick long. `ticks` is capped at 200. Pure. */
export declare function tickPath(ticks: number, major: number, height: number): string;
/** Props of `Ruler`: its divisions, where a caret stands, its height in view units, and a span's. */
export interface RulerProps extends ComponentPropsWithRef<"span"> {
    /** Divisions along it, at most 200. Default 40. */
    ticks?: number;
    /** Every how many ticks a long one. Default 5. */
    major?: number;
    /** 0..1: a `[data-caret]` stands there, at `--at`. */
    at?: number;
    /** The view's height; the drawn size is the CSS's. Default 8. */
    tickHeight?: number;
}
/**
 * A tick ruler as wide as its box: the ticks are one stretched path whose stroke keeps its width, and a caret
 * (`<i data-caret>`, placed by `--at`) marks a figure's place. `[data-ruler]`.
 */
export declare function Ruler({ ticks, major, at, tickHeight, style, ...props }: RulerProps): import("react").JSX.Element;
/**
 * A strip of `bars` bars, one per reading (0..1, oldest first, the newest at the right), mirrored about the middle,
 * each `barWidth` wide with `gap` between; missing readings at the left draw as the floor. Capped at 240 bars. Pure.
 */
export declare function levelBarsPath(values: readonly number[], bars: number, height: number, barWidth?: number, gap?: number): {
    d: string;
    width: number;
};
/** Props of `LevelBars`: the readings, how many bars, the view's height, and an svg's. */
export interface LevelBarsProps extends Omit<ComponentPropsWithRef<"svg">, "children" | "values"> {
    /** 0..1 readings, oldest first. */
    values: readonly number[];
    /** Default 48, at most 240. */
    bars?: number;
    /** Default 24. */
    barsHeight?: number;
}
/** A level strip (a meter's history, a waveform): one path, `[data-level-bars]`. */
export declare function LevelBars({ values, bars, barsHeight, ...props }: LevelBarsProps): import("react").JSX.Element;
/** The box and range a series is drawn in. */
export interface SeriesFrame {
    width: number;
    height: number;
    /** The value at the foot. Default the series' least. */
    min?: number;
    /** The value at the top. Default the series' greatest. */
    max?: number;
    /** Space kept above and below, in view units. Default 3. */
    pad?: number;
}
/** Where `value` sits in the frame, top down, clamped inside it. Pure. */
export declare function seriesY(value: number, min: number, max: number, height: number, pad?: number): number;
/** The most points a sparkline draws: a longer series keeps its newest. */
export declare const SERIES_MAX_POINTS = 512;
/**
 * A series as points spread evenly across the frame, oldest at the left (the newest `SERIES_MAX_POINTS`), and the
 * range they were drawn in. Non-finite values are skipped. Pure.
 */
export declare function seriesPoints(values: readonly number[], frame: SeriesFrame): {
    points: [number, number][];
    min: number;
    max: number;
};
/**
 * A band across the chart between two values, named for the game's CSS (`[data-zone="<name>"]`). An end at or past
 * the range's `min` or `max` runs to the frame's edge, through the pad.
 */
export interface SeriesZone {
    name: string;
    from: number;
    to: number;
}
/** A rule across the chart at a value (`[data-rule="<name>"]`): an average, a cost basis, a target. */
export interface SeriesRule {
    name: string;
    at: number;
}
/** Props of `Sparkline`: the series, its frame, its zones and rules, and an svg's. */
export interface SparklineProps extends Omit<ComponentPropsWithRef<"svg">, "children" | "values" | "width" | "height" | "min" | "max">, SeriesFrame {
    values: readonly number[];
    /** What a screen reader hears (the price now, the trend). */
    label: string;
    zones?: readonly SeriesZone[];
    rules?: readonly SeriesRule[];
    /** Fill under the line (`[data-area]`). Default false. */
    area?: boolean;
    /** A dot on the newest point (`[data-dot]`). Default true. */
    dot?: boolean;
    /** Its radius in view units. Default 3. */
    dotRadius?: number;
}
/**
 * A series as a line (`[data-line]`), over named bands (`[data-zone]`: a buy zone and a sell zone) and rules
 * (`[data-rule]`), with a dot on the newest point. Stretched to its box; strokes keep their width. The colours, the
 * fill and the stroke are the game's CSS on those attributes.
 */
export declare function Sparkline({ values, label, width, height, min, max, pad, zones, rules, area, dot, dotRadius, ...props }: SparklineProps): import("react").JSX.Element;
/** A whole number's low bits as 0s and 1s, `width` long (at most 64), highest first. Pure. */
export declare function bitsOf(value: number, width?: number): string;
/** Props of `Checker`: the data track's bits, the cell size, and an svg's. */
export interface CheckerProps extends Omit<ComponentPropsWithRef<"svg">, "children"> {
    /** 0s and 1s (at most 64 read). */
    bits: string;
    /** Default 4. */
    cell?: number;
    /**
     * A playhead: the cell at this index (from 0) gets its own `<rect data-head>` over both tracks, for the game to
     * style. Omitted or outside the cells, nothing is drawn.
     */
    head?: number;
}
/** A clock track of alternating cells over a data track that is `bits`: a figure printed as a machine reads it. */
export declare function Checker({ bits, cell, head, ...props }: CheckerProps): import("react").JSX.Element;
/** Props of `SplitFlap`: the text, the characters that are gaps, and a span's. */
export interface SplitFlapProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
    text: string;
    /** Characters drawn as a gap (`data-gap`), not a flap. Default space and colon. */
    gaps?: string;
    /** The longest text shown; the rest is cut. Default 32. */
    maxChars?: number;
}
/**
 * Text on split flaps: each character its own `[data-flap]` cell, keyed by its place and character, so a cell whose
 * character changes is a new element and the game's flip keyframes run on it alone. `data-prev` holds the character
 * it replaced (for the falling half), `data-gap` marks a separator. A screen reader hears the whole text once,
 * from a visually hidden copy; the cells are hidden from it.
 */
export declare function SplitFlap({ text, gaps, maxChars, ...props }: SplitFlapProps): import("react").JSX.Element;
