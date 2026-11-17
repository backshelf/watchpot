import { cx, VisuallyHidden } from "watchpot/ui";
import type { ReactNode } from "react";

// The look: Tailwind utilities over the --ui-* tokens (theme.css), where the CSS module was. The pill swells on its
// landing (`data-bump`, the currency flight's), on the keyframes `animate-bump` names in theme.css.
const s = {
  pill:
    "inline-flex items-center gap-1.5 min-h-8 px-2.5 box-border border border-ui-line rounded-ui bg-ui-surface whitespace-nowrap data-[bump]:animate-bump",
  glyph: "inline-flex text-ui-ink-muted",
  amount: "font-ui-num text-[14px] font-medium tabular-nums",
};

/** Props of `CurrencyPill`: which currency, its glyph, its balance and its word. */
export interface CurrencyPillProps {
  /** `data-pill`: what the kit's currency flight lands on (`[data-pill="<id>"]`) and bumps (`data-bump`). */
  id: string;
  glyph?: ReactNode;
  /** The balance, formatted ("12.4K"), or a live ticker in its place. */
  amount: ReactNode;
  /** The currency's word, said after the balance to assistive tech. */
  word: string;
  className?: string;
}

/** A balance in the header: the glyph, the figure in the number face, the word for assistive tech. */
export function CurrencyPill({ id, glyph, amount, word, className }: CurrencyPillProps) {
  return (
    <span className={cx(s.pill, className)} data-pill={id}>
      {glyph && (
        <span className={s.glyph} aria-hidden="true">
          {glyph}
        </span>
      )}
      <span className={s.amount}>{amount}</span>
      <VisuallyHidden> {word}</VisuallyHidden>
    </span>
  );
}
