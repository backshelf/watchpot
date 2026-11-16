// Floating text and panels: `Tooltip` (hover or focus, describes its trigger) and `Popover` (press to open, a
// non-modal dialog that takes focus). Both are placed by `usePlacement` and animate nothing.
import {
  type ComponentPropsWithRef,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
} from "react";
import { focusWithoutScroll } from "./focus";
import { useControllable, useEscape, useFocusTrap } from "./hooks";
import { partContext } from "./portal";
import { type PlaceOptions, usePlacement } from "./position";
import { type AsChild, mergeProps, type PartRef, renderPart, useComposedRefs, usePartRef } from "./slot";

/** Calls `fn` after `ms`, cancelling any call still pending; `cancel` drops it. Cleared on unmount. */
function useTimer() {
  const id = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (id.current !== null) clearTimeout(id.current);
    id.current = null;
  }, []);
  const start = useCallback(
    (ms: number, fn: () => void) => {
      cancel();
      if (ms <= 0) fn();
      else id.current = setTimeout(fn, ms);
    },
    [cancel],
  );
  useEffect(() => cancel, [cancel]);
  return { start, cancel };
}

// ---------------------------------------------------------------------------------------------------------------
// Tooltip

/** Options of `useTooltip`: open state, timing, touch behaviour and placement. */
export interface TooltipOptions extends PlaceOptions {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hover delay before it opens, ms. Focus opens at once. Default 500. */
  delay?: number;
  /** Delay before it closes after the pointer leaves, so the pointer can cross into it. Default 150. */
  closeDelay?: number;
  /** A touch opens it by press-and-hold (default) or toggles it with a tap. */
  touch?: "hold" | "tap";
  /** How long a touch holds before it opens, ms. Default 500. */
  holdDelay?: number;
  disabled?: boolean;
}

/** What `useTooltip` hands back: the state and the trigger's and content's props. */
export interface TooltipApi {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerProps: Record<string, unknown> & { ref: PartRef };
  contentProps: Record<string, unknown> & { ref: PartRef };
}

/**
 * A tooltip's behaviour on the game's own markup. The content stays mounted (`hidden` while closed), so the
 * trigger's `aria-describedby` always reaches its words; hover opens after `delay`, focus at once, Escape closes,
 * the pointer may cross into it, and a touch holds (or taps) to open.
 */
export function useTooltip(options: TooltipOptions = {}): TooltipApi {
  const { delay = 500, closeDelay = 150, touch = "hold", holdDelay = 500, disabled = false } = options;
  const [open, setOpenState] = useControllable(
    options.open,
    options.defaultOpen ?? false,
    options.onOpenChange,
  );
  const setOpen = useCallback((next: boolean) => setOpenState(next && !disabled), [setOpenState, disabled]);
  const id = useId();
  const trigger = useRef<HTMLElement>(null);
  const content = useRef<HTMLElement>(null);
  const triggerPart = usePartRef(trigger);
  const contentPart = usePartRef(content);
  const timer = useTimer();
  // A touch fires focus and click after it: those must not open or toggle a second time.
  const touching = useRef(false);
  const placement = usePlacement(() => trigger.current, content, open, options);

  useEscape(() => setOpen(false), open);

  // A tap elsewhere closes a touch-opened tooltip.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const away = (event: Event) => {
      const t = event.target as Node;
      if (!trigger.current?.contains(t) && !content.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open, setOpen]);

  const state = open ? "open" : "closed";
  return {
    open,
    setOpen,
    triggerProps: {
      ref: triggerPart,
      "aria-describedby": id,
      "data-state": state,
      onPointerEnter: (event: PointerEvent) => {
        if (event.pointerType === "touch") return;
        timer.start(delay, () => setOpen(true));
      },
      onPointerLeave: (event: PointerEvent) => {
        if (event.pointerType === "touch") return;
        timer.start(closeDelay, () => setOpen(false));
      },
      onPointerDown: (event: PointerEvent) => {
        if (event.pointerType !== "touch") {
          // A press on the trigger is about the trigger: the tooltip gets out of the way.
          timer.cancel();
          setOpen(false);
          return;
        }
        touching.current = true;
        if (touch === "hold") timer.start(holdDelay, () => setOpen(true));
      },
      onPointerUp: (event: PointerEvent) => {
        if (event.pointerType === "touch" && touch === "hold") timer.cancel();
      },
      onClick: () => {
        if (touching.current && touch === "tap") setOpen(!open);
        touching.current = false;
      },
      onFocus: () => {
        if (touching.current) return;
        timer.cancel();
        setOpen(true);
      },
      onBlur: () => {
        timer.cancel();
        setOpen(false);
      },
    },
    contentProps: {
      ref: contentPart,
      id,
      role: "tooltip",
      hidden: !open,
      style: placement.style,
      "data-state": state,
      "data-side": placement.side,
      "data-align": placement.align,
      // The pointer can move onto the words (WCAG 1.4.13): crossing in cancels the close.
      onPointerEnter: () => timer.cancel(),
      onPointerLeave: () => timer.start(closeDelay, () => setOpen(false)),
    },
  };
}

