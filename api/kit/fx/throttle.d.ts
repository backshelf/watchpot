/**
 * How long to wait before showing a new value, given when the last one was shown. Zero means show it now.
 * Pure, so the rule is testable without timers.
 */
export declare function throttleDelay(lastShownAt: number, now: number, intervalMs: number): number;
/**
 * Follows `value`, but changes at most once per `intervalMs`: the first change shows at once (leading edge),
 * changes inside the window collapse into one trailing update with the latest value, so the final value is
 * never dropped.
 */
export declare function useThrottledValue<T>(value: T, intervalMs: number): T;
