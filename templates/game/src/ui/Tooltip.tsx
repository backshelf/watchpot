import { cx, Portal, type Side, Tooltip as Tip } from "watchpot/ui";
import type { ReactElement, ReactNode } from "react";
import s from "./Tooltip.module.css";

/** Props of `Tooltip`: the words it shows, the element it describes, and where it prefers to stand. */
export interface TooltipProps {
  /** The tooltip's words. Nothing interactive: a control in a bubble is a popover. */
  content: ReactNode;
  /** The one element it describes; it takes the trigger's behaviour (hover, focus, a touch hold). */
  children: ReactElement;
  side?: Side;
  className?: string;
}

/** A tooltip on `Tooltip`: portalled out of any clipping, flipped and shifted to stay on screen. */
export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  return (
    <Tip.Root side={side}>
      <Tip.Trigger asChild>{children}</Tip.Trigger>
      <Portal>
        <Tip.Content className={cx(s.tip, className)}>{content}</Tip.Content>
      </Portal>
    </Tip.Root>
  );
}
