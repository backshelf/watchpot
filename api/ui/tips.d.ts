import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { type PlaceOptions } from "./position";
/** What a touch does on a tipped element: a tap toggles its tip, or a held press shows it (and is not a press). */
export type TipTouch = "tap" | "hold";
/** One part of an open tip: the key an element carried, and what it says. */
export interface TipPart {
    key: string;
    node: ReactNode;
}
/** Props of `HoverTips`: what a key says, the attributes it listens for, its timing, and a div's own. */
export interface HoverTipsProps extends Omit<ComponentPropsWithoutRef<"div">, "content" | "children"> {
    /** What a key says, or null when it says nothing (no tip opens on it). Called only when a tip is asked for. */
    content: (key: string) => ReactNode;
    /** The attribute a tipped element carries, its value the key. `<attr>-side` and `<attr>-touch` tune one element. */
    attr?: string;
    /**
     * An attribute that groups tipped things (a row): keyboard focus on any control inside shows all of their tips,
     * after `scopeDelay`, so words that are not tab stops can still be read without a pointer.
     */
    scopeAttr?: string;
    /** Hover delay before a tip opens, ms. Moving from one tip to the next is quicker. Default 450. */
    delay?: number;
    /** How long after the pointer leaves it closes, ms. Default 120. */
    closeDelay?: number;
    /** How long focus rests on a control before its group's tips open, ms. Its own tip opens at once. Default 700. */
    scopeDelay?: number;
    /** How long a touch is held before a `hold` tip opens, ms. Default 500. */
    holdDelay?: number;
    /** The most tips one group shows together. Default 5. */
    scopeMost?: number;
    /** Nothing opens. */
    disabled?: boolean;
    /** Where the box sits by its anchor (`<attr>-side` on an element wins for that element). */
    place?: PlaceOptions;
    /** Draws the open tip from its parts (one for a hover, several for a group). Default: one after another. */
    children?: (parts: readonly TipPart[]) => ReactNode;
}
/**
 * A tip whose content is not a key but a node of the caller's own: the key to put in the tip attribute. The node
 * is read when the tip opens; one that must move while it is open subscribes to what it shows itself. Any
 * `HoverTips` on the page answers it, whatever its `content` says.
 */
export declare function useTipSlot(content: ReactNode): string;
/**
 * The page's tips. Mounted once. Hover opens after `delay`, keyboard focus at once (a group's after `scopeDelay`),
 * Escape or leaving closes, a press on the thing itself closes. On a touch, a tap on a tipped word toggles its tip
 * (and is not a press on the button the word sits in), and a button with a tip shows it on a held press (which then
 * is not a press either). The box is `role="tooltip"` and describes its anchor while open; `data-state`,
 * `data-side`, `data-align` and `data-by` ("hover" | "focus" | "touch") style it. A box that takes the pointer
 * stays open while the pointer is on it; one the game gives `pointer-events: none` lets the page under it be read.
 */
export declare function HoverTips({ content, attr, scopeAttr, delay, closeDelay, scopeDelay, holdDelay, scopeMost, disabled, place, children, style, ...rest }: HoverTipsProps): import("react").JSX.Element | null;
