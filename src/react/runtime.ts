import { useEffect, useLayoutEffect } from "react";
import type { RootActions } from "../core/store";
import { type MotionOverride, setReducedMotion, useReducedMotion } from "../kit/fx/motion";
import { applyColorScheme, type SchemePreference } from "../kit/fx/scheme";
import { type GameClockHookOptions, useGameClock } from "./gameClock";

/** The two calls of a game's sound engine (`createSound` from `watchpot/sound`) the runtime makes. */
export interface RuntimeSound {
  armUnlock(): () => void;
  setMuted(value: boolean): void;
}

/** Options for `usePageRuntime`: the motion and colour-scheme settings and the sound engine. */
export interface PageRuntimeOptions {
  /** The in-game motion setting; "system" (the default) defers to the OS. */
  motion?: MotionOverride;
  /** The in-game colour scheme; "system" (the default) follows the OS, live. */
  scheme?: SchemePreference;
  /** The game's sound engine and whether sound is on: unlocked on the first gesture, muted while off. */
  sound?: { engine: RuntimeSound; on: boolean };
}

/** Options for `useGameRuntime`: the page's (`usePageRuntime`) and the clock's (`useGameClock`). */
export type GameRuntimeOptions = PageRuntimeOptions & GameClockHookOptions;

/** What `usePageRuntime` returns: whether motion is reduced. */
export interface PageRuntime {
  /** Motion is reduced: the setting says so, or it says "system" and the OS does. */
  reduced: boolean;
}

/** What `useGameRuntime` returns: whether motion is reduced and whether another tab took the save. */
export interface GameRuntime extends PageRuntime {
  /** Another tab of the game wrote the save: the clock has stopped and this one writes nothing until a reload. */
  taken: boolean;
}

/**
 * Everything a page starts once that is not the clock: the motion and colour-scheme settings on <html>, and the
 * sound's unlock and mute. For a shell that shows something before the game runs (a title, a splash) and starts
 * the clock itself (`useGameClock`) when that is over; it needs no store. The motion and the scheme are written in
 * layout effects, so the first paint is already right: `data-motion` on <html> is the resolved motion, "reduced" or
 * "full" (the OS answers for "system"), so a stylesheet reads that attribute alone.
 */
export function usePageRuntime(options: PageRuntimeOptions = {}): PageRuntime {
  const { motion = "system", scheme = "system", sound } = options;
  const osReduced = useReducedMotion();
  const reduced = motion === "reduced" || (motion === "system" && osReduced);

  const engine = sound?.engine;
  const on = sound?.on ?? true;
  useEffect(() => engine?.armUnlock(), [engine]);
  // Effects read the setting through `setReducedMotion`, the CSS through `data-motion` on <html>.
  useLayoutEffect(() => {
    setReducedMotion(motion);
    return () => setReducedMotion("system");
  }, [motion]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.motion = reduced ? "reduced" : "full";
    return () => {
      delete root.dataset.motion;
    };
  }, [reduced]);
  // `data-scheme` on <html>; "system" follows the OS live.
  useLayoutEffect(() => applyColorScheme(scheme), [scheme]);
  // The mute is the sound engine's module flag: a shell that goes leaves it unmuted for whatever mounts next.
  useEffect(() => {
    if (!engine) return;
    engine.setMuted(!on);
    return () => engine.setMuted(false);
  }, [engine, on]);

  return { reduced };
}

/**
 * The game's runtime, started once by the shell: the clock (`useGameClock`: live ticks, catch-ups and the hide
 * flush, and the watch on other tabs) and the page's (`usePageRuntime`: the motion and colour-scheme settings on
 * <html>, and the sound's unlock and mute). A clock that gives up is thrown from the render, so the app's error
 * boundary shows its fallback.
 *
 * The clock starts in a layout effect, so the first catch-up lands before any child's passive effect reads the
 * store; the motion and the scheme are written in layout effects too, so the first paint is already right.
 */
export function useGameRuntime(
  store: { getState(): RootActions },
  options: GameRuntimeOptions = {},
): GameRuntime {
  const { taken } = useGameClock(store, { away: options.away });
  const { reduced } = usePageRuntime(options);
  return { reduced, taken };
}
