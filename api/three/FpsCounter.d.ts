import type { CSSProperties } from "react";
import { type FrameRate } from "./fps";
/** What `<FpsCounter>` takes. */
export interface FpsCounterProps {
    readonly rate: FrameRate;
    readonly className?: string;
    readonly style?: CSSProperties;
    /** What shows before the first reading. Default "–". */
    readonly pending?: string;
}
/** Rendered frames per second, refreshed once a second, while the rate's `show` pref is on; nothing otherwise. */
export declare function FpsCounter({ rate, className, style, pending }: FpsCounterProps): import("react").JSX.Element | null;
