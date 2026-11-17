import { cx } from "watchpot/ui";
import type { ReactNode } from "react";

// The look: Tailwind utilities over the --ui-* tokens (theme.css), where the CSS module was.
const s = {
  title:
    "m-0 font-ui-display [font-size:clamp(26px,4vw,34px)] font-bold leading-[1.05] tracking-[-0.01em] text-balance data-[size=section]:text-[22px]",
};

/** Props of `Title`: the words, the heading level and the size. */
export interface TitleProps {
  children: ReactNode;
  /** The heading level: 1 (default) for a screen's title, 2 for a section's. */
  level?: 1 | 2;
  /** "screen" (default) or "section". */
  size?: "screen" | "section";
  className?: string;
}

/** A title in the display face: a real heading, one per screen at level 1. */
export function Title({ children, level = 1, size = "screen", className }: TitleProps) {
  const H = level === 2 ? "h2" : "h1";
  return (
    <H className={cx(s.title, className)} data-size={size}>
      {children}
    </H>
  );
}
