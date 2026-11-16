import { cx, VisuallyHidden } from "watchpot/ui";
import type { ComponentPropsWithRef, ReactNode } from "react";
import s from "./Button.module.css";

/** How loud a button is: one `primary` per screen, `secondary` for the rest, `ghost` for the quiet, `danger`. */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/** Props of `Button`: a native button's, its variant and size, and an optional price. */
export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  /** Default "secondary". */
  variant?: ButtonVariant;
  /** "regular" hugs its words; "large" fills its row, the words left and the price right. */
  size?: "regular" | "large";
  /** A formatted price after the words ("1.20K"), in the number face. */
  cost?: ReactNode;
  /** The currency's glyph before the price. */
  glyph?: ReactNode;
  /** What the price counts, said after it to assistive tech alone ("spores"). */
  unit?: string;
}

/** A button: the words (children), and a price when there is one. `data-variant` and `data-size` style it. */
export function Button({
  variant = "secondary",
  size = "regular",
  cost,
  glyph,
  unit,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cx(s.button, className)}
      data-variant={variant}
      data-size={size}
    >
      <span className={s.label}>{children}</span>
      {cost !== undefined && cost !== null && (
        <span className={s.cost}>
          {glyph}
          <span className={s.figure}>{cost}</span>
          {unit && <VisuallyHidden> {unit}</VisuallyHidden>}
        </span>
      )}
    </button>
  );
}
