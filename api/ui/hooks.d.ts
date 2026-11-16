import { type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
/** A ref that always holds the latest value: handlers read it so effects need not re-run when a callback changes. */
export declare function useLatest<T>(value: T): RefObject<T>;
/**
 * A value the caller may control (`value` given) or leave to the component (`defaultValue`). The setter calls
 * `onChange` on a real change and updates the inner value only when uncontrolled.
 */
export declare function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (next: T) => void): [T, (next: T) => void];
/**
 * The value of `name` on the closest ancestor of `ref`'s element that carries it (the element itself included), or
 * null when none does; read before paint and again whenever that ancestor's attribute changes. For a leaf that
 * follows a value its container already writes on the page (a theme, a mode, a tier) with no prop drilled down to
 * it. The ancestor is found as the hook mounts: one that gains the attribute later is not looked for again.
 */
export declare function useClosestAttribute(ref: RefObject<Element | null>, name: string): string | null;
/**
 * Whether the CSS media `query` matches now, kept current: for the few things CSS cannot switch alone (a surface
 * not mounted at all on a small screen). False where there is no `matchMedia` (a server, a test DOM).
 */
export declare function useMediaQuery(query: string): boolean;
/**
 * Whether something has just arrived: true for `ms` after `shown` turns true on a component that was mounted with
 * it false, and never for what was already there at the mount (a loaded save is not an arrival). The flag is set
 * in a layout effect, so the first frame the thing is painted in is already its arriving one: an entrance played
 * off the flag (the game's keyframes on its own `data-*`) starts from its first keyframe, with no flash of the
 * finished thing. Gone and back again is an arrival again.
 */
export declare function useArrived(shown: boolean, ms?: number): boolean;
/**
 * Calls `onEscape` on Escape while `enabled`, for the topmost enabled layer only: a popover over a dialog closes
 * first. A key whose default was prevented (a part that used Escape itself, an armed `ConfirmPress`) is left alone.
 * An `ambient` layer (a notice that sits over the page without being a dialog) gets the key only while no ordinary
 * layer is enabled, however late it arrived.
 */
export declare function useEscape(onEscape: (event: KeyboardEvent) => void, enabled?: boolean, options?: {
    ambient?: boolean;
}): void;
/**
 * While `active`, remembers what had focus when it turned on, and gives focus back there when it turns off or the
 * component unmounts (if that element is still in the page). The opener is read as the hook first renders active,
 * before the commit that mounts the layer: a page that turns inert in that same commit (an `inert` prop on the
 * header beside the sheet) has already dropped focus by the time any effect runs. It is restored in a passive
 * cleanup, so call `useInert` first and the page is no longer inert when focus goes back.
 */
export declare function useOpenerFocus(active: boolean, restore?: boolean): void;
/** Options of `useFocusTrap`: whether it holds, and where focus lands as it starts. */
export interface FocusTrapOptions {
    /** The trap holds only while true. */
    enabled?: boolean;
    /**
     * Where focus lands as the trap starts: this element, else the first tabbable inside, else the container (give it
     * `tabIndex={-1}`). `false` leaves focus where it is.
     */
    initialFocus?: RefObject<HTMLElement | null> | false;
    /** Wrap Tab at the ends. Default true; false moves focus in and lets it leave (a non-modal panel). */
    contain?: boolean;
}
/**
 * Keeps Tab inside `container` while enabled: focus lands inside as it starts, and Tab and Shift+Tab wrap at the
 * ends (from the container itself too, after a click on its text). The rest of the page is the caller's to make inert.
 */
export declare function useFocusTrap(container: RefObject<HTMLElement | null>, options?: FocusTrapOptions): void;
/**
 * Sets `inert` on `target` while `enabled` (the page behind a modal), restoring what it was after. Skipped when the
 * target holds `except` (the modal itself), which would leave nothing reachable.
 */
export declare function useInert(target: RefObject<HTMLElement | null> | HTMLElement | null | undefined, enabled: boolean, except?: RefObject<HTMLElement | null>): void;
/** Which arrows move a roving group: left/right, up/down, or both. */
export type Orientation = "horizontal" | "vertical" | "both";
/**
 * Where a key moves the focus in a list of `count` items from `index`: arrows along `orientation` (both ways in a
 * right-to-left page), Home and End to the ends; wrapping when `loop`. `null` for a key the group does not use. Pure.
 */
export declare function rovingIndex(key: string, index: number, count: number, orientation?: Orientation, loop?: boolean, rtl?: boolean): number | null;
/** Options of `useRovingFocus`: the items' selector, the axis, wrapping and what happens after a move. */
export interface RovingFocusOptions {
    /** The items inside the container, as a selector; `[data-roving-item]` by default. */
    items?: string;
    orientation?: Orientation;
    /** Wrap from the last item to the first. Default true. */
    loop?: boolean;
    /** Called with the item focus moved to: select it here for selection-follows-focus. */
    onMove?: (item: HTMLElement, index: number) => void;
}
/**
 * One tab stop for a group: the returned key handler (put it on the container) moves focus between the items by
 * `rovingIndex`. The caller gives the current item `tabIndex={0}` and the rest -1. Items are read from the DOM at the
 * keypress, so the group needs no registration; disabled items (`disabled` or `aria-disabled="true"`) are skipped.
 */
export declare function useRovingFocus(container: RefObject<HTMLElement | null>, options?: RovingFocusOptions): (event: ReactKeyboardEvent) => void;
