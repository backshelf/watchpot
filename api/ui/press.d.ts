import { type ComponentPropsWithRef } from "react";
import { type AsChild } from "./slot";
/** One press: where it landed in the element (px from its top-left), in the viewport, and what made it. */
export interface PressInfo {
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    /** "virtual" is a click with no pointer or key (assistive tech, `element.click()`). */
    pointerType: "mouse" | "touch" | "pen" | "keyboard" | "virtual";
}
/** Options of `usePress`: the press callback, whether keys repeat, and disabled. */
export interface PressOptions {
    onPress: (press: PressInfo) => void;
    /** A held Space or Enter presses again on each key repeat. Default false. */
    keyRepeat?: boolean;
    disabled?: boolean;
}
/** What `usePress` hands back: whether anything holds it down now, and the element's props. */
export interface PressApi {
    pressed: boolean;
    pressProps: Record<string, unknown>;
}
/**
 * Press counting for a click target: each pointer down is one press (so two fingers are two), Space and Enter are
 * one each (repeats only with `keyRepeat`), and a click with no pointer or key behind it (assistive tech) is one. The
 * browser's own click after a pointer or key is not counted again.
 */
export declare function usePress(options: PressOptions): PressApi;
/** Props of `Pressable`: the press options and a button's. */
export interface PressableProps extends Omit<ComponentPropsWithRef<"button">, "onClick">, Omit<PressOptions, "disabled">, AsChild {
}
/**
 * A clicker's click target: a button that calls `onPress` once per press, with where it landed (for floating
 * numbers), across mouse, multi-touch, pen and keyboard. `data-pressed` while held. Its words are the game's.
 */
export declare function Pressable({ onPress, keyRepeat, disabled, asChild, ...props }: PressableProps): import("react").JSX.Element;
/** Options of `useHoldRepeat`: the action and the repeat curve. */
export interface HoldRepeatOptions {
    /** Runs once at the press and again on every repeat; return `false` to stop (nothing left to buy). */
    action: () => unknown;
    /** Wait before the first repeat, ms. Default 400. */
    delay?: number;
    /** The first repeat interval, ms. Default 150. */
    interval?: number;
    /** The fastest interval, ms. Default 30. */
    minInterval?: number;
    /** Each repeat's interval is the last one times this. Default 0.85. */
    acceleration?: number;
    disabled?: boolean;
}
/** What `useHoldRepeat` hands back: whether it is held now, the element's props and a stop. */
export interface HoldRepeatApi {
    holding: boolean;
    stop: () => void;
    holdProps: Record<string, unknown>;
}
/**
 * Buy-while-held: the action runs at the press, then after `delay` repeats with an interval shrinking by
 * `acceleration` to `minInterval`. It stops on release, on the pointer leaving, on blur, on disable, or when the
 * action returns `false`. Keyboard holds work the same (Space or Enter, the key's own repeats ignored).
 */
export declare function useHoldRepeat(options: HoldRepeatOptions): HoldRepeatApi;
/** Props of `HoldButton`: the hold-repeat options and a button's. */
export interface HoldButtonProps extends Omit<ComponentPropsWithRef<"button">, "onClick">, Omit<HoldRepeatOptions, "disabled">, AsChild {
}
/** A button that repeats `action` while held, accelerating (buy-while-held); `data-holding` while it repeats. */
export declare function HoldButton({ action, delay, interval, minInterval, acceleration, disabled, asChild, ...props }: HoldButtonProps): import("react").JSX.Element;
