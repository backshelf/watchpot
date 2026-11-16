import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./motion";

/** Props of `Flash`: the trigger, its curve, and the element's class and style (its colour is the game's). */
export interface FlashProps {
  /** Change this (a counter is easiest) to flash once. Zero never flashes. */
  trigger: number;
  /** The peak opacity. Default 0.32; a third of that under reduced motion. */
  peak?: number;
  /** The whole flash, ms. Default 600; 200 under reduced motion. */
  duration?: number;
  /** The game's look: the colour (`background`), a blend mode, a stacking order. */
  className?: string;
  style?: CSSProperties;
}

/** The flash's curve: up fast to `peak`, then a long fall. Pure. */
export function flashKeyframes(peak: number, reduced: boolean): Keyframe[] {
  return reduced
    ? [{ opacity: peak / 3 }, { opacity: 0 }]
    : [
        { opacity: 0, offset: 0 },
        { opacity: peak, offset: 0.07 },
        { opacity: 0, offset: 1 },
      ];
}

/**
 * A flash over the nearest positioned ancestor, for the instant of a reveal: up fast, out slowly, then gone. It
 * ignores the pointer and is hidden from assistive tech; under reduced motion it is a dimmer, shorter fade. Its
 * colour and stacking are the game's (`className`); the flash is the element's opacity, run by the Web Animations
 * API. `data-flash` carries the trigger.
 */
export function Flash({ trigger, peak = 0.32, duration = 600, className, style }: FlashProps) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (trigger !== 0) setActive(trigger);
  }, [trigger]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (active === 0 || !el) return;
    if (typeof el.animate !== "function") {
      setActive(0);
      return;
    }
    const reduced = prefersReducedMotion();
    const run = el.animate(flashKeyframes(peak, reduced), {
      duration: reduced ? Math.min(200, duration) : duration,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      fill: "forwards",
    });
    run.onfinish = () => setActive(0);
    // A new trigger mid-flash remounts the element: the old run's end must not clear the new one.
    return () => {
      run.onfinish = null;
    };
  }, [active, peak, duration]);

  if (active === 0) return null;
  return (
    <div
      key={active}
      ref={ref}
      className={className}
      aria-hidden="true"
      data-flash={active}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0, ...style }}
    />
  );
}
