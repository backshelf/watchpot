/**
 * Calls `onLine` for each line a journal gains, in order. The cursor starts at the log's last line at mount, so
 * nothing is news on the first render; a log replaced whole (an import, a fresh profile) no longer holds the cursor,
 * so nothing in it is news either. `onLine` is read through a ref, so a new callback never re-runs the effect.
 */
export declare function useNews<L>(log: readonly L[], onLine: (line: L) => void): void;
