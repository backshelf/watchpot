import { Countdown, cx } from "watchpot/ui";
import type { ReactNode } from "react";

// The look: Tailwind utilities over the --ui-* tokens (theme.css), where the CSS module was. The root's `group` scopes
// the large size and the warning to the digits.
const s = {
  timer:
    "group/timer inline-flex flex-wrap items-baseline gap-1.5 m-0 data-[size=large]:grid data-[size=large]:gap-1 data-[ended]:text-ui-ink-muted",
  label: "text-ui-ink-muted text-[12px] font-semibold tracking-[0.04em] uppercase",
  digits:
    "font-ui-num text-[13px] tabular-nums group-data-[size=large]/timer:text-[36px] group-data-[size=large]/timer:leading-none group-data-[warn]/timer:text-ui-danger",
};

/** Props of `Timer`: the seconds left (the caller owns the clock), the words before them, and the edges. */
export interface TimerProps {
  secondsLeft: number;
  /** Before the digits ("Ends in"); the game's words. */
  label?: ReactNode;
  /** In place of `label` once it reaches zero ("Ended"). */
  endedLabel?: ReactNode;
  /** `data-warn` under this many seconds. */
  warnUnder?: number;
  /** Once, on the edge to zero. */
  onEnd?: () => void;
  /** The digits' text; `formatCountdown` ("hh:mm:ss", "6d 20h") by default. */
  format?: (secondsLeft: number) => ReactNode;
  /** "inline" (default) in a line of text; "large" for the one countdown a screen is for. */
  size?: "inline" | "large";
  className?: string;
}

/** A countdown on `Countdown`: words, then a `<time>` in the number face. `data-warn` and `data-ended` style it. */
export function Timer({
  secondsLeft,
  label,
  endedLabel,
  warnUnder,
  onEnd,
  format,
  size = "inline",
  className,
}: TimerProps) {
  const left = Math.max(0, Math.floor(secondsLeft));
  const ended = left === 0;
  const warn = warnUnder !== undefined && left < warnUnder && !ended;
  const words = ended && endedLabel !== undefined ? endedLabel : label;
  return (
    <p
      className={cx(s.timer, className)}
      data-size={size}
      data-warn={warn ? "" : undefined}
      data-ended={ended ? "" : undefined}
    >
      {words !== undefined && <span className={s.label}>{words}</span>}
      <Countdown
        className={s.digits}
        secondsLeft={left}
        warnUnder={warnUnder}
        onEnd={onEnd}
        format={format}
      />
    </p>
  );
}
