// The small controls: words for assistive tech alone, a disclosure, a toggle button and a switch.
import { type ComponentPropsWithRef, type CSSProperties, type ReactNode, useId } from "react";
import { useControllable } from "./hooks";
import { partContext } from "./portal";
import { type AsChild, mergeProps, renderPart } from "./slot";

/**
 * The one inline style in the entry that is behaviour: text kept in the accessibility tree and off the screen. The
 * standard clip pattern; `display: none` or `hidden` would hide it from screen readers too.
 */
const HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/** Props of `VisuallyHidden`: a span's. */
export type VisuallyHiddenProps = ComponentPropsWithRef<"span">;

/** Words a screen reader says and the screen does not show (a count's meaning, a state). */
export function VisuallyHidden({ style, ...props }: VisuallyHiddenProps) {
  return <span {...props} style={{ ...HIDDEN, ...style }} />;
}

// ---------------------------------------------------------------------------------------------------------------
// Disclosure

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
export function useDisclosure(options: DisclosureOptions = {}): DisclosureApi {
  const [open, setOpen] = useControllable(options.open, options.defaultOpen ?? false, options.onOpenChange);
  const id = useId();
  const state = open ? "open" : "closed";
  return {
    open,
    setOpen,
    triggerProps: {
      type: "button",
      "aria-expanded": open,
      "aria-controls": id,
      "data-state": state,
      onClick: () => setOpen(!open),
    },
    panelProps: { id, hidden: !open, "data-state": state },
  };
}

const [DisclosureProvider, useDisclosureContext] = partContext<DisclosureApi>("Disclosure.Root");

/** Props of `Disclosure.Root`: the open state and the parts. */
export interface DisclosureRootProps extends DisclosureOptions {
  children?: ReactNode;
}

function DisclosureRoot({ children, ...options }: DisclosureRootProps) {
  return <DisclosureProvider value={useDisclosure(options)}>{children}</DisclosureProvider>;
}

/** Props of `Disclosure.Trigger`: a button's. */
export type DisclosureTriggerProps = ComponentPropsWithRef<"button"> & AsChild;

function DisclosureTrigger({ asChild, ...props }: DisclosureTriggerProps) {
  return renderPart(
    "button",
    asChild,
    mergeProps(useDisclosureContext("Disclosure.Trigger").triggerProps, props),
  );
}

/** Props of `Disclosure.Panel`: a div's. It stays mounted, `hidden` while closed. */
export type DisclosurePanelProps = ComponentPropsWithRef<"div"> & AsChild;

function DisclosurePanel({ asChild, ...props }: DisclosurePanelProps) {
  return renderPart("div", asChild, mergeProps(useDisclosureContext("Disclosure.Panel").panelProps, props));
}

/** A button that shows and hides a region: `Root`, `Trigger`, `Panel`, with `data-state` on both. */
export const Disclosure = { Root: DisclosureRoot, Trigger: DisclosureTrigger, Panel: DisclosurePanel };

// ---------------------------------------------------------------------------------------------------------------
// Toggle and Switch

/** Props of `Toggle`: a button's, with its pressed state. */
export interface ToggleProps extends Omit<ComponentPropsWithRef<"button">, "onChange">, AsChild {
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
}

/** A button that stays pressed (`aria-pressed`, `data-state` "on" | "off"): auto-buy on, a filter, a mute. */
export function Toggle({ pressed, defaultPressed = false, onPressedChange, asChild, ...props }: ToggleProps) {
  const [on, setOn] = useControllable(pressed, defaultPressed, onPressedChange);
  return renderPart(
    "button",
    asChild,
    mergeProps(
      {
        type: "button",
        "aria-pressed": on,
        "data-state": on ? "on" : "off",
        "data-disabled": props.disabled ? "" : undefined,
        onClick: () => setOn(!on),
      },
      props,
    ),
  );
}

/** Props of `Switch`: a button's, with its checked state. */
export interface SwitchProps extends Omit<ComponentPropsWithRef<"button">, "onChange">, AsChild {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

/** An on/off setting (`role="switch"`, `aria-checked`, `data-state` "checked" | "unchecked"). Name it by its label. */
export function Switch({ checked, defaultChecked = false, onCheckedChange, asChild, ...props }: SwitchProps) {
  const [on, setOn] = useControllable(checked, defaultChecked, onCheckedChange);
  return renderPart(
    "button",
    asChild,
    mergeProps(
      {
        type: "button",
        role: "switch",
        "aria-checked": on,
        "data-state": on ? "checked" : "unchecked",
        "data-disabled": props.disabled ? "" : undefined,
        onClick: () => setOn(!on),
      },
      props,
    ),
  );
}
