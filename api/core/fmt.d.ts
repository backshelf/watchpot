import { type DecimalSource } from "./decimal";
/**
 * Numbers as the player reads them. The default notation, `suffix`:
 * - below 100,000 (`PLAIN_BELOW`): plain digits with thousands separators ("12,480")
 * - from 100,000: two decimals and a suffix K M B T Qa Qi Sx Sp Oc No Dc ("1.52M")
 * - from 1e36 (past the last suffix): scientific ("1.00e36")
 * The other notations (`NOTATIONS`) keep the plain range and change what comes after it. Every figure is floored,
 * never rounded up: nothing is rounded away from the player.
 *
 * In a page, bind the options once with `formatter()` and print strings: `num` for costs, rates and supporting
 * figures, where the suffix keeps a line short; `full` for a headline figure that should read in full
 * ("1,000,000,000"). `fmt` itself returns a `Formatted` (its `.text` is the string; the mantissa and suffix are
 * there for a ticker that animates them), so `{fmt(n)}` is not something JSX can render.
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
/**
 * Options for `fmt`: the notation, where its plain range ends, and the decimals shown inside that range. Past the
 * plain range every notation prints its own fixed precision, whatever `decimals` says.
 */
export interface FmtOptions {
    /**
     * Decimals shown in the plain range only, 0 to 6 (default 0). Past it the precision is the notation's own: two
     * decimals under `suffix`, `scientific` and `letters`, three figures under `engineering`, two decimals of the
     * exponent under `logarithm`. Rates under 1,000 read better with one.
     */
    decimals?: number;
    /** "suffix" (default) walks K..Dc; the others print plain digits, then their own form from `plainBelow`. */
    notation?: Notation;
    /**
     * Where plain digits end, under every notation but `suffix` (default `PLAIN_BELOW`). Under `suffix` it is ignored:
     * plain digits always end at `PLAIN_BELOW`.
     */
    plainBelow?: number;
    /** `decimals` applies only to values under this (default: the whole plain range). */
    decimalsBelow?: number;
}
/**
 * Formats a number for display: plain digits, then `K` to `Dc` suffixes, then scientific (or the chosen notation's
 * form). Returns the parts and the string (`.text`); `formatter().num` returns the string alone.
 */
export declare function fmt(value: DecimalSource, options?: FmtOptions): Formatted;
/** The letters of group `n` (1 is "a"): bijective base 26, so z is followed by aa. */
export declare function letterSuffix(n: number): string;
/**
 * Full digits with separators, never a suffix: 12345678.9 -> "12,345,678". Floors toward zero. A Decimal carries
 * about fourteen digits it can be sure of, so a larger number is those digits and then zeros ("1,529,000,000,000,000,000"). Past
 * 3,000 digits it gives up and prints as `fmt` does.
 */
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
/** The printers bound to one set of options, each returning a string. */
export interface Formatter {
    /** A number as `fmt(value, options).text`; `decimals` overrides the options' for this call. */
    num(value: DecimalSource, decimals?: number): string;
    /** Every digit with separators, never a suffix (`fmtFull`): a headline figure. The options do not apply. */
    full(value: DecimalSource): string;
    /** A multiplier (`fmtTimes`): "×3.20". */
    times(value: DecimalSource): string;
    /** An addition to a base (`fmtPlus`): "+0.50". */
    plus(value: DecimalSource): string;
    /** A rate per second (`fmtRate`): "12.5/s". */
    rate(value: DecimalSource): string;
    /** A count with its word (`fmtCounted`): "2 gems". */
    counted(value: DecimalSource, words: readonly [one: string, many: string]): string;
}
/** Binds `num`, `full` and the four printers to one set of options, so a game sets its notation once. */
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
