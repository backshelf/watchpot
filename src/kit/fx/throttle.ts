import { useEffect, useRef, useState } from "react";

/**
 * How long to wait before showing a new value, given when the last one was shown. Zero means show it now.
 * Pure, so the rule is testable without timers.
 */
export function throttleDelay(lastShownAt: number, now: number, intervalMs: number): number {
  return Math.max(0, lastShownAt + intervalMs - now);
}

/**
 * Follows `value`, but changes at most once per `intervalMs`: the first change shows at once (leading edge),
 * changes inside the window collapse into one trailing update with the latest value, so the final value is
 * never dropped.
 */
export function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [shown, setShown] = useState(value);
  const lastShownAt = useRef(Number.NEGATIVE_INFINITY);
  const latest = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latest.current = value;
    if (timer.current !== null) return; // a trailing update is already scheduled; it will read `latest`
    const wait = throttleDelay(lastShownAt.current, performance.now(), intervalMs);
    if (wait === 0) {
      lastShownAt.current = performance.now();
      setShown(value);
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      lastShownAt.current = performance.now();
      setShown(latest.current);
    }, wait);
  }, [value, intervalMs]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    },
    [],
  );

  return shown;
}
