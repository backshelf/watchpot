import { type ComponentPropsWithRef, type ReactNode, type RefObject } from "react";
import { type AsChild, type PartRef } from "./slot";
/** Options of `useDialog`: open state, modality, focus and what dismisses it. */
export interface DialogOptions {
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Hold focus inside, mark `aria-modal` and make `inertTarget` inert. Default true; false for a side panel. */
    modal?: boolean;
    /** Where focus lands on open: this element, else the first control, else the panel. `false` leaves it. */
    initialFocus?: RefObject<HTMLElement | null> | false;
    /** Give focus back to the opener on close. Default true. */
    returnFocus?: boolean;
    /**
     * The rest of the page, made `inert` while a modal is open (the game's root, with the dialog portalled out of it).
     * Skipped when it contains the dialog.
     */
    inertTarget?: RefObject<HTMLElement | null> | HTMLElement | null;
    /** A press on the scrim closes. Default true. */
    closeOnScrim?: boolean;
    /** Escape closes. Default true. */
    closeOnEscape?: boolean;
}
/** Everything `useDialog` hands back: the state and the props for each element of a dialog the game draws itself. */
export interface DialogApi {
    open: boolean;
    setOpen: (open: boolean) => void;
    modal: boolean;
    /** Mark the dialog as described (the parts do this when `Dialog.Description` mounts). */
    setDescribed: (described: boolean) => void;
    triggerProps: {
        type: "button";
        "aria-haspopup": "dialog";
        "aria-expanded": boolean;
        "aria-controls": string | undefined;
        "data-state": DialogState;
        onClick: () => void;
    };
    /**
     * The scrim closes on a press that lands on the scrim itself, so it can sit behind the panel as a sibling or wrap
     * the panel to centre it (a grid with `place-items: center`): a press inside the panel never closes.
     */
    scrimProps: {
        "data-state": DialogState;
        onClick: ((event: {
            target: unknown;
            currentTarget: unknown;
        }) => void) | undefined;
    };
    /** The dialog is named by its title once an element carrying `titleProps` is mounted; until then, name it. */
    panelProps: {
        ref: PartRef;
        id: string;
        role: "dialog";
        "aria-modal": true | undefined;
        "aria-labelledby": string | undefined;
        "aria-describedby": string | undefined;
        tabIndex: -1;
        "data-state": DialogState;
        "data-modal": "" | undefined;
    };
    titleProps: {
        id: string;
        ref: (node: HTMLElement | null) => void;
    };
    descriptionProps: {
        id: string;
    };
    closeProps: {
        type: "button";
        onClick: () => void;
    };
}
/** A dialog's `data-state`. */
export type DialogState = "open" | "closed";
/**
 * A dialog's behaviour for a game that draws its own markup: spread `panelProps` on the panel, `titleProps` on its
 * heading and so on. Call it in the component that renders the panel, and render the panel only while `open`.
 */
export declare function useDialog(options?: DialogOptions): DialogApi;
/** Props of `Dialog.Root`: the `useDialog` options and the parts. */
export interface DialogRootProps extends DialogOptions {
    children?: ReactNode;
}
declare function DialogRoot({ children, ...options }: DialogRootProps): import("react").JSX.Element;
/** Props of `Dialog.Trigger`: a button's. */
export type DialogTriggerProps = ComponentPropsWithRef<"button"> & AsChild;
declare function DialogTrigger({ asChild, ...props }: DialogTriggerProps): import("react").JSX.Element;
/** Props of `Dialog.Scrim`: a div's. Drawn only while open; it may wrap the panel (see `scrimProps`). */
export type DialogScrimProps = ComponentPropsWithRef<"div"> & AsChild;
declare function DialogScrim({ asChild, ...props }: DialogScrimProps): import("react").JSX.Element | null;
/** Props of `Dialog.Panel`: a div's. Drawn only while open. */
export type DialogPanelProps = ComponentPropsWithRef<"div"> & AsChild;
declare function DialogPanel({ asChild, ref, ...props }: DialogPanelProps): import("react").JSX.Element | null;
/** Props of `Dialog.Title`: a heading's (`h2`). It names the dialog. */
export type DialogTitleProps = ComponentPropsWithRef<"h2"> & AsChild;
declare function DialogTitle({ asChild, ref, ...props }: DialogTitleProps): import("react").JSX.Element;
/** Props of `Dialog.Description`: a paragraph's. Mounting it describes the dialog. */
export type DialogDescriptionProps = ComponentPropsWithRef<"p"> & AsChild;
declare function DialogDescription({ asChild, ...props }: DialogDescriptionProps): import("react").JSX.Element;
/** Props of `Dialog.Close`: a button's; its words are its children. */
export type DialogCloseProps = ComponentPropsWithRef<"button"> & AsChild;
declare function DialogClose({ asChild, ...props }: DialogCloseProps): import("react").JSX.Element;
/**
 * A dialog as parts: `Root` holds the state, `Trigger` opens it, `Scrim` and `Panel` draw only while open, `Title`
 * names it, `Description` describes it, `Close` closes it. State is on `data-state` ("open" | "closed"); put the scrim
 * and panel in a `Portal` and pass the page root as `inertTarget` for a true modal.
 */
export declare const Dialog: {
    Root: typeof DialogRoot;
    Trigger: typeof DialogTrigger;
    Scrim: typeof DialogScrim;
    Panel: typeof DialogPanel;
    Title: typeof DialogTitle;
    Description: typeof DialogDescription;
    Close: typeof DialogClose;
};
/** The open state of the nearest `Dialog.Root`, for a part the game writes itself. */
export declare function useDialogState(): Pick<DialogApi, "open" | "setOpen" | "modal">;
export {};
