// A surface's own frame loop at a chosen rate, below the display's: for a shader that moves slowly, or in steps on
// purpose, and works its uniforms out a frame at a time. The canvas is held (`paused`) and this pushes its uniforms
// through the handle a few times a second, so it draws that often and no more, with no React render.
import { type RefObject, useEffect, useRef } from "react";
import { type ShaderHandle, shaderClockPin } from "./canvas";
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
export function useSteppedFrame(
  handle: RefObject<ShaderHandle | null>,
  frame: (seconds: number, dt: number) => Uniforms,
  { fps, ready = true, running = true, at, pin }: SteppedFrameOptions,
): void {
  const latest = useRef(frame);
  latest.current = frame;
  const pinned = useRef(pin);
  pinned.current = pin;
  const clock = useRef(0);
  const looping = ready && running;
  useEffect(() => {
    if (!looping) return;
    const every = 1000 / Math.max(1, fps);
    const held = (): number | null => pinned.current?.() ?? shaderClockPin();
    let raf = 0;
    let last = -1;
    let due = 0;
    const step = (now: number) => {
      const dt = last < 0 ? 0 : Math.min(0.25, (now - last) / 1000);
      last = now;
      const pinnedAt = held();
      if (pinnedAt === null) clock.current += dt;
      handle.current?.setUniforms(latest.current(pinnedAt ?? clock.current, dt));
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now < due) return;
      // The rate is a ceiling: a late frame keeps the beat, a very late one starts it again.
      due = (now - due > every ? now : due) + every;
      step(now);
    };
    // The first frame at once, so the canvas never shows a frame without its uniforms.
    handle.current?.setUniforms(latest.current(held() ?? clock.current, 0));
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [handle, fps, looping]);
  // Stopped: the held frame, pushed again after every render.
  useEffect(() => {
    if (!ready || running) return;
    const pinnedAt = pinned.current?.() ?? shaderClockPin();
    handle.current?.setUniforms(latest.current(pinnedAt ?? at ?? clock.current, 0));
  });
}
