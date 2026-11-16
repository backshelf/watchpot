// The two-press confirm: the first press arms, the second fires. What a game puts on a spend it cannot undo.
import {
  type ComponentPropsWithRef,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLatest } from "./hooks";
import { type AsChild, mergeProps, renderPart } from "./slot";

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
export function useConfirmPress(options: ConfirmPressOptions): ConfirmPressApi {
  const { timeout = 4000, disabled = false } = options;
  const [armed, setArmed] = useState(false);
  const latest = useLatest(options);

  // Told after the change commits, once per change.
  const told = useRef(false);
  useEffect(() => {
    if (told.current === armed) return;
    told.current = armed;
    latest.current.onArmedChange?.(armed);
  }, [armed, latest]);

  useEffect(() => {
    if (!armed || timeout <= 0) return;
    const id = setTimeout(() => setArmed(false), timeout);
    return () => clearTimeout(id);
  }, [armed, timeout]);

  useEffect(() => {
    if (disabled) setArmed(false);
  }, [disabled]);

  return {
    armed,
    disarm: () => setArmed(false),
    buttonProps: {
      type: "button",
      "data-armed": armed ? "" : undefined,
      onClick: () => {
        if (disabled) return;
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        latest.current.onConfirm();
      },
      onBlur: () => setArmed(false),
      onKeyDown: (event) => {
        // The browser clicks a button on every repeat of a held Enter: none of them count.
        if (event.key === "Enter" && event.repeat) {
          event.preventDefault();
          return;
        }
        // Escape disarms and goes no further: a dialog around it stays open.
        if (event.key === "Escape" && armed) {
          event.preventDefault();
          event.stopPropagation();
          setArmed(false);
        }
      },
    },
  };
}

/** Props of `ConfirmPress`: a button's, the hook's options, and children that may read the armed state. */
export interface ConfirmPressProps
  extends Omit<ComponentPropsWithRef<"button">, "children">,
    Omit<ConfirmPressOptions, "disabled">,
    AsChild {
  /** The words, which should change once armed ("Buy" then "Press again to buy"): the game's. */
  children?: ReactNode | ((armed: boolean) => ReactNode);
}

/** A button that arms on the first press and fires `onConfirm` on the second; `data-armed` while armed. */
export function ConfirmPress({
  onConfirm,
  onArmedChange,
  timeout,
  disabled,
  children,
  asChild,
  ...props
}: ConfirmPressProps) {
  const { armed, buttonProps } = useConfirmPress({ onConfirm, onArmedChange, timeout, disabled });
  const content = typeof children === "function" ? children(armed) : children;
  return renderPart("button", asChild, {
    ...mergeProps(buttonProps, props),
    disabled,
    children: content,
  });
}
