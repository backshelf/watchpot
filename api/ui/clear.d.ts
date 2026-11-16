import { type RefObject } from "react";
/** The edges of a box in client pixels, as `getBoundingClientRect` gives them. */
export interface Edges {
    left: number;
    top: number;
    right: number;
    bottom: number;
}
/** Options of `coveredBy`: the slack round each mark and the window the solids are seen through. */
export interface CoverOptions {
    /** A solid this close to a mark counts as over it, px. Default 4. */
    margin?: number;
    /** Solids are clipped to this box (the scrolling stage): a part scrolled out of it covers nothing. */
    view?: Edges;
}
/**
 * For each mark, whether any solid sits over part of it (within `margin`, clipped to `view`). A mark with no size
 * (hidden, not laid out) is never covered. Pure.
 */
export declare function coveredBy(marks: readonly Edges[], solids: readonly Edges[], options?: CoverOptions): boolean[];
/** Options of `useClearUnder`. */
export interface ClearUnderOptions extends Omit<CoverOptions, "view"> {
    /** The decorative marks inside the first root. Default `[data-clear]`. */
    marks?: string;
    /** The solids inside the second root. Default `[data-solid]`. */
    solids?: string;
    /** Set on a covered mark (your CSS fades it). Default `data-covered`. */
    attr?: string;
    /** Also measure this often, ms, for solids that move without a resize. Default 1000; 0 for never. */
    everyMs?: number;
    /** Measure again from scratch when this changes (the open page: new panels). */
    key?: unknown;
}
/**
 * Hides decoration under solid panels: every `marks` element inside `decor` that a `solids` element inside `over`
 * sits over gets `attr`, and loses it when the panels move off. Measured once at mount, on a scroll of `over`, on a
 * resize of `over` or its first child, and every `everyMs`, at most once a frame.
 */
export declare function useClearUnder(decor: RefObject<HTMLElement | null>, over: RefObject<HTMLElement | null>, options?: ClearUnderOptions): void;
