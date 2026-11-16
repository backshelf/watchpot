/** The time units in milliseconds, and the whole seconds a countdown shows. */
export declare const MINUTE_MS = 60000;
/** One hour in milliseconds. */
export declare const HOUR_MS: number;
/** One day in milliseconds. */
export declare const DAY_MS: number;
/** One week in milliseconds. */
export declare const WEEK_MS: number;
/** Whole seconds until `endsAt`, never negative. */
export declare function secondsUntil(endsAt: number, now: number): number;
/** Local calendar day as "YYYY-MM-DD". */
export declare function dayKey(now: number): string;
/**
 * The local midnight that ends the day containing `now`, found by the calendar: a daylight-saving day is 23 or
 * 25 hours long, so adding 24 hours would miss it.
 */
export declare function nextLocalMidnight(now: number): number;
/** The day key of the local day before the one holding `key`. */
export declare function previousDayKey(key: string): string;
