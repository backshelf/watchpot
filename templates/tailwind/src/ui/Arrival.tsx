// @feature visitor
import { cx, Pressable } from "watchpot/ui";
import type { ReactNode } from "react";

// The look: Tailwind utilities over the --ui-* tokens (theme.css), where the CSS module was. The arrival's own
// keyframes (`animate-arrival`) move its opacity and scale, so no opacity or transform utility sits on it.
const s = {
  // The layer covers the page and lets presses through; only the arrival itself takes them.
  layer: "fixed inset-0 z-20 pointer-events-none",
  arrival:
    "absolute left-[calc(var(--x)*100%)] top-[calc(var(--y)*100%)] grid place-items-center size-16 -mt-8 -ml-8 p-0 border border-ui-line rounded-full bg-ui-surface text-ui-ink cursor-pointer pointer-events-auto touch-manipulation animate-arrival data-[pressed]:scale-[0.92]",
  // The stay left, as a ring of the accent that empties clockwise.
  ring: "absolute -inset-[5px] rounded-full bg-[conic-gradient(var(--ui-accent)_calc(var(--life)*360deg),transparent_0)] [mask:radial-gradient(farthest-side,transparent_calc(100%_-_3px),var(--ui-ink)_calc(100%_-_2px))]",
  picture: "grid place-items-center",
};

/** Props of `Arrival`: where it sits, how much of its life is left, the catch, its name and its picture. */
export interface ArrivalProps {
  /** Where it sits: 0..1 across and down the page. */
  at: { x: number; y: number };
  /** 0..1 of its stay left: the ring around it empties as it runs out (`--life`). */
  life: number;
  onCatch: () => void;
  /** The button's accessible name, in the game's words ("Catch the woodlouse"). */
  label: string;
  /** What it looks like. */
  children: ReactNode;
  className?: string;
}

/**
 * Something that turns up over the page and can be caught (a spawn): a button placed by `at` on a layer that lets
 * every other press through, one press per pointer or key (`Pressable`), with a ring that empties as its stay runs
 * out. It bobs while it waits; reduced motion stills that.
 */
export function Arrival({ at, life, onCatch, label, children, className }: ArrivalProps) {
  const left = Math.min(1, Math.max(0, life));
  return (
    <div className={cx(s.layer, className)}>
      <Pressable
        className={s.arrival}
        style={{ "--x": at.x, "--y": at.y, "--life": left }}
        aria-label={label}
        onPress={() => onCatch()}
      >
        <span className={s.ring} aria-hidden="true" />
        <span className={s.picture}>{children}</span>
      </Pressable>
    </div>
  );
}
