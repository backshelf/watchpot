import NumberFlow, { type Format } from "@number-flow/react";
import { useMemo, useRef } from "react";
import { splitDigits } from "./digitSnap";
import { useReducedMotion } from "./motion";
import { useThrottledValue } from "./throttle";

/** A ticking number animates at most this often, however fast the value changes underneath. */
const TICK_INTERVAL_MS = 250;

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

function formatFor(suffix: string | undefined, decimals: number | undefined): Format {
  if (decimals !== undefined) return { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  if (suffix) return { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return { maximumFractionDigits: 2 };
}

/**
 * A tick settles before the next one starts: 220ms on `--ease-out`'s curve, inside the 250ms throttle window.
 * NumberFlow's own ~900ms default leaves a fast counter permanently mid-roll, which reads as noise.
 */
const TICK: EffectTiming = { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" };
const FADE: EffectTiming = { duration: 160, easing: "ease-out" };
const timing = { transformTiming: TICK, spinTiming: TICK, opacityTiming: FADE };

/**
 * A live number that ticks. Wraps NumberFlow for a Decimal shown as mantissa plus suffix: throttled to four
 * animations a second (its face and tabular figures are the game's `className`), and still under reduced motion (the OS or the in-game setting: the
 * value updates, the digits do not roll). The mantissa and the suffix are throttled as one value, so a magnitude
 * change never shows a stale mantissa beside the new suffix; and the number is keyed by its suffix, so crossing a
 * magnitude (99,999 to 100.00K) snaps to the new figure instead of rolling the digits down. Digits that turn faster
 * than four times a second (`splitDigits`) are set still after the rolling head, so no still catches one
 * half-turned; the suffix is set after them, outside the roll.
 */
export function Ticker({ mantissa, suffix, className, decimals, animated = true }: TickerProps) {
  const reduced = useReducedMotion();
  const pair = useMemo(() => ({ mantissa, suffix }), [mantissa, suffix]);
  const shown = useThrottledValue(pair, TICK_INTERVAL_MS);
  const rate = useShownRate(shown);
  const moving = animated && !reduced;
  // Fixed places: the given ones, two with a suffix, none for a whole number; a free-form fraction always rolls.
  const places = decimals ?? (shown.suffix ? 2 : Number.isInteger(shown.mantissa) ? 0 : null);
  const split = moving && places !== null ? splitDigits(shown.mantissa, places, rate) : "roll";
  const head = typeof split === "object" ? split : null;
  return (
    <span className={className}>
      <NumberFlow
        key={shown.suffix ?? ""}
        value={head ? head.head : shown.mantissa}
        format={head ? formatFor(undefined, head.decimals) : formatFor(shown.suffix, decimals)}
        locales="en-US"
        animated={moving && split !== "snap"}
        respectMotionPreference
        {...timing}
      />
      {(head?.tail || shown.suffix) && (
        <span>
          {head?.tail}
          {shown.suffix}
        </span>
      )}
    </span>
  );
}

/**
 * How fast the shown mantissa moves, in units a second, from the last two shown values. The lower of the last two
 * readings, so one jump (a purchase, a claim) never snaps the digits for a beat; a magnitude change starts over.
 */
function useShownRate(shown: { mantissa: number; suffix?: string }): number {
  const last = useRef<{ shown: typeof shown; at: number; rate: number; prev: number } | null>(null);
  const was = last.current;
  if (was?.shown !== shown) {
    const at = performance.now();
    let rate = 0;
    if (was && was.shown.suffix === shown.suffix && at > was.at)
      rate = (Math.abs(shown.mantissa - was.shown.mantissa) * 1000) / (at - was.at);
    last.current = { shown, at, rate, prev: was && was.shown.suffix === shown.suffix ? was.rate : 0 };
  }
  const now = last.current;
  return now ? Math.min(now.rate, now.prev) : 0;
}

/** Props of `Money`: real money, as integer cents. */
export interface MoneyProps {
  /** Real money, integer cents. */
  cents: number;
  className?: string;
  animated?: boolean;
}

const USD: Format = {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

/** Real money: integer cents shown as dollars to the cent ("$0.01", "$1,204.17"), never abbreviated. */
export function Money({ cents, className, animated = true }: MoneyProps) {
  const reduced = useReducedMotion();
  const value = useThrottledValue(cents, TICK_INTERVAL_MS);
  return (
    <NumberFlow
      className={className}
      value={value / 100}
      format={USD}
      locales="en-US"
      animated={animated && !reduced}
      respectMotionPreference
      {...timing}
    />
  );
}
