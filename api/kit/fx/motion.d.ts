/** The game's own motion setting, fed in by the shell. "system" defers to the OS. Kept here so fx reads no state. */
export type MotionOverride = "system" | "reduced" | "full";
/** The OS half alone: true when the system asks for less motion, whatever the in-game setting says. */
export declare function osPrefersReducedMotion(): boolean;
/** Sets the in-game preference every effect honours alongside the OS. The settings slice owns it; the shell calls this. */
export declare function setReducedMotion(pref: MotionOverride): void;
/**
 * True when motion is reduced: the in-game setting says "reduced", or it says "system" and the OS asks for less.
 * Read at call time; the OS half is false where there is no `matchMedia`.
 */
export declare function prefersReducedMotion(): boolean;
/** Calls `onChange` when the OS preference or the in-game setting changes; returns the unsubscribe. */
export declare function subscribeReducedMotion(onChange: () => void): () => void;
/** `prefersReducedMotion()` as React state that follows the OS and the in-game setting while mounted. */
export declare function useReducedMotion(): boolean;
/** True when a WebGL context can be created. Probed once with a throwaway canvas and cached. */
export declare function hasWebGL(): boolean;
/** A dialog part's entrance: it rises 16px into place after `delay` seconds, or stands still when `show` is off. */
export declare function riseIn(show: boolean, delay: number): {
    initial: {
        opacity: number;
        y: number;
    };
    animate: {
        opacity: number;
        y: number;
    };
    transition: {
        delay: number;
        duration: number;
        ease: readonly [0.2, 0.8, 0.2, 1];
    };
} | {
    animate?: undefined;
    transition?: undefined;
    initial: false;
};
