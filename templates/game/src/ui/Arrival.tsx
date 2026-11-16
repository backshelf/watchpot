// @feature visitor
import { cx, Pressable } from "watchpot/ui";
import type { ReactNode } from "react";
import s from "./Arrival.module.css";

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
