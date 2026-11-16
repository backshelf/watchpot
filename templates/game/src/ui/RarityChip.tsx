// @feature gacha
import { isTopTier, type RarityTier, tierInk, tierLabel } from "watchpot/kit";
import { cx } from "watchpot/ui";
import s from "./RarityChip.module.css";

/** Props of `RarityChip`: the rung it names. */
export interface RarityChipProps {
  /** The rung, from `tierOf(ladder, id)` with the game's word as `label`. Its hue is `--rarity-<id>`. */
  tier: RarityTier;
  className?: string;
}

/** Names a rarity in its own hue. A label, never a control. `data-rarity`, and `data-top` on the ladder's top rung. */
export function RarityChip({ tier, className }: RarityChipProps) {
  return (
    <span
      className={cx(s.chip, className)}
      data-rarity={tier.id}
      data-top={isTopTier(tier) ? "" : undefined}
      style={{ "--tier": tierInk(tier) }}
    >
      {tierLabel(tier)}
    </span>
  );
}
