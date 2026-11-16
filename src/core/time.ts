/** The time units in milliseconds, and the whole seconds a countdown shows. */

export const MINUTE_MS = 60_000;
/** One hour in milliseconds. */
export const HOUR_MS = 60 * MINUTE_MS;
/** One day in milliseconds. */
export const DAY_MS = 24 * HOUR_MS;
/** One week in milliseconds. */
export const WEEK_MS = 7 * DAY_MS;

/** Whole seconds until `endsAt`, never negative. */
export function secondsUntil(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** Local calendar day as "YYYY-MM-DD". */
export function dayKey(now: number): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The local midnight that ends the day containing `now`, found by the calendar: a daylight-saving day is 23 or
 * 25 hours long, so adding 24 hours would miss it.
 */
export function nextLocalMidnight(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/** The day key of the local day before the one holding `key`. */
export function previousDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1);
  return dayKey(date.getTime());
}
