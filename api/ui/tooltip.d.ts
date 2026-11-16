import { type ComponentPropsWithRef, type ReactNode, type RefObject } from "react";
import { type PlaceOptions } from "./position";
import { type AsChild, type PartRef } from "./slot";
/** Options of `useTooltip`: open state, timing, touch behaviour and placement. */
export interface TooltipOptions extends PlaceOptions {
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Hover delay before it opens, ms. Focus opens at once. Default 500. */
    delay?: number;
    /** Delay before it closes after the pointer leaves, so the pointer can cross into it. Default 150. */
    closeDelay?: number;
    /** A touch opens it by press-and-hold (default) or toggles it with a tap. */
    touch?: "hold" | "tap";
    /** How long a touch holds before it opens, ms. Default 500. */
    holdDelay?: number;
    disabled?: boolean;
}
/** What `useTooltip` hands back: the state and the trigger's and content's props. */
export interface TooltipApi {
    open: boolean;
    setOpen: (open: boolean) => void;
    triggerProps: Record<string, unknown> & {
        ref: PartRef;
    };
    contentProps: Record<string, unknown> & {
        ref: PartRef;
    };
}
/**
 * A tooltip's behaviour on the game's own markup. The content stays mounted (`hidden` while closed), so the
 * trigger's `aria-describedby` always reaches its words; hover opens after `delay`, focus at once, Escape closes,
 * the pointer may cross into it, and a touch holds (or taps) to open.
 */
export declare function useTooltip(options?: TooltipOptions): TooltipApi;
/** Props of `Tooltip.Root`: the `useTooltip` options and the parts. */
export interface TooltipRootProps extends TooltipOptions {
    children?: ReactNode;
}
declare function TooltipRoot({ children, ...options }: TooltipRootProps): import("react").JSX.Element;
/** Props of `Tooltip.Trigger`: a button's (or the game's own element with `asChild`). */
export type TooltipTriggerProps = ComponentPropsWithRef<"button"> & AsChild;
declare function TooltipTrigger({ asChild, ref, ...props }: TooltipTriggerProps): import("react").JSX.Element;
/** Props of `Tooltip.Content`: a div's. Placed with a fixed position; wrap it in a `Portal` to escape clipping. */
export type TooltipContentProps = ComponentPropsWithRef<"div"> & AsChild;
declare function TooltipContent({ asChild, ref, style, ...props }: TooltipContentProps): import("react").JSX.Element;
/**
 * A tooltip (WAI-ARIA tooltip): `Trigger` is described by `Content`. `data-state` ("open" | "closed"), `data-side`
 * and `data-align` style it; it never holds anything interactive (that is a `Popover`).
 */
export declare const Tooltip: {
    Root: typeof TooltipRoot;
    Trigger: typeof TooltipTrigger;
    Content: typeof TooltipContent;
};
/** Options of `usePopover`: open state and placement. */
export interface PopoverOptions extends PlaceOptions {
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Where focus lands on open: this element, else the first control, else the panel. */
    initialFocus?: RefObject<HTMLElement | null> | false;
}
/** What `usePopover` hands back: the state, a close that can return focus, and the parts' props. */
export interface PopoverApi {
    open: boolean;
    setOpen: (open: boolean) => void;
    /** Closes; with `returnFocus`, focus goes back to the trigger (Escape and the Close part do this). */
    close: (returnFocus?: boolean) => void;
    triggerProps: Record<string, unknown> & {
        ref: PartRef;
    };
    contentProps: Record<string, unknown> & {
        ref: PartRef;
    };
}
/**
 * A popover's behaviour: the trigger toggles it; it opens as a non-modal dialog that takes focus; Escape closes it
 * back to the trigger; a press outside or focus leaving closes it where the player went.
 */
export declare function usePopover(options?: PopoverOptions): PopoverApi;
/** Props of `Popover.Root`: the `usePopover` options and the parts. */
export interface PopoverRootProps extends PopoverOptions {
    children?: ReactNode;
}
declare function PopoverRoot({ children, ...options }: PopoverRootProps): import("react").JSX.Element;
/** Props of `Popover.Trigger`: a button's. */
export type PopoverTriggerProps = ComponentPropsWithRef<"button"> & AsChild;
declare function PopoverTrigger({ asChild, ref, ...props }: PopoverTriggerProps): import("react").JSX.Element;
/** Props of `Popover.Content`: a div's (name it with `aria-label`). Drawn only while open. */
export type PopoverContentProps = ComponentPropsWithRef<"div"> & AsChild;
declare function PopoverContent({ asChild, ref, style, ...props }: PopoverContentProps): import("react").JSX.Element | null;
/** Props of `Popover.Close`: a button's. */
export type PopoverCloseProps = ComponentPropsWithRef<"button"> & AsChild;
declare function PopoverClose({ asChild, ...props }: PopoverCloseProps): import("react").JSX.Element;
/**
 * A press-to-open panel (a non-modal dialog): `Trigger` toggles `Content`, which takes focus; `Close` and Escape
 * return focus to the trigger. `data-state`, `data-side` and `data-align` style it.
 */
export declare const Popover: {
    Root: typeof PopoverRoot;
    Trigger: typeof PopoverTrigger;
    Content: typeof PopoverContent;
    Close: typeof PopoverClose;
};
export {};
