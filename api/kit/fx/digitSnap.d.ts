/**
 * Which digits of a ticking number roll and which snap. The ticker shows at most four values a second and each
 * roll takes 220ms, so a digit that turns on most of them is never still and a glance or a screenshot catches it
 * half-turned. A digit that turns more than `MAX_ROLLS_PER_SECOND` times a second is set as plain text instead, and
 * only the slower head of the number rolls (still at least half the time). Pure, so the split is testable without
 * a DOM.
 */
export declare const MAX_ROLLS_PER_SECOND = 2;
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
export declare function splitDigits(value: number, decimals: number, rate: number): DigitSplit | "roll" | "snap";
