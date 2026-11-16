import { useEffect, useRef } from "react";

/**
 * One `keydown` listener on `window` while `enabled` (default true). A key is looked up lower-cased in `keys` and its
 * handler gets the event. Events with ctrl, meta or alt held, or aimed at an input, a textarea, a select or
 * content-editable text, are ignored. A held key runs the handler on every repeat; `event.repeat` is the handler's to
 * read. `keys` is read through a ref, so a new table never re-binds the listener.
 */
export function useHotkeys(
  keys: Readonly<Record<string, (event: KeyboardEvent) => void>>,
  options: { enabled?: boolean } = {},
): void {
  const table = useRef(keys);
  table.current = keys;
  const enabled = options.enabled ?? true;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const at = event.target as HTMLElement | null;
      if (
        at &&
        (at.tagName === "INPUT" ||
          at.tagName === "TEXTAREA" ||
          at.tagName === "SELECT" ||
          at.isContentEditable)
      )
        return;
      table.current[event.key.toLowerCase()]?.(event);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
