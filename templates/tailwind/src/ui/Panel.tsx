import { cx } from "watchpot/ui";
import { Children, type ReactNode, useId } from "react";

// The look: Tailwind utilities over the --ui-* tokens (theme.css), where the CSS module was. The heading's level-3
// face is scoped to the panel's `data-level`, through the panel's `group`.
const s = {
  panel:
    "group/panel grid min-w-0 border border-ui-line rounded-ui bg-ui-surface data-[tone=sunken]:border-transparent data-[tone=sunken]:bg-ui-sunken",
  head: "flex items-baseline justify-between gap-3 px-4 py-3",
  heading:
    "m-0 min-w-0 font-ui-display text-[18px] font-bold leading-[1.2] group-data-[level=3]/panel:font-ui group-data-[level=3]/panel:text-[15px]",
  aside: "flex-none text-ui-ink-muted text-[13px]",
  body: "grid gap-2 pt-3 px-4 pb-4 border-t border-ui-line",
};

/** Props of `Panel`: its heading, the heading's level, what stands beside it, a tone and the body. */
export interface PanelProps {
  /** The panel's name; the article is labelled by it. */
  heading: ReactNode;
  /** 2 (default) for a screen's panels, 3 for one inside a titled section. */
  level?: 2 | 3;
  /** Beside the heading: a count, a figure, a badge. */
  aside?: ReactNode;
  /** "surface" (default) stands up from the ground; "sunken" sits into it, for what is read rather than played. */
  tone?: "surface" | "sunken";
  className?: string;
  children?: ReactNode;
}

/** A unit of a screen: an `<article>` named by a real heading, its body under a rule. No body, no rule. */
export function Panel({ heading, level = 2, aside, tone = "surface", className, children }: PanelProps) {
  const id = useId();
  const H = level === 3 ? "h3" : "h2";
  return (
    <article className={cx(s.panel, className)} aria-labelledby={id} data-tone={tone} data-level={level}>
      <div className={s.head}>
        <H id={id} className={s.heading}>
          {heading}
        </H>
        {aside !== undefined && <div className={s.aside}>{aside}</div>}
      </div>
      {Children.toArray(children).length > 0 && <div className={s.body}>{children}</div>}
    </article>
  );
}
