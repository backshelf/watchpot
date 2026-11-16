import { isTopTier, type RarityTier, tierInk, tierLabel } from "watchpot/kit";
import { cx } from "watchpot/ui";
import { Foil } from "./Foil";
import s from "./RarityChip.module.css";

/** Props of `RarityChip`: the rung it names. */
export interface RarityChipProps {
  /** The rung, from `tierOf(ladder, id)` with the game's word as `label`. Its hue is `--rarity-<id>`. */
  tier: RarityTier;
  className?: string;
}

/**
 * Names a rarity in its own hue on the plate (a flat dark block: the hues were tuned for it). Only the top rung is
 * foiled, as a dithered frame round the plate. A label, never a control. `data-rarity`, and `data-top` on the top.
 */
export function RarityChip({ tier, className }: RarityChipProps) {
  const top = isTopTier(tier);
  return (
    <span
      className={cx(s.chip, className)}
      data-rarity={tier.id}
      data-top={top ? "" : undefined}
      style={{ "--tier": tierInk(tier) }}
    >
      {/* Lit from just below the chip, so the hues fan left to right instead of a pinwheel. */}
      {top && <Foil className={s.frame} angle={-100} />}
      <span className={s.word}>{tierLabel(tier)}</span>
    </span>
  );
}
