import { cx } from "watchpot/ui";
import { Children, type ReactNode, useId } from "react";
import s from "./Panel.module.css";

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
