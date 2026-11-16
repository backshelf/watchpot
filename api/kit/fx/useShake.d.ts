import { type RefObject } from "react";
/** How hard `useShake` shakes: `soft` or `hard`. */
export type ShakeStrength = "soft" | "hard";
/** Duration of a shake, ms. A tap is 120ms in this system and a shake is the same beat. */
export declare const SHAKE_MS = 120;
/** Keyframes for a shake: a horizontal jolt that decays, with a hint of vertical. Pure; tested. */
export declare function shakeKeyframes(strength: ShakeStrength): Keyframe[];
/**
 * Shakes an element once (a tile crack, a declined payment). Does nothing under reduced motion (the OS or the
 * in-game setting), or where the
 * Web Animations API is missing. Composited on top of the element's own transform.
 */
export declare function shake(el: Element | null, strength?: ShakeStrength): void;
/** A ref to put on the element to shake, and the function that shakes it. */
export declare function useShake<T extends Element>(): [RefObject<T | null>, (strength?: ShakeStrength) => void];
