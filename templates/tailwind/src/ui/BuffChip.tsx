// @feature visitor
import { Countdown, cx } from "watchpot/ui";
import type { ReactNode } from "react";

// The look: Tailwind utilities over the --ui-* tokens (theme.css), where the CSS module was.
const s = {
  // The time left, as a bar along the foot that drains toward the start (its `::after`, scaled by `--left`).
  chip:
    "group relative inline-flex items-baseline gap-2 justify-self-start pt-1.5 px-3 pb-2 overflow-hidden border border-ui-accent rounded-ui bg-ui-surface text-[13px] after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-ui-accent after:content-[''] after:origin-left after:[scale:var(--left)_1] after:[transition:scale_250ms_linear]",
  name: "font-bold",
  effect: "text-ui-ink-muted",
  time: "font-ui-num tabular-nums group-data-[low]:text-ui-danger",
};

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
