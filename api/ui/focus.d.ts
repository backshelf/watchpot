/** Elements that can take focus: the native controls, links, editables and anything with a `tabindex`. */
export declare const FOCUSABLE: string;
/** Whether Tab can reach `el`: not disabled, not inside `[hidden]` or `[inert]`, not tabindex -1. */
export declare function isTabbable(el: Element): el is HTMLElement;
/** The elements Tab reaches inside `root`, in document order (positive tabindex order is not honoured). */
export declare function tabbables(root: Element): HTMLElement[];
/** Focuses `el` without scrolling; returns whether it took focus. */
export declare function focusWithoutScroll(el: HTMLElement | null | undefined): boolean;
/** The element that has focus now, or null when it is the body. */
export declare function activeElement(): HTMLElement | null;
