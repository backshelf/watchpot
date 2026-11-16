import { type BuyAmountOption, type BuyMode, cx, BuyAmount as Modes } from "watchpot/ui";
import s from "./BuyAmount.module.css";

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
