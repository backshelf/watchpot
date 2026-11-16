import { useId } from "react";
import { cx, Progress } from "watchpot/ui";
import s from "./ProgressBar.module.css";

/** Props of `ProgressBar`: the value and its range, the words beside it, and how many blocks it is cut into. */
export interface ProgressBarProps {
  value: number;
  max: number;
  /** The bar's name, drawn at its start ("Sunlight toward a burn"). On a `thin` bar it is not drawn, only said. */
  label: string;
  /** The figure drawn at its end and said to assistive tech ("4,120 of 6,000"); the game's words. */
  valueText?: string;
  /** Drawn and said in place of `valueText` once the bar is full ("Complete"), in the ok ink. */
  completeText?: string;
  /** The blocks the track is cut into; 24 by default. Whole blocks light, the last only when truly full. */
  steps?: number;
  /** A 4px bar with no row of words, for under something. */
  thin?: boolean;
  className?: string;
}

/** The segmented bar on `Progress`: a grey track cut into blocks by the gutter, the lit ones in ink. */
export function ProgressBar({
  value,
  max,
  label,
  valueText,
  completeText,
  steps = 24,
  thin = false,
  className,
}: ProgressBarProps) {
  const id = useId();
  const complete = max > 0 && value >= max;
  const shown = complete && completeText !== undefined ? completeText : valueText;
  return (
    <div
      className={cx(s.bar, className)}
      data-thin={thin ? "" : undefined}
      data-complete={complete ? "" : undefined}
    >
      {!thin && (
        <div className={s.row}>
          <span id={id} className={s.label}>
            {label}
          </span>
          {shown && (
            <span className={s.value} aria-hidden="true">
              {shown}
            </span>
          )}
        </div>
      )}
      <Progress
        className={s.track}
        value={value}
        max={max}
        valueText={shown}
        steps={steps}
        aria-labelledby={thin ? undefined : id}
        aria-label={thin ? label : undefined}
      />
    </div>
  );
}
