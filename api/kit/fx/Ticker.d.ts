/** Props of `Ticker`: the mantissa NumberFlow animates, its suffix and decimals. */
export interface TickerProps {
    /** The number part of a formatted value: 12480 for "12,480", 1.52 for "1.52M". */
    mantissa: number;
    /** The scale suffix from `fmt` ("K", "M", "e36"). Present means two fixed decimals. */
    suffix?: string;
    className?: string;
    /** Fixed decimals; overrides the default (two with a suffix, up to two without). */
    decimals?: number;
    /** Set false where nothing should move (a readout that is not the thing being pressed). */
    animated?: boolean;
}
/**
 * A live number that ticks. Wraps NumberFlow for a Decimal shown as mantissa plus suffix: throttled to four
 * animations a second (its face and tabular figures are the game's `className`), and still under reduced motion (the OS or the in-game setting: the
 * value updates, the digits do not roll). The mantissa and the suffix are throttled as one value, so a magnitude
 * change never shows a stale mantissa beside the new suffix; and the number is keyed by its suffix, so crossing a
 * magnitude (99,999 to 100.00K) snaps to the new figure instead of rolling the digits down. Digits that turn faster
 * than four times a second (`splitDigits`) are set still after the rolling head, so no still catches one
 * half-turned; the suffix is set after them, outside the roll.
 */
export declare function Ticker({ mantissa, suffix, className, decimals, animated }: TickerProps): import("react").JSX.Element;
/** Props of `Money`: real money, as integer cents. */
export interface MoneyProps {
    /** Real money, integer cents. */
    cents: number;
    className?: string;
    animated?: boolean;
}
/** Real money: integer cents shown as dollars to the cent ("$0.01", "$1,204.17"), never abbreviated. */
export declare function Money({ cents, className, animated }: MoneyProps): import("react").JSX.Element;
