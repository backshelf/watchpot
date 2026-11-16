import { cx, Dialog, Portal, useConfirmPress } from "watchpot/ui";
import type { ReactNode } from "react";
import { Button, type ButtonVariant } from "./Button";
import { usePageRoot } from "./pageRoot";
import s from "./Sheet.module.css";

/** Props of `Sheet`: its title, an optional line under it, the body, the actions row and the close. */
export interface SheetProps {
  /** The sheet's name: its heading, and what the dialog is called. */
  title: ReactNode;
  /** One line under the title; it describes the dialog. */
  description?: ReactNode;
  /** Escape, the scrim, and any close the game wires: the sheet is drawn only while its caller wants it. */
  onClose: () => void;
  /** The row at the foot: the sheet's buttons. */
  actions?: ReactNode;
  /** "centre" (default) is a dialog in the middle; "bottom" docks to the foot of the page and rises. */
  placement?: "centre" | "bottom";
  className?: string;
  children?: ReactNode;
}

/**
 * A modal sheet on `Dialog`: portalled to the body, the page behind it inert, focus held inside and given back to
 * what opened it, Escape and the scrim close it. Render it while it is open (a `SheetOutlet` does).
 */
export function Sheet({
  title,
  description,
  onClose,
  actions,
  placement = "centre",
  className,
  children,
}: SheetProps) {
  const page = usePageRoot();
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      inertTarget={page}
    >
      <Portal>
        <Dialog.Scrim className={s.scrim} data-placement={placement} />
        <Dialog.Panel className={cx(s.sheet, className)} data-placement={placement}>
          <div className={s.head}>
            <Dialog.Title className={s.title}>{title}</Dialog.Title>
            {description !== undefined && (
              <Dialog.Description className={s.description}>{description}</Dialog.Description>
            )}
          </div>
          {children !== undefined && <div className={s.body}>{children}</div>}
          {actions !== undefined && <div className={s.actions}>{actions}</div>}
        </Dialog.Panel>
      </Portal>
    </Dialog.Root>
  );
}

/** Props of `ConfirmButton`: what fires on the second press, the look, and the words for each state. */
export interface ConfirmButtonProps {
  onConfirm: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** The words, given whether the first press has armed it ("Start over", then "Press again to start over"). */
  children: (armed: boolean) => ReactNode;
  className?: string;
}

/**
 * A two-press button on `useConfirmPress`, for a spend or a loss that cannot be undone: the first press arms it
 * (`data-armed`), the second fires; blur, Escape and a timeout disarm it.
 */
export function ConfirmButton({
  onConfirm,
  variant = "danger",
  disabled,
  children,
  className,
}: ConfirmButtonProps) {
  const { armed, buttonProps } = useConfirmPress({ onConfirm, disabled });
  return (
    <Button {...buttonProps} variant={variant} disabled={disabled} className={className}>
      {children(armed)}
    </Button>
  );
}
