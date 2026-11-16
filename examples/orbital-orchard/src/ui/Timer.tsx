import type { ReactNode } from "react";
import { Countdown, cx } from "watchpot/ui";
import s from "./Timer.module.css";

/** Props of `Timer`: the seconds left (the caller owns the clock), the words before them, the edges and the look. */
export interface TimerProps {
  secondsLeft: number;
  /** Before the digits, set as a code stamp ("Ends in"); the game's words. */
  label?: ReactNode;
  /** In place of `label` once it reaches zero ("Ended"). */
  endedLabel?: ReactNode;
  /** `data-warn` (the digits in the warning ink) under this many seconds. */
  warnUnder?: number;
  /** Once, on the edge to zero. */
  onEnd?: () => void;
  /** The digits' text; `formatCountdown` ("hh:mm:ss", "6d 20h") by default. */
  format?: (secondsLeft: number) => ReactNode;
  /** "inline" (default) in a line of text; "pill" on a grey cell, for an event's head. */
  variant?: "inline" | "pill";
  className?: string;
}

/** A countdown on `Countdown`: a code stamp, then a `<time>` in the number face. `data-warn` and `data-ended` style it. */
export function Timer({
  secondsLeft,
  label,
  endedLabel,
  warnUnder,
  onEnd,
  format,
  variant = "inline",
  className,
}: TimerProps) {
  const left = Math.max(0, Math.floor(secondsLeft));
  const ended = left === 0;
  const warn = warnUnder !== undefined && left < warnUnder && !ended;
  const words = ended && endedLabel !== undefined ? endedLabel : label;
  return (
    <p
      className={cx(s.timer, className)}
      data-variant={variant}
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