const [TooltipProvider, useTooltipContext] = partContext<TooltipApi>("Tooltip.Root");

/** Props of `Tooltip.Root`: the `useTooltip` options and the parts. */
export interface TooltipRootProps extends TooltipOptions {
  children?: ReactNode;
}

function TooltipRoot({ children, ...options }: TooltipRootProps) {
  return <TooltipProvider value={useTooltip(options)}>{children}</TooltipProvider>;
}

/** Props of `Tooltip.Trigger`: a button's (or the game's own element with `asChild`). */
export type TooltipTriggerProps = ComponentPropsWithRef<"button"> & AsChild;

function TooltipTrigger({ asChild, ref, ...props }: TooltipTriggerProps) {
  const { ref: ours, ...trigger } = useTooltipContext("Tooltip.Trigger").triggerProps;
  const refs = useComposedRefs<HTMLElement>(ours, ref as never);
  return renderPart("button", asChild, {
    type: asChild ? undefined : "button",
    ...mergeProps(trigger, props),
    ref: refs,
  });
}

/** Props of `Tooltip.Content`: a div's. Placed with a fixed position; wrap it in a `Portal` to escape clipping. */
export type TooltipContentProps = ComponentPropsWithRef<"div"> & AsChild;

function TooltipContent({ asChild, ref, style, ...props }: TooltipContentProps) {
  const { ref: ours, style: placed, ...content } = useTooltipContext("Tooltip.Content").contentProps;
  const refs = useComposedRefs<HTMLElement>(ours, ref as never);
  return renderPart("div", asChild, {
    ...mergeProps(content, props),
    style: { ...style, ...(placed as object) },
    ref: refs,
  });
}

/**
 * A tooltip (WAI-ARIA tooltip): `Trigger` is described by `Content`. `data-state` ("open" | "closed"), `data-side`
 * and `data-align` style it; it never holds anything interactive (that is a `Popover`).
 */
export const Tooltip = { Root: TooltipRoot, Trigger: TooltipTrigger, Content: TooltipContent };

// ---------------------------------------------------------------------------------------------------------------
// Popover

/** Options of `usePopover`: open state and placement. */
export interface PopoverOptions extends PlaceOptions {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Where focus lands on open: this element, else the first control, else the panel. */
  initialFocus?: RefObject<HTMLElement | null> | false;
}

/** What `usePopover` hands back: the state, a close that can return focus, and the parts' props. */
export interface PopoverApi {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Closes; with `returnFocus`, focus goes back to the trigger (Escape and the Close part do this). */
  close: (returnFocus?: boolean) => void;
  triggerProps: Record<string, unknown> & { ref: PartRef };
  contentProps: Record<string, unknown> & { ref: PartRef };
}

/**
 * A popover's behaviour: the trigger toggles it; it opens as a non-modal dialog that takes focus; Escape closes it
 * back to the trigger; a press outside or focus leaving closes it where the player went.
 */
