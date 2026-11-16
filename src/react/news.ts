import { useEffect, useRef } from "react";
import { linesSince } from "../core/journal";

/**
 * Calls `onLine` for each line a journal gains, in order. The cursor starts at the log's last line at mount, so
 * nothing is news on the first render; a log replaced whole (an import, a fresh profile) no longer holds the cursor,
 * so nothing in it is news either. `onLine` is read through a ref, so a new callback never re-runs the effect.
 */
export function useNews<L>(log: readonly L[], onLine: (line: L) => void): void {
  const cursor = useRef<L | undefined>(log.at(-1));
  const handler = useRef(onLine);
  handler.current = onLine;
  useEffect(() => {
    const news = linesSince(log, cursor.current);
    cursor.current = log.at(-1);
    for (const line of news) handler.current(line);
  }, [log]);
}
