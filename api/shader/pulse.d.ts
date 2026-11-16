import { type RefObject } from "react";
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
export declare function createPulse(decayMs: number, now: () => number): Pulse;
/**
 * Feeds a pulse to a shader canvas as the uniform `name` (default `u_pulse`): a frame loop that runs only while the
 * pulse is above zero, pushing through the handle's `setUniforms`, so nothing renders.
 */
export declare function usePulseUniform(handle: RefObject<ShaderHandle | null>, pulse: Pulse, name?: string): void;
