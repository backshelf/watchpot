// @feature gacha
import { isTopTier, type RarityTier, tierInk, tierLabel } from "watchpot/kit";
import { cx } from "watchpot/ui";

// The look: Tailwind utilities over the --ui-* tokens (theme.css), where the CSS module was. The rung's hue (`--tier`,
// from `--rarity-<id>`) marks the chip; the words stay in ink so every hue reads.
const s = {
  chip:
    "inline-flex items-center gap-1.5 px-2 py-[3px] border [border-color:var(--tier,var(--ui-line))] rounded-ui text-[12px] font-semibold leading-[1.2] whitespace-nowrap before:content-[''] before:flex-none before:size-2 before:rounded-ui before:[background:var(--tier,var(--ui-ink-muted))] data-[top]:[background:color-mix(in_srgb,var(--tier)_16%,transparent)]",
};

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
