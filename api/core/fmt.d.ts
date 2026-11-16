import { type DecimalSource } from "./decimal";
/**
 * Number formatting per decisions.md:
 * - below 100,000: plain with thousands separators ("12,480")
 * - from 100,000: two decimals and a suffix K M B T Qa Qi Sx Sp Oc No Dc ("1.52M")
 * - from 1e36 (past the last suffix): scientific ("1.00e36")
 * Mantissas are floored, never rounded up: nothing is rounded away from the player.
 *
 * Which one a call site uses (economy-midgame): `fmtFull` for headline numbers, which are power, balances (the
 * header pills and wallet numbers) and reward payouts, so a big number reads in full ("1,000,000,000"). `fmt` for
 * costs, rates and small supporting numbers, where the suffix keeps a line short.
 */
export declare const SUFFIXES: readonly ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
/** Below this value `fmt` prints plain digits with separators. */
export declare const PLAIN_BELOW = 100000;
/** From this power of ten `fmt` switches to scientific notation. */
export declare const SCIENTIFIC_FROM_EXPONENT = 36;
/** A formatted number: the mantissa, its suffix, the full text and the sign. */
export interface Formatted {
    /** The number in front of the suffix, already floored to the shown precision. A ticker animates this. */
    mantissa: number;
    /** "", "K".."Dc", or "e36" in the scientific range. */
    suffix: string;
    /** The full string, sign included. */
    text: string;
    negative: boolean;
}
/**
 * The notations, for a settings screen: `suffix` (the default: K to Dc, then scientific), `scientific` (`1.23e45`),
 * `engineering` (an exponent that is a multiple of 3, three figures: `12.3e6`), `letters` (a per thousand, then b, …
 * z, aa, ab …: `1.52b`) and `logarithm` (the exponent alone, two decimals: `e12.34`). Every one prints plain digits
 * below its plain range, and infinity as `∞`.
 */
export declare const NOTATIONS: readonly ["suffix", "scientific", "engineering", "letters", "logarithm"];
/** One of `NOTATIONS`. */
export type Notation = (typeof NOTATIONS)[number];
/** Options for `fmt`: the decimals shown in the plain range. */
export interface FmtOptions {
    /** Decimals to show in the plain range (default 0). Rates under 1,000 read better with one. */
    decimals?: number;
    /** "suffix" (default) walks K..Dc; the others print plain digits, then their own form from `plainBelow`. */
    notation?: Notation;
    /** Where plain digits end in every notation but `suffix` (default `PLAIN_BELOW`). */
    plainBelow?: number;
    /** `decimals` applies only to values under this (default: the whole plain range). */
    decimalsBelow?: number;
}
/** Formats a number for display: plain digits, then `K` to `Dc` suffixes, then scientific. */
export declare function fmt(value: DecimalSource, options?: FmtOptions): Formatted;
/** The letters of group `n` (1 is "a"): bijective base 26, so z is followed by aa. */
export declare function letterSuffix(n: number): string;
/** Full digits with separators, never a suffix: 12345678.9 -> "12,345,678". Floors toward zero. */
export declare function fmtFull(value: DecimalSource): string;
/** A multiplier: two decimals below 100, none from there: "×3.20", "×1.23e45". */
export declare function fmtTimes(value: DecimalSource, options?: FmtOptions): string;
/** An addition to a base, two decimals: "+0.50". A negative value keeps its own sign. */
export declare function fmtPlus(value: DecimalSource, options?: FmtOptions): string;
/** A rate per second, one decimal below 100: "12.5/s". */
export declare function fmtRate(value: DecimalSource, options?: FmtOptions): string;
/** A count with its word, the singular exactly at 1: "1 gem", "2 gems". */
export declare function fmtCounted(value: DecimalSource, words: readonly [one: string, many: string], options?: FmtOptions): string;
/** Time played: "4h 25m" from an hour, "12m 03s" under. Negative reads as zero. */
export declare function fmtPlayed(ms: number): string;
/** The printers bound to one set of options. */
export interface Formatter {
    /** A number; `decimals` overrides the options' for this call. */
    num(value: DecimalSource, decimals?: number): string;
    times(value: DecimalSource): string;
    plus(value: DecimalSource): string;
    rate(value: DecimalSource): string;
    counted(value: DecimalSource, words: readonly [one: string, many: string]): string;
}
/** Binds `num` and the four printers to one set of options, so a game sets its notation once. */
export declare function formatter(options?: FmtOptions): Formatter;
/** Real money: integer cents to "$1,204.17", never abbreviated. Negative cents read "-$0.14". */
export declare function fmtCents(cents: number): string;
/** Countdown "hh:mm:ss"; hours grow past 99 when they must. Negative spans read as zero. */
export declare function fmtTimer(ms: number): string;
/**
 * A wait in words, rounded up to the minute so it never reads shorter than it is, then its two largest units:
 * "2d 4h", "1h 52m", "12m", "under a minute". Zero or less is "now", or `zero` where the wait is a length and not
 * a time until something ("+0m" for a perk that adds nothing); infinite or NaN is "never".
 */
export declare function fmtWait(ms: number, options?: {
    zero?: string;
}): string;
/** Odds: up to two decimals, trailing zeros trimmed: "70%", "4.5%", "0.25%". */
export declare function fmtPercent(percent: number): string;
/** A bonus to one decimal, signed: "+4.4%". */
export declare function bonusPercent(value: number): string;
/** A plain count with separators: "12,480". Same as fmt(...).text without the suffix range, for ids and tallies. */
export declare function fmtCount(n: number): string;
