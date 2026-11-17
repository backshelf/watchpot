import { cx, VisuallyHidden } from "watchpot/ui";
import type { ComponentPropsWithRef, ReactNode } from "react";

// The look: Tailwind utilities over the --ui-* tokens (theme.css), where the CSS module was. The variant and size
// are the `data-variant` and `data-size` the component sets: each override is scoped to its own state.
const s = {
  button:
    "inline-flex items-center justify-center gap-[0.5em] min-h-10 px-3.5 border border-ui-line rounded-ui bg-ui-surface text-ui-ink font-semibold leading-none cursor-pointer [transition:background-color_var(--ui-duration)_ease-out,border-color_var(--ui-duration)_ease-out] hover:not-disabled:border-ui-ink-muted active:not-disabled:bg-ui-sunken disabled:cursor-not-allowed disabled:opacity-50 data-[variant=primary]:border-ui-accent data-[variant=primary]:bg-ui-accent data-[variant=primary]:text-ui-on-accent data-[variant=primary]:active:not-disabled:brightness-[0.92] data-[variant=ghost]:border-transparent data-[variant=ghost]:bg-transparent data-[variant=danger]:border-ui-danger data-[variant=danger]:text-ui-danger data-[size=large]:w-full data-[size=large]:min-h-12 data-[size=large]:justify-between data-[size=large]:px-4",
  // The words stay on one line.
  label: "whitespace-nowrap",
  cost: "inline-flex items-center gap-1",
  figure: "font-ui-num tabular-nums",
};

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
