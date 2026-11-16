/** The argument reader and printers a sim script shares. */
import type { Decimal } from "../core";
/** Reads `--k=v` and `--k` (as `"true"`) from `argv` (default the process's); a later repeat wins, the value is all after the first `=`. */
export declare function simArgs(argv?: readonly string[]): Map<string, string>;
/** Time as `h:mm`, minutes floored, never negative. */
export declare function fmtClock(ms: number): string;
/** A Decimal in a few characters: whole below a million, then `e` and one decimal of its log10; zero or less is "0". */
export declare function shortDecimal(d: Decimal): string;
