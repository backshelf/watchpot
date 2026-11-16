// The measured frame rate as an `<output>`, unstyled: the game places and dresses it through `className`, `style`
// and the `data-fps` attribute.
import type { CSSProperties } from "react";
import { type FrameRate, useFrameRatePrefs, useMeasuredFps } from "./fps";

/** What `<FpsCounter>` takes. */
export interface FpsCounterProps {
  readonly rate: FrameRate;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** What shows before the first reading. Default "–". */
  readonly pending?: string;
}

/** Rendered frames per second, refreshed once a second, while the rate's `show` pref is on; nothing otherwise. */
export function FpsCounter({ rate, className, style, pending = "–" }: FpsCounterProps) {
  const { show } = useFrameRatePrefs(rate);
  const fps = useMeasuredFps(rate);
  if (!show) return null;
  return (
    <output aria-label="Frames per second" className={className} style={style} data-fps={fps}>
      {fps || pending} fps
    </output>
  );
}
