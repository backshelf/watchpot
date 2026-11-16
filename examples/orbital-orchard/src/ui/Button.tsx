import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx, VisuallyHidden } from "watchpot/ui";
import s from "./Button.module.css";

/**
 * How loud a button is: one `primary` per screen (the signal block), `paper` for every secondary (the grey block),
 * `ghost` for the quiet (words in a box ruled in the control's edge), `danger` (words alone in red).
 */
export type ButtonVariant = "primary" | "paper" | "ghost" | "danger";

/** Props of `Button`: a native button's, its variant and size, and an optional price. */
export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  /** Default "ghost". */
  variant?: ButtonVariant;
  /** "regular" hugs its words; "large" fills its row, the words left and the price right. */
  size?: "regular" | "large";
  /** A formatted price after the words ("1.20K"), in the number face. */
  cost?: ReactNode;
  /** The currency's glyph before the price, in the words' ink. */
  glyph?: ReactNode;
  /** A word drawn after the price ("shards"). */
  unit?: string;
  /** With a `glyph` and no `unit`: the currency's word, said after the price to assistive tech alone ("seeds"). */
  currencyWord?: string;
}

/**
 * A flat block you press: the words (children), and a price when there is one. The press drops it a pixel and a
 * step darker; the release springs it back. `data-variant` and `data-size` style it.
 */
export function Button({
  variant = "ghost",
  size = "regular",
  cost,
  glyph,
  unit,
  currencyWord,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const priced = cost !== undefined && cost !== null;
  return (
    <button
      {...props}
      type={type}
      className={cx(s.button, className)}
      data-variant={variant}
      data-size={size}
      data-priced={priced ? "" : undefined}
    >
      <span className={s.label}>{children}</span>
      {priced && (
        <span className={s.cost}>
          {glyph !== undefined && (
            <span className={s.glyph} aria-hidden="true">
              {glyph}
            </span>
          )}
          <span className={s.figure}>{cost}</span>
          {unit ? <span className={s.unit}> {unit}</span> : null}
          {!unit && glyph !== undefined && currencyWord ? (
            <VisuallyHidden> {currencyWord}</VisuallyHidden>
          ) : null}
        </span>
      )}
    </button>
  );
}
