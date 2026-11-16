import { useCallback, useState } from "react";

/** A boot sequence as a pure machine: where it starts and how an event moves it. */
export interface BootMachine<P extends string, E extends string> {
  initial: P;
  next(phase: P, event: E): P;
}

/**
 * The boot sequence's phase as React state: `send` moves it through `machine.next`. The machine is the game's (its
 * title card, its intro, its splash); the shell draws a screen per phase and sends what the player does. `initial`
 * is read once, on mount.
 */
export function useBoot<P extends string, E extends string>(
  machine: BootMachine<P, E>,
): readonly [phase: P, send: (event: E) => void] {
  const [phase, setPhase] = useState(machine.initial);
  const { next } = machine;
  const send = useCallback((event: E) => setPhase((at) => next(at, event)), [next]);
  return [phase, send] as const;
}
