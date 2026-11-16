import { type RefObject, useEffect } from "react";
import type { ShaderHandle } from "./canvas";

/**
 * A pulse: one number that jumps to 1 when something happens and falls back to 0 over a set time. A shader reads it
 * as `u_pulse` (a flash, a ring, a breath): light as feedback. `createPulse` is the envelope, with no React and no
 * clock of its own; `usePulseUniform` feeds one to a canvas through its handle, a frame at a time, with no render.
 */
export interface Pulse {
  /** Something happened: the pulse goes to `strength` (default 1), or stays where it is when that is higher. */
  bump(strength?: number): void;
  /** The pulse now, 0 to 1. */
  value(): number;
  /** Calls `wake` on every bump; returns the unsubscribe. */
  subscribe(wake: () => void): () => void;
}

/** A pulse that decays to nothing over `decayMs`, read on the clock `now` (milliseconds: `performance.now`). */
export function createPulse(decayMs: number, now: () => number): Pulse {
  let level = 0;
  let at = 0;
  const listeners = new Set<() => void>();
  const value = () => (decayMs > 0 ? Math.max(0, level * (1 - (now() - at) / decayMs)) : 0);
  return {
    bump: (strength = 1) => {
      level = Math.max(value(), strength);
      at = now();
      for (const wake of listeners) wake();
    },
    value,
    subscribe: (wake) => {
      listeners.add(wake);
      return () => listeners.delete(wake);
    },
  };
}

/**
 * Feeds a pulse to a shader canvas as the uniform `name` (default `u_pulse`): a frame loop that runs only while the
 * pulse is above zero, pushing through the handle's `setUniforms`, so nothing renders.
 */
export function usePulseUniform(
  handle: RefObject<ShaderHandle | null>,
  pulse: Pulse,
  name = "u_pulse",
): void {
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const value = pulse.value();
      handle.current?.setUniforms({ [name]: value });
      frame = value > 0 ? requestAnimationFrame(tick) : 0;
    };
    const stop = pulse.subscribe(() => {
      if (frame === 0) frame = requestAnimationFrame(tick);
    });
    return () => {
      stop();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [handle, pulse, name]);
}
