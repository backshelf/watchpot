import { Children, type ReactNode, useId } from "react";
import { cx } from "watchpot/ui";
import s from "./Panel.module.css";

/** Props of `Panel`: its heading, the heading's level, a badge and an aside beside it, a tone and the body. */
export interface PanelProps {
  /** The panel's name; the article is labelled by it. */
  heading: ReactNode;
  /** 2 (default) for a screen's panels, 3 for one inside a titled section. */
  level?: 2 | 3;
  /** Right after the heading: a `Badge` of things waiting. */
  badge?: ReactNode;
  /** At the heading row's end: a count, a figure, a timer. */
  aside?: ReactNode;
  /** "raised" (default) is the raised block; "paper" the grey block, for what is read rather than played. */
  tone?: "raised" | "paper";
  className?: string;
  children?: ReactNode;
}

/**
 * A unit of a screen: an `<article>` named by a real heading, a flat block on the ground with a hairline rule under
 * its heading row. No body, no rule.
 */
export function Panel({
  heading,
  level = 2,
  badge,
  aside,
  tone = "raised",
  className,
  children,
}: PanelProps) {
  const id = useId();
  const H = level === 3 ? "h3" : "h2";
  return (
    <article className={cx(s.panel, className)} aria-labelledby={id} data-tone={tone} data-level={level}>
      <div className={s.head}>
        <H id={id} className={s.heading}>
          {heading}
        </H>
        {badge}
        {aside !== undefined && <div className={s.aside}>{aside}</div>}
      </div>
      {Children.toArray(children).length > 0 && <div className={s.body}>{children}</div>}
    </article>
  );
}
