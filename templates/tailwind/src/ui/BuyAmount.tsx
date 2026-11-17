import { type BuyAmountOption, type BuyMode, cx, BuyAmount as Modes } from "watchpot/ui";

// The look: Tailwind utilities over the --ui-* tokens (theme.css), where the CSS module was.
const s = {
  modes: "inline-flex p-0.5 gap-0.5 border border-ui-line rounded-ui bg-ui-sunken",
  option:
    "min-w-11 min-h-8 px-2.5 border-0 rounded-ui bg-transparent text-ui-ink-muted font-ui-num text-[13px] font-semibold cursor-pointer data-[state=checked]:bg-ui-surface data-[state=checked]:text-ui-ink",
};

/** Props of `BuyAmount`: the modes, the chosen one, the change, and the group's name. */
export interface BuyAmountProps<T extends BuyMode> {
  /** The modes, each with what it draws ("×1", "×10", "Max"): the game's words. */
  options: readonly BuyAmountOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** The radio group's accessible name. */
  label: string;
  className?: string;
}

/** The buy-mode switch on `BuyAmount`: a segmented radio group, one tab stop, arrows move and select. */
export function BuyAmount<T extends BuyMode>({
  options,
  value,
  onChange,
  label,
  className,
}: BuyAmountProps<T>) {
  return (
    <Modes
      aria-label={label}
      className={cx(s.modes, className)}
      options={options}
      value={value}
      onValueChange={onChange}
      optionProps={() => ({ className: s.option })}
    />
  );
}
