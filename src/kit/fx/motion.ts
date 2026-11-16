import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** The game's own motion setting, fed in by the shell. "system" defers to the OS. Kept here so fx reads no state. */
export type MotionOverride = "system" | "reduced" | "full";

let override: MotionOverride = "system";
const listeners = new Set<() => void>();

/** The OS half alone: true when the system asks for less motion, whatever the in-game setting says. */
export function osPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

/** Sets the in-game preference every effect honours alongside the OS. The settings slice owns it; the shell calls this. */
export function setReducedMotion(pref: MotionOverride): void {
  if (pref === override) return;
  override = pref;
  for (const listener of listeners) listener();
}

/**
 * True when motion is reduced: the in-game setting says "reduced", or it says "system" and the OS asks for less.
 * Read at call time; the OS half is false where there is no `matchMedia`.
 */
export function prefersReducedMotion(): boolean {
  if (override === "reduced") return true;
  if (override === "full") return false;
  return osPrefersReducedMotion();
}

/** Calls `onChange` when the OS preference or the in-game setting changes; returns the unsubscribe. */
export function subscribeReducedMotion(onChange: () => void): () => void {
  listeners.add(onChange);
  const mq =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(QUERY)
      : null;
  mq?.addEventListener?.("change", onChange);
  return () => {
    listeners.delete(onChange);
    mq?.removeEventListener?.("change", onChange);
  };
}

/** `prefersReducedMotion()` as React state that follows the OS and the in-game setting while mounted. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
}

let webgl: boolean | undefined;

/** True when a WebGL context can be created. Probed once with a throwaway canvas and cached. */
export function hasWebGL(): boolean {
  if (webgl !== undefined) return webgl;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    webgl = Boolean(gl);
    // Browsers cap live WebGL contexts; give the probe's back at once.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

/** A dialog part's entrance: it rises 16px into place after `delay` seconds, or stands still when `show` is off. */
export function riseIn(show: boolean, delay: number) {
  return show
    ? {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        transition: { delay, duration: 0.32, ease: [0.2, 0.8, 0.2, 1] as const },
      }
    : { initial: false as const };
}
