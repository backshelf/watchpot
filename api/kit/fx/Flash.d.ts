import { type CSSProperties } from "react";
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
export declare function flashKeyframes(peak: number, reduced: boolean): Keyframe[];
/**
 * A flash over the nearest positioned ancestor, for the instant of a reveal: up fast, out slowly, then gone. It
 * ignores the pointer and is hidden from assistive tech; under reduced motion it is a dimmer, shorter fade. Its
 * colour and stacking are the game's (`className`); the flash is the element's opacity, run by the Web Animations
 * API. `data-flash` carries the trigger.
 */
export declare function Flash({ trigger, peak, duration, className, style }: FlashProps): import("react").JSX.Element | null;
