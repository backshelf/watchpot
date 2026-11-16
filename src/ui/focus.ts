// What counts as reachable by Tab, and the moves every focus-managing primitive makes. No layout is read, so it
// behaves the same in a test DOM: an element is skipped for being disabled, inert, hidden or tabindex -1.

/** Elements that can take focus: the native controls, links, editables and anything with a `tabindex`. */
export const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]",
].join(", ");

/** Whether Tab can reach `el`: not disabled, not inside `[hidden]` or `[inert]`, not tabindex -1. */
export function isTabbable(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if ((el as HTMLButtonElement).disabled) return false;
  if (el.tabIndex < 0) return false;
  return el.closest("[hidden], [inert]") === null;
}

/** The elements Tab reaches inside `root`, in document order (positive tabindex order is not honoured). */
export function tabbables(root: Element): HTMLElement[] {
  return [...root.querySelectorAll(FOCUSABLE)].filter(isTabbable);
}

/** Focuses `el` without scrolling; returns whether it took focus. */
export function focusWithoutScroll(el: HTMLElement | null | undefined): boolean {
  if (!el) return false;
  el.focus({ preventScroll: true });
  return el.ownerDocument.activeElement === el;
}

/** The element that has focus now, or null when it is the body. */
export function activeElement(): HTMLElement | null {
  const el = typeof document === "undefined" ? null : document.activeElement;
  return el instanceof HTMLElement && el !== document.body ? el : null;
}
