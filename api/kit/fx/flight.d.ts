import { type ReactNode } from "react";
/**
 * The currency flight: a claim sends a handful of glyphs from the thing pressed into its currency's pill, which
 * bumps as they land. `FlightHost` (mounted once per page) owns the layer; `useFlight()` returns `fly`. Headless:
 * the layer and each glyph carry only what the flight needs to work (placement, the pointer, the animation); the
 * glyph's size and ink are the game's class, and the pill's bump is the game's CSS on `[data-pill][data-bump]`.
 */
/** The flight's numbers, ms and px. Tuned on `#fx`; the README's tuning record says why. */
export declare const FLIGHT: {
    readonly count: 6;
    readonly max: 12;
    /** Between one glyph's landing and the next. */
    readonly stagger: 40;
    /** The whole stagger never spreads wider than this, so twelve glyphs do not queue for half a second. */
    readonly staggerSpan: 280;
    /** Out of the source to each glyph's scatter point, on the spring. */
    readonly burst: 160;
    /** From the scatter point into the pill, accelerating. */
    readonly travel: 320;
    /** How long the pill holds `data-bump`. */
    readonly bump: 160;
    readonly scatterMin: 28;
    readonly scatterMax: 52;
    /** How far each path bows off the straight line, as a share of its length. */
    readonly bow: 0.28;
};
/** A point in CSS pixels. */
export interface Point {
    x: number;
    y: number;
}
/** One glyph's path as keyframes: positions, their times (0..1), the wait at the scatter point and the life, ms. */
export interface GlyphPath {
    x: number[];
    y: number[];
    times: number[];
    hold: number;
    duration: number;
}
/** The gap between landings for a flight of `count`: `FLIGHT.stagger`, narrowed so the spread stays capped. */
export declare function staggerOf(count: number): number;
/**
 * Glyph `index` of `count`: it springs out of `from` to its own scatter point (golden-angle spread, so no two
 * overlap), waits its turn, then falls along its own quadratic into `to`, bowed to alternate sides. Pure.
 */
export declare function flightPath(from: Point, to: Point, index: number, count: number, seed?: number): GlyphPath;
/** Options for a currency flight: the currency whose pill it lands on, what was pressed, a count and a glyph. */
export interface FlyOptions {
    /** A currency id: the target is `[data-pill="<currency>"]` in the page root. */
    currency: string;
    /** What was pressed, or its box. */
    from: Element | DOMRect;
    /** Glyphs to fly: default 6, at most 12. */
    count?: number;
    /** The glyph for an event currency; otherwise the host's `glyphOf` draws one, and with none the pill only bumps. */
    glyph?: ReactNode;
}
/** Returns `fly`: measure `from` and the currency's pill, fly the glyphs, bump the pill as they land. */
export declare function useFlight(): (opts: FlyOptions) => void;
/** The path as Web Animations keyframes: translate, scale and opacity at every sampled point. Pure. */
export declare function flightKeyframes(path: GlyphPath): Keyframe[];
/** Props of `FlightHost`: the glyph a currency flies as, and the classes of the layer and of each glyph. */
export interface FlightHostProps {
    /** The glyph a currency flies as when `fly` names none, or null to only bump its pill. Read at each flight. */
    glyphOf: (currency: string) => ReactNode;
    /** The layer's class: its stacking order over the page's sheets. */
    className?: string;
    /** Each glyph's class: its size (it is centred on its point) and ink. */
    glyphClassName?: string;
}
/**
 * The flight's layer, portalled to the nearest page root (`[data-theme]`) and covering it. Mount once per page.
 * Glyphs are removed by timers at their landing, not by the animation's end, so a hidden tab still cleans up.
 */
export declare function FlightHost({ glyphOf, className, glyphClassName }: FlightHostProps): import("react").JSX.Element;
