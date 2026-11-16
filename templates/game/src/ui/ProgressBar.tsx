import { cx, Progress } from "watchpot/ui";
import { useId } from "react";
import s from "./ProgressBar.module.css";

/** Props of `ProgressBar`: the value and its range, the words beside it, and how it is cut. */
export interface ProgressBarProps {
  value: number;
  max: number;
  /** The bar's name, drawn at its start ("Next rank"). On a `thin` bar it is not drawn, only said. */
  label: string;
  /** The figure drawn at its end and said to assistive tech ("4,120 / 6,000"); the game's words. */
  valueText?: string;
  /**
   * Cut the bar into this many blocks. The primitive lights whole blocks by `drawnShare`, which keeps the last one
   * dark until the value is truly full.
   */
  steps?: number;
  /** A 4px bar with no row of words, for under something. */
  thin?: boolean;
  className?: string;
}

/** A progress bar on `Progress`: a track, a fill at `--value` (or lit blocks), and a row of words over it. */
export function ProgressBar({
  value,
  max,
  label,
  valueText,
  steps,
  thin = false,
  className,
}: ProgressBarProps) {
  const id = useId();
  return (
    <div className={cx(s.bar, className)} data-thin={thin ? "" : undefined}>
      {!thin && (
        <div className={s.row}>
          <span id={id} className={s.label}>
            {label}
          </span>
          {valueText && (
            <span className={s.value} aria-hidden="true">
              {valueText}
            </span>
          )}
        </div>
      )}
      <Progress
        className={s.track}
        value={value}
        max={max}
        valueText={valueText}
        steps={steps}
        aria-labelledby={thin ? undefined : id}
        aria-label={thin ? label : undefined}
        data-stepped={steps ? "" : undefined}
      >
        {!steps && <span className={s.fill} />}
      </Progress>
    </div>
  );
}
