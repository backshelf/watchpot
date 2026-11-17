import { Ticker } from "watchpot/kit";
import { cx, VisuallyHidden } from "watchpot/ui";
import type { ReactNode } from "react";

// The look: Tailwind utilities over the --ui-* tokens (theme.css), where the CSS module was.
const s = {
  counter: "grid gap-1 m-0",
  value: "flex items-center gap-2.5",
  glyph: "inline-flex text-ui-ink-muted [&_svg]:size-7",
  // One line at the longest figure the game prints: size it down before letting it wrap.
  figure:
    "font-ui-num [font-size:clamp(32px,6vw,44px)] whitespace-nowrap font-medium tabular-nums leading-none tracking-[-0.02em]",
  rate: "text-ui-ink-muted font-ui-num text-[13px] tabular-nums",
};

/** Props of `Counter`: what it counts, the figure as `fmt` splits it, the rate line, and whether it rolls. */
export interface CounterProps {
  /** What the figure counts, as assistive tech names it ("Spores"). */
  label: string;
  glyph?: ReactNode;
  /** The number part of the formatted value (`fmt(x).mantissa`): 1.52 for "1.52M". */
  mantissa: number;
  /** The magnitude suffix (`fmt(x).suffix`): "M". */
  suffix?: string;
  /** Digits after the point; two with a suffix, none without, by default. */
  decimals?: number;
  /** The line under the figure, in the game's words ("+12.4 a second"). */
  rate?: ReactNode;
  /** Roll the digits (the kit's `Ticker`, on `@number-flow/react`). Off, the figure is plain text. Default true. */
  animated?: boolean;
  className?: string;
}

/**
 * The screen's big number: the figure rolling as it climbs (throttled, still under reduced motion), its rate under
 * it. To drop `@number-flow/react`, delete the `Ticker` line and keep the plain `text`.
 */
export function Counter({
  label,
  glyph,
  mantissa,
  suffix = "",
  decimals,
  rate,
  animated = true,
  className,
}: CounterProps) {
  const digits = decimals ?? (suffix ? 2 : 0);
  const text = `${mantissa.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`;
  return (
    <figure className={cx(s.counter, className)} aria-label={label}>
      <p className={s.value}>
        {glyph && (
          <span className={s.glyph} aria-hidden="true">
            {glyph}
          </span>
        )}
        <span className={s.figure} aria-hidden="true">
          {animated ? (
            // Keyed by the suffix: crossing a magnitude snaps to the new figure instead of rolling down.
            <Ticker key={suffix} mantissa={mantissa} suffix={suffix} decimals={digits} />
          ) : (
            text
          )}
        </span>
        <VisuallyHidden>{text}</VisuallyHidden>
      </p>
      {rate !== undefined && <figcaption className={s.rate}>{rate}</figcaption>}
    </figure>
  );
}
