import { type RefObject, useCallback, useRef } from "react";
import { prefersReducedMotion } from "./motion";

/** How hard `useShake` shakes: `soft` or `hard`. */
export type ShakeStrength = "soft" | "hard";

/** Duration of a shake, ms. A tap is 120ms in this system and a shake is the same beat. */
export const SHAKE_MS = 120;

const AMPLITUDE: Record<ShakeStrength, number> = { soft: 2, hard: 4 };

/** Keyframes for a shake: a horizontal jolt that decays, with a hint of vertical. Pure; tested. */
export function shakeKeyframes(strength: ShakeStrength): Keyframe[] {
  const a = AMPLITUDE[strength];
  return [
    { transform: "translate(0, 0)" },
    { transform: `translate(${-a}px, ${a / 4}px)` },
    { transform: `translate(${a * 0.75}px, ${-a / 4}px)` },
    { transform: `translate(${-a / 2}px, 0)` },
    { transform: `translate(${a / 4}px, 0)` },
    { transform: "translate(0, 0)" },
  ];
}

/**
 * Shakes an element once (a tile crack, a declined payment). Does nothing under reduced motion (the OS or the
 * in-game setting), or where the
 * Web Animations API is missing. Composited on top of the element's own transform.
 */
export function shake(el: Element | null, strength: ShakeStrength = "soft"): void {
  if (!el || prefersReducedMotion() || typeof el.animate !== "function") return;
  el.animate(shakeKeyframes(strength), { duration: SHAKE_MS, easing: "linear", composite: "add" });
}

/** A ref to put on the element to shake, and the function that shakes it. */
export function useShake<T extends Element>(): [RefObject<T | null>, (strength?: ShakeStrength) => void] {
  const ref = useRef<T>(null);
  const run = useCallback((strength: ShakeStrength = "soft") => shake(ref.current, strength), []);
  return [ref, run];
}
