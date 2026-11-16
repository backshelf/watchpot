import { type ComponentPropsWithRef, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { type AsChild } from "./slot";
/** Options of `useConfirmPress`: what fires, and how long an arm lasts. */
export interface ConfirmPressOptions {
    /** Called on the second press. */
    onConfirm: () => void;
    /** Called as the button arms and disarms, for a sound or a hint elsewhere. */
    onArmedChange?: (armed: boolean) => void;
    /** Disarm after this many ms without the second press; 0 never. Default 4000. */
    timeout?: number;
    disabled?: boolean;
}
/** What `useConfirmPress` hands back: whether it is armed, the button's props and a way to disarm. */
export interface ConfirmPressApi {
    armed: boolean;
    disarm: () => void;
    buttonProps: {
        type: "button";
        "data-armed": "" | undefined;
        onClick: (event: MouseEvent<HTMLElement>) => void;
        onBlur: (event: FocusEvent<HTMLElement>) => void;
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
    };
}
/**
 * The two-press behaviour on a button the game draws: press arms, press again fires; blur, Escape or the timeout
 * disarm. A held Enter's auto-repeat presses nothing, so one long press cannot arm and then fire.
 */
export declare function useConfirmPress(options: ConfirmPressOptions): ConfirmPressApi;
/** Props of `ConfirmPress`: a button's, the hook's options, and children that may read the armed state. */
export interface ConfirmPressProps extends Omit<ComponentPropsWithRef<"button">, "children">, Omit<ConfirmPressOptions, "disabled">, AsChild {
    /** The words, which should change once armed ("Buy" then "Press again to buy"): the game's. */
    children?: ReactNode | ((armed: boolean) => ReactNode);
}
/** A button that arms on the first press and fires `onConfirm` on the second; `data-armed` while armed. */
export declare function ConfirmPress({ onConfirm, onArmedChange, timeout, disabled, children, asChild, ...props }: ConfirmPressProps): import("react").JSX.Element;
