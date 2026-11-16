// A modal (or side-panel) dialog per the WAI-ARIA dialog pattern: focus moves in and is held, Escape and the scrim
// close it, focus returns to the opener, the page behind goes inert. No look: every part is the game's to style.
import {
  type ComponentPropsWithRef,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useControllable, useEscape, useFocusTrap, useInert, useOpenerFocus } from "./hooks";
import { partContext } from "./portal";
import { type AsChild, mergeProps, type PartRef, renderPart, useComposedRefs, usePartRef } from "./slot";

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
    onClick: ((event: { target: unknown; currentTarget: unknown }) => void) | undefined;
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
  titleProps: { id: string; ref: (node: HTMLElement | null) => void };
  descriptionProps: { id: string };
  closeProps: { type: "button"; onClick: () => void };
}

/** A dialog's `data-state`. */
export type DialogState = "open" | "closed";

/**
 * A dialog's behaviour for a game that draws its own markup: spread `panelProps` on the panel, `titleProps` on its
 * heading and so on. Call it in the component that renders the panel, and render the panel only while `open`.
 */
export function useDialog(options: DialogOptions = {}): DialogApi {
  const {
    modal = true,
    initialFocus,
    returnFocus = true,
    inertTarget,
    closeOnScrim = true,
    closeOnEscape = true,
  } = options;
  const [open, setOpen] = useControllable(options.open, options.defaultOpen ?? false, options.onOpenChange);
  const [described, setDescribed] = useState(false);
  const [titled, setTitled] = useState(false);
  const titleRef = useCallback((node: HTMLElement | null) => setTitled(node !== null), []);
  const panelRef = useRef<HTMLElement>(null);
  const panelPart = usePartRef(panelRef);
  const base = useId();
  const panelId = `${base}-panel`;
  const titleId = `${base}-title`;
  const descriptionId = `${base}-description`;

  // Order matters: cleanups run in this order, so the page stops being inert before focus goes back to the opener.
  useInert(inertTarget, open && modal, panelRef);
  useOpenerFocus(open, returnFocus);
  useFocusTrap(panelRef, { enabled: open, initialFocus, contain: modal });
  useEscape(() => setOpen(false), open && closeOnEscape);

  const state: DialogState = open ? "open" : "closed";
  return {
    open,
    setOpen,
    modal,
    setDescribed,
    triggerProps: {
      type: "button",
      "aria-haspopup": "dialog",
      "aria-expanded": open,
      "aria-controls": open ? panelId : undefined,
      "data-state": state,
      onClick: () => setOpen(!open),
    },
    scrimProps: {
      "data-state": state,
      onClick: closeOnScrim
        ? (event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }
        : undefined,
    },
    panelProps: {
      ref: panelPart,
      id: panelId,
      role: "dialog",
      "aria-modal": modal ? true : undefined,
      "aria-labelledby": titled ? titleId : undefined,
      "aria-describedby": described ? descriptionId : undefined,
      // focusable, so a click on the panel's text keeps focus inside and Shift+Tab from there wraps
      tabIndex: -1,
      "data-state": state,
      "data-modal": modal ? "" : undefined,
    },
    titleProps: { id: titleId, ref: titleRef },
    descriptionProps: { id: descriptionId },
    closeProps: { type: "button", onClick: () => setOpen(false) },
  };
}

const [DialogProvider, useDialogContext] = partContext<DialogApi>("Dialog.Root");

/** Props of `Dialog.Root`: the `useDialog` options and the parts. */
export interface DialogRootProps extends DialogOptions {
  children?: ReactNode;
}

function DialogRoot({ children, ...options }: DialogRootProps) {
  const api = useDialog(options);
  return <DialogProvider value={api}>{children}</DialogProvider>;
}

/** Props of `Dialog.Trigger`: a button's. */
export type DialogTriggerProps = ComponentPropsWithRef<"button"> & AsChild;

function DialogTrigger({ asChild, ...props }: DialogTriggerProps) {
  const d = useDialogContext("Dialog.Trigger");
  return renderPart("button", asChild, mergeProps(d.triggerProps, props));
}

/** Props of `Dialog.Scrim`: a div's. Drawn only while open; it may wrap the panel (see `scrimProps`). */
export type DialogScrimProps = ComponentPropsWithRef<"div"> & AsChild;

function DialogScrim({ asChild, ...props }: DialogScrimProps) {
  const d = useDialogContext("Dialog.Scrim");
  if (!d.open) return null;
  return renderPart("div", asChild, mergeProps(d.scrimProps, props));
}

/** Props of `Dialog.Panel`: a div's. Drawn only while open. */
export type DialogPanelProps = ComponentPropsWithRef<"div"> & AsChild;

function DialogPanel({ asChild, ref, ...props }: DialogPanelProps) {
  const d = useDialogContext("Dialog.Panel");
  const { ref: ours, ...panel } = d.panelProps;
  const refs = useComposedRefs<HTMLElement>(ours, ref as RefObject<HTMLElement | null>);
  if (!d.open) return null;
  return renderPart("div", asChild, { ...mergeProps(panel, props), ref: refs });
}

/** Props of `Dialog.Title`: a heading's (`h2`). It names the dialog. */
export type DialogTitleProps = ComponentPropsWithRef<"h2"> & AsChild;

function DialogTitle({ asChild, ref, ...props }: DialogTitleProps) {
  const d = useDialogContext("Dialog.Title");
  const { ref: ours, ...title } = d.titleProps;
  const refs = useComposedRefs<HTMLElement>(ours, ref as Ref<HTMLElement> | undefined);
  return renderPart("h2", asChild, { ...mergeProps(title, props), ref: refs });
}

/** Props of `Dialog.Description`: a paragraph's. Mounting it describes the dialog. */
export type DialogDescriptionProps = ComponentPropsWithRef<"p"> & AsChild;

function DialogDescription({ asChild, ...props }: DialogDescriptionProps) {
  const d = useDialogContext("Dialog.Description");
  const { setDescribed } = d;
  useEffect(() => {
    setDescribed(true);
    return () => setDescribed(false);
  }, [setDescribed]);
  return renderPart("p", asChild, mergeProps(d.descriptionProps, props));
}

/** Props of `Dialog.Close`: a button's; its words are its children. */
export type DialogCloseProps = ComponentPropsWithRef<"button"> & AsChild;

function DialogClose({ asChild, ...props }: DialogCloseProps) {
  const d = useDialogContext("Dialog.Close");
  return renderPart("button", asChild, mergeProps(d.closeProps, props));
}

/**
 * A dialog as parts: `Root` holds the state, `Trigger` opens it, `Scrim` and `Panel` draw only while open, `Title`
 * names it, `Description` describes it, `Close` closes it. State is on `data-state` ("open" | "closed"); put the scrim
 * and panel in a `Portal` and pass the page root as `inertTarget` for a true modal.
 */
export const Dialog = {
  Root: DialogRoot,
  Trigger: DialogTrigger,
  Scrim: DialogScrim,
  Panel: DialogPanel,
  Title: DialogTitle,
  Description: DialogDescription,
  Close: DialogClose,
};

/** The open state of the nearest `Dialog.Root`, for a part the game writes itself. */
export function useDialogState(): Pick<DialogApi, "open" | "setOpen" | "modal"> {
  const { open, setOpen, modal } = useDialogContext("useDialogState");
  return useMemo(() => ({ open, setOpen, modal }), [open, setOpen, modal]);
}
