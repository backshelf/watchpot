// @feature visitor
import { Countdown, cx } from "watchpot/ui";
import type { ReactNode } from "react";
import s from "./BuffChip.module.css";

/** Props of `BuffChip`: the bonus's name, what it does, and its time. */
export interface BuffChipProps {
  /** The bonus's name, in the game's words. */
  name: ReactNode;
  /** What it does, already formatted ("×3 Growth"). */
  effect?: ReactNode;
  /** Seconds left; the caller owns the clock. */
  secondsLeft: number;
  /** Its whole length in seconds: the bar under it drains from full (`--left`). */
  seconds: number;
  className?: string;
}

/**
 * A running timed bonus (a buff): its name, what it does and a countdown, with a bar that drains as it runs. A polite
 * status, so its start is said once; `data-low` in its last fifth.
 */
export function BuffChip({ name, effect, secondsLeft, seconds, className }: BuffChipProps) {
  const left = Math.max(0, secondsLeft);
  const share = seconds > 0 ? Math.min(1, left / seconds) : 0;
  return (
    <p
      className={cx(s.chip, className)}
      role="status"
      data-low={share < 0.2 ? "" : undefined}
      style={{ "--left": share }}
    >
      <span className={s.name}>{name}</span>
      {effect !== undefined && <span className={s.effect}>{effect}</span>}
      <Countdown className={s.time} secondsLeft={Math.ceil(left)} />
    </p>
  );
}
