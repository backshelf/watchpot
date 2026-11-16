import { type ComponentPropsWithRef, type ReactNode } from "react";
import { type AsChild } from "./slot";
/** Props of `VisuallyHidden`: a span's. */
export type VisuallyHiddenProps = ComponentPropsWithRef<"span">;
/** Words a screen reader says and the screen does not show (a count's meaning, a state). */
export declare function VisuallyHidden({ style, ...props }: VisuallyHiddenProps): import("react").JSX.Element;
/** Options of `useDisclosure`: open state. */
export interface DisclosureOptions {
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
}
/** What `useDisclosure` hands back: the state, and the button's and region's props. */
export interface DisclosureApi {
    open: boolean;
    setOpen: (open: boolean) => void;
    triggerProps: Record<string, unknown>;
    panelProps: Record<string, unknown>;
}
/** A show/hide button and the region it controls (WAI-ARIA disclosure), for a game's own markup. */
export declare function useDisclosure(options?: DisclosureOptions): DisclosureApi;
/** Props of `Disclosure.Root`: the open state and the parts. */
export interface DisclosureRootProps extends DisclosureOptions {
    children?: ReactNode;
}
declare function DisclosureRoot({ children, ...options }: DisclosureRootProps): import("react").JSX.Element;
/** Props of `Disclosure.Trigger`: a button's. */
export type DisclosureTriggerProps = ComponentPropsWithRef<"button"> & AsChild;
declare function DisclosureTrigger({ asChild, ...props }: DisclosureTriggerProps): import("react").JSX.Element;
/** Props of `Disclosure.Panel`: a div's. It stays mounted, `hidden` while closed. */
export type DisclosurePanelProps = ComponentPropsWithRef<"div"> & AsChild;
declare function DisclosurePanel({ asChild, ...props }: DisclosurePanelProps): import("react").JSX.Element;
/** A button that shows and hides a region: `Root`, `Trigger`, `Panel`, with `data-state` on both. */
export declare const Disclosure: {
    Root: typeof DisclosureRoot;
    Trigger: typeof DisclosureTrigger;
    Panel: typeof DisclosurePanel;
};
/** Props of `Toggle`: a button's, with its pressed state. */
export interface ToggleProps extends Omit<ComponentPropsWithRef<"button">, "onChange">, AsChild {
    pressed?: boolean;
    defaultPressed?: boolean;
    onPressedChange?: (pressed: boolean) => void;
}
/** A button that stays pressed (`aria-pressed`, `data-state` "on" | "off"): auto-buy on, a filter, a mute. */
export declare function Toggle({ pressed, defaultPressed, onPressedChange, asChild, ...props }: ToggleProps): import("react").JSX.Element;
/** Props of `Switch`: a button's, with its checked state. */
export interface SwitchProps extends Omit<ComponentPropsWithRef<"button">, "onChange">, AsChild {
    checked?: boolean;
    defaultChecked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
}
/** An on/off setting (`role="switch"`, `aria-checked`, `data-state` "checked" | "unchecked"). Name it by its label. */
export declare function Switch({ checked, defaultChecked, onCheckedChange, asChild, ...props }: SwitchProps): import("react").JSX.Element;
export {};
