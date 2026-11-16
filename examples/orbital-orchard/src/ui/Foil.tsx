import { cx } from "watchpot/ui";
import s from "./Foil.module.css";

/** Props of `Foil`: a class to place it, and the angle its stripes run at. */
export interface FoilProps {
  className?: string;
  /** Added to the stripes' 122deg; default 0. */
  angle?: number;
}

/**
 * The top rung's foil: hard stripes of the five foil stops under a 4 by 4 ordered-dither mask, filling its nearest
 * positioned ancestor. Decorative; the caller places or frames it with its own class (never the same property).
 */
export function Foil({ className, angle = 0 }: FoilProps) {
  return (
    <span className={cx(s.foil, className)} style={{ "--foil-ang": `${angle}deg` }} aria-hidden="true" />
  );
}
