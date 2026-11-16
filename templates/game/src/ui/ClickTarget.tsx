// @feature clicker
import { cx, FloatingNumbers, Pressable, type PressInfo, useFloatingNumbers } from "watchpot/ui";
import type { ReactNode } from "react";
import s from "./ClickTarget.module.css";

/** Props of `ClickTarget`: the press, what floats up from it, its accessible name and what it shows. */
export interface ClickTargetProps {
  /** One press, with where it landed. Return what floats up from that point ("+12"), or null for nothing. */
  onPress: (press: PressInfo) => ReactNode | null;
  /** The button's accessible name, in the game's words, when its picture does not say it. */
  label?: string;
  disabled?: boolean;
  className?: string;
  /** What the target looks like: a picture, a word. */
  children: ReactNode;
}

/**
 * A clicker's target on `Pressable`: one press per pointer, finger or key (`data-pressed` while held), and the
 * figures each press returns floating up from where it landed (`FloatingNumbers`, gone when their animation ends).
 */
export function ClickTarget({ onPress, label, disabled, className, children }: ClickTargetProps) {
  const floats = useFloatingNumbers();
  return (
    <div className={cx(s.target, className)}>
      <Pressable
        className={s.press}
        aria-label={label}
        disabled={disabled}
        onPress={(press) => {
          const node = onPress(press);
          if (node !== null && node !== undefined) floats.spawn({ x: press.x, y: press.y, node });
        }}
      >
        {children}
      </Pressable>
      <FloatingNumbers floats={floats} className={s.floats} />
    </div>
  );
}
