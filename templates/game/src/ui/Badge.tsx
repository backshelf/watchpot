import { cx, VisuallyHidden } from "watchpot/ui";
import s from "./Badge.module.css";

/** A count as a badge prints it: capped at 99 so it stays small. Also the tab bar's figure. */
export const badgeText = (count: number) => (count > 99 ? "99+" : String(count));

/** Props of `Badge`: the count and what it counts, in words. */
export interface BadgeProps {
  /** Things waiting. 0 or less draws nothing. */
  count: number;
  /** What a screen reader says for the count: the game's words ("3 to claim"). The figure itself is hidden. */
  words: (count: number) => string;
  className?: string;
}

/** A small count: something here is waiting. Inline; a caller that wants it on a corner places a wrapper. */
export function Badge({ count, words, className }: BadgeProps) {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return null;
  return (
    <span className={cx(s.badge, className)} data-count={n}>
      <span aria-hidden="true">{badgeText(n)}</span>
      <VisuallyHidden>{words(n)}</VisuallyHidden>
    </span>
  );
}
