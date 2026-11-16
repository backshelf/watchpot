/**
 * Which digits of a ticking number roll and which snap. The ticker shows at most four values a second and each
 * roll takes 220ms, so a digit that turns on most of them is never still and a glance or a screenshot catches it
 * half-turned. A digit that turns more than `MAX_ROLLS_PER_SECOND` times a second is set as plain text instead, and
 * only the slower head of the number rolls (still at least half the time). Pure, so the split is testable without
 * a DOM.
 */
export const MAX_ROLLS_PER_SECOND = 2;

/** The number as one rolling head and a snapped tail: `head` formatted with `decimals` places, then `tail` text. */
export interface DigitSplit {
  head: number;
  decimals: number;
  tail: string;
}

/**
 * Splits `value`, shown as `text` (its en-US form at `decimals` places), for a number moving `rate` units a second.
 * `"roll"`: every digit is slow enough, roll it whole. `"snap"`: no clean head is left (every digit is fast, or the
 * cut falls inside a digit group, where the head would format differently): set it all still. Otherwise the split.
 */
export function splitDigits(value: number, decimals: number, rate: number): DigitSplit | "roll" | "snap" {
  if (!(rate > 0) || !Number.isFinite(rate) || !Number.isFinite(value) || value < 0) return "roll";
  // The smallest place that turns at most MAX_ROLLS_PER_SECOND times a second; every place below it snaps.
  const place = Math.max(-decimals, Math.ceil(Math.log10(rate / MAX_ROLLS_PER_SECOND) - 1e-9));
  const fast = place + decimals;
  if (fast <= 0) return "roll";
  const text = format(value, decimals);
  let cut = text.length;
  for (let digits = 0; cut > 0 && digits < fast; ) {
    cut -= 1;
    if (/\d/.test(text[cut] ?? "")) digits += 1;
  }
  // A separator at the cut belongs to the tail: "204." + "49" becomes "204" + ".49".
  while (cut > 0 && /[.,]/.test(text[cut - 1] ?? "")) cut -= 1;
  const headText = text.slice(0, cut);
  if (!/\d/.test(headText)) return "snap";
  const headDecimals = headText.includes(".") ? (headText.split(".")[1]?.length ?? 0) : 0;
  const head = Number(headText.replaceAll(",", ""));
  if (format(head, headDecimals) !== headText) return "snap";
  return { head, decimals: headDecimals, tail: text.slice(cut) };
}

function format(value: number, decimals: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
