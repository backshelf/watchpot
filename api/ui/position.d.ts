import { type CSSProperties, type RefObject } from "react";
/** The side of the anchor a floating box sits on. */
export type Side = "top" | "right" | "bottom" | "left";
/** Where along that side: its start, centre or end. */
export type Align = "start" | "center" | "end";
/** A box in viewport pixels. */
export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** Options of `place`: the side and alignment wanted, the gap to the anchor and the margin kept to the viewport. */
export interface PlaceOptions {
    side?: Side;
    align?: Align;
    /** Gap between anchor and box. Default 8. */
    offset?: number;
    /** Margin kept from the viewport's edges. Default 8. */
    padding?: number;
    /** Move to the opposite side when that overflows less. Default true. */
    flip?: boolean;
}
/** Where `place` put the box: its top-left corner and the side and alignment it ended on. */
export interface Placement {
    x: number;
    y: number;
    side: Side;
    align: Align;
}
/**
 * Where to put a box of `floating` size beside `anchor` inside `viewport`: on `side` (flipped to the opposite side
 * when that spills less), aligned, then shifted along the edge to stay `padding` inside the viewport. Pure.
 */
export declare function place(anchor: Box, floating: {
    width: number;
    height: number;
}, viewport: {
    width: number;
    height: number;
}, options?: PlaceOptions): Placement;
/** What `usePlacement` hands back: the fixed position for the floating element's style and where it landed. */
export interface PlacementState {
    style: CSSProperties;
    side: Side;
    align: Align;
}
/**
 * Keeps `floating` placed beside the anchor while `open`: measured before paint, again on resize and on any scroll.
 * `anchor` is read at measure time; `deps` re-measure when the anchor changes. The returned style is the one inline
 * style a floating part carries: `position: fixed` and its corner, which is behaviour, not look.
 */
export declare function usePlacement(anchor: () => Element | null, floating: RefObject<HTMLElement | null>, open: boolean, options?: PlaceOptions, deps?: readonly unknown[]): PlacementState;
