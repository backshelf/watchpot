import { cx, Progress } from "watchpot/ui";
import { useId } from "react";

// The look: Tailwind utilities over the --ui-* tokens (theme.css), where the CSS module was. A thin bar's track is
// scoped to the bar's `data-thin` through the bar's `group`.
const s = {
  bar: "group/bar grid gap-1.5",
  row: "flex items-baseline justify-between gap-3 text-[12px]",
  label: "font-semibold",
  value: "text-ui-ink-muted font-ui-num tabular-nums",
  // `Progress` sets `--value` (0..1) and `data-state`; stepped, `--steps` and one `[data-step]` per block.
  track:
    "relative h-2 overflow-hidden rounded-ui bg-ui-sunken group-data-[thin]/bar:h-1 data-[stepped]:grid data-[stepped]:grid-cols-[repeat(var(--steps),1fr)] data-[stepped]:gap-0.5 data-[stepped]:bg-transparent [&>[data-step]:not([data-lit])]:bg-ui-sunken [&>[data-lit]]:bg-ui-accent",
  fill:
    "absolute inset-y-0 left-0 w-[calc(var(--value)*100%)] bg-ui-accent [transition:width_var(--ui-duration)_ease-out]",
};

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