export function usePopover(options: PopoverOptions = {}): PopoverApi {
  const [open, setOpen] = useControllable(options.open, options.defaultOpen ?? false, options.onOpenChange);
  const id = useId();
  const trigger = useRef<HTMLElement>(null);
  const content = useRef<HTMLElement>(null);
  const triggerPart = usePartRef(trigger);
  const contentPart = usePartRef(content);
  const placement = usePlacement(() => trigger.current, content, open, {
    side: "bottom",
    align: "start",
    ...options,
  });
  useFocusTrap(content, { enabled: open, initialFocus: options.initialFocus, contain: false });

  const close = useCallback(
    (returnFocus = false) => {
      setOpen(false);
      if (returnFocus) focusWithoutScroll(trigger.current);
    },
    [setOpen],
  );
  useEscape(() => close(true), open);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const away = (event: Event) => {
      const t = event.target as Node;
      if (!trigger.current?.contains(t) && !content.current?.contains(t)) close(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open, close]);

  const state = open ? "open" : "closed";
  return {
    open,
    setOpen,
    close,
    triggerProps: {
      ref: triggerPart,
      type: "button",
      "aria-haspopup": "dialog",
      "aria-expanded": open,
      "aria-controls": open ? id : undefined,
      "data-state": state,
      onClick: () => setOpen(!open),
    },
    contentProps: {
      ref: contentPart,
      id,
      role: "dialog",
      tabIndex: -1,
      style: placement.style,
      "data-state": state,
      "data-side": placement.side,
      "data-align": placement.align,
      onBlur: (event: FocusEvent) => {
        const to = event.relatedTarget as Node | null;
        if (to && !content.current?.contains(to) && !trigger.current?.contains(to)) close(false);
      },
    },
  };
}

const [PopoverProvider, usePopoverContext] = partContext<PopoverApi>("Popover.Root");

/** Props of `Popover.Root`: the `usePopover` options and the parts. */
export interface PopoverRootProps extends PopoverOptions {
  children?: ReactNode;
}

function PopoverRoot({ children, ...options }: PopoverRootProps) {
  return <PopoverProvider value={usePopover(options)}>{children}</PopoverProvider>;
}

/** Props of `Popover.Trigger`: a button's. */
export type PopoverTriggerProps = ComponentPropsWithRef<"button"> & AsChild;

function PopoverTrigger({ asChild, ref, ...props }: PopoverTriggerProps) {
  const { ref: ours, ...trigger } = usePopoverContext("Popover.Trigger").triggerProps;
  const refs = useComposedRefs<HTMLElement>(ours, ref as never);
  return renderPart("button", asChild, { ...mergeProps(trigger, props), ref: refs });
}

/** Props of `Popover.Content`: a div's (name it with `aria-label`). Drawn only while open. */
export type PopoverContentProps = ComponentPropsWithRef<"div"> & AsChild;

function PopoverContent({ asChild, ref, style, ...props }: PopoverContentProps) {
  const p = usePopoverContext("Popover.Content");
  const { ref: ours, style: placed, ...content } = p.contentProps;
  const refs = useComposedRefs<HTMLElement>(ours, ref as never);
  if (!p.open) return null;
  return renderPart("div", asChild, {
    ...mergeProps(content, props),
    style: { ...style, ...(placed as object) },
    ref: refs,
  });
}

/** Props of `Popover.Close`: a button's. */
export type PopoverCloseProps = ComponentPropsWithRef<"button"> & AsChild;

function PopoverClose({ asChild, ...props }: PopoverCloseProps) {
  const p = usePopoverContext("Popover.Close");
  return renderPart("button", asChild, mergeProps({ type: "button", onClick: () => p.close(true) }, props));
}

/**
 * A press-to-open panel (a non-modal dialog): `Trigger` toggles `Content`, which takes focus; `Close` and Escape
 * return focus to the trigger. `data-state`, `data-side` and `data-align` style it.
 */
export const Popover = {
  Root: PopoverRoot,
  Trigger: PopoverTrigger,
  Content: PopoverContent,
  Close: PopoverClose,
};
