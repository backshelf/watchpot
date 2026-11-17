// @feature clicker
import { cx, FloatingNumbers, Pressable, type PressInfo, useFloatingNumbers } from "watchpot/ui";
import type { ReactNode } from "react";

// The look: Tailwind utilities over the --ui-* tokens (theme.css), where the CSS module was. A float rises and fades
// on its own keyframes (`animate-float`), so no opacity or transform utility sits on it.
const s = {
  target: "relative inline-grid",
  press:
    "grid place-items-center min-w-[120px] min-h-[120px] p-4 border border-ui-line rounded-ui bg-ui-surface cursor-pointer touch-manipulation select-none [transition:scale_var(--ui-duration)_ease-out] data-[pressed]:scale-[0.96]",
  // Each float is placed at its press (`left`/`top` inline) and rises as it fades; it goes when this ends.
  floats:
    "absolute inset-0 pointer-events-none [&>[data-float]]:[translate:-50%_-50%] [&>[data-float]]:text-ui-accent [&>[data-float]]:font-ui-num [&>[data-float]]:font-bold [&>[data-float]]:whitespace-nowrap [&>[data-float]]:animate-float",
};

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
