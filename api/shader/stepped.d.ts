import { type RefObject } from "react";
import { type ShaderHandle } from "./canvas";
import type { Uniforms } from "./uniforms";
/** What `useSteppedFrame` is told: the rate, and whether it runs at all. */
export interface SteppedFrameOptions {
    /** Frames drawn a second, at most. */
    fps: number;
    /** False while there is no canvas to draw to yet (it is not mounted): nothing is pushed. Default true. */
    ready?: boolean;
    /**
     * False stops the clock: `frame` is called at `at` seconds (default: where the clock stood) after every render
     * and that frame is held. For reduced motion, or a surface told to stop. Default true.
     */
    running?: boolean;
    /** The clock a stopped loop holds (seconds), e.g. the frame chosen for reduced motion. */
    at?: number;
    /**
     * A clock to hold instead of the loop's own while it returns a number (development: one instant, repeatable).
     * While it returns none, the page's pin (`pinShaderClock`) is held the same way.
     */
    pin?: () => number | null | undefined;
}
/**
 * Calls `frame(seconds, dt)` at most `fps` times a second and pushes the uniforms it returns to the canvas behind
 * `handle` (a `ShaderCanvas` given `paused`, so each push is one draw). The clock counts only while the tab is
 * shown (frames stop in a hidden tab) and never jumps more than a quarter second. `frame` is read fresh at each
 * step, so it may close over the latest props. With `running` false it pushes one frame after each render instead,
 * so a held surface still follows its props. A pinned clock (`pin`, else `pinShaderClock`) is the `seconds` it is
 * called with, and the loop's own clock waits where it was.
 */
export declare function useSteppedFrame(handle: RefObject<ShaderHandle | null>, frame: (seconds: number, dt: number) => Uniforms, { fps, ready, running, at, pin }: SteppedFrameOptions): void;
