// @feature achievements
import {
  AchievementGrid,
  type AchievementRow,
  type AchievementTile,
  type AchievementWords,
  cx,
} from "watchpot/ui";
import type { ReactNode } from "react";

// The look: Tailwind utilities over the --ui-* tokens (theme.css), where the CSS module was.
const s = {
  wall: "grid gap-[6px] max-w-[calc(var(--columns)*72px)] [&>[role=row]]:grid [&>[role=row]]:grid-cols-[repeat(var(--columns),minmax(0,1fr))] [&>[role=row]]:gap-[6px] [&>[role=row]]:p-1 [&>[role=row]]:rounded-ui [&>[data-complete]]:bg-ui-accent/14 [&_[role=gridcell]]:grid [&_[role=gridcell]]:place-items-center [&_[role=gridcell]]:aspect-square [&_[role=gridcell]]:border [&_[role=gridcell]]:border-ui-line [&_[role=gridcell]]:rounded-ui [&_[role=gridcell]]:bg-ui-sunken [&_[role=gridcell]]:text-ui-ink-muted [&_[role=gridcell]]:cursor-default [&_[role=gridcell][data-earned]]:border-ui-accent [&_[role=gridcell][data-earned]]:bg-ui-surface [&_[role=gridcell][data-earned]]:text-ui-ink [&_[role=gridcell][data-hidden]]:border-dashed",
  // The detail bubble: placed by the primitive, `data-earned` when its tile is.
  detail:
    "z-50 grid gap-1 max-w-[260px] px-3 py-2.5 rounded-ui bg-ui-ink text-ui-ground text-[13px] [&[hidden]]:hidden [&_[data-name]]:font-bold [&_[data-reward]]:text-ui-accent",
};

/** Props of `AchievementWall`: its name, the rows of tiles, each tile's icon and the wall's words. */
export interface AchievementWallProps {
  /** The grid's accessible name. */
  label: string;
  rows: readonly AchievementRow[];
  /** A tile's picture; the tile's state is on the tile (`data-earned`, `data-hidden`), so a plain glyph will do. */
  icon: (tile: AchievementTile) => ReactNode;
  words: AchievementWords;
  className?: string;
}

/**
 * The achievement wall on `AchievementGrid`: a grid of square tiles, one tab stop with arrows, rows marked complete,
 * and one detail bubble (`[data-name]`, `[data-line]`, `[data-reward]`) for the tile under the pointer or the focus.
 * Every row keeps the first row's width (`--columns`), the tiles shrinking on a narrow page rather than wrapping.
 */
export function AchievementWall({ label, rows, icon, words, className }: AchievementWallProps) {
  return (
    <AchievementGrid
      aria-label={label}
      className={cx(s.wall, className)}
      style={{ "--columns": Math.max(1, rows[0]?.tiles.length ?? 1) }}
      rows={rows}
      words={words}
      renderIcon={(tile) => icon(tile)}
      detailProps={{ className: s.detail }}
    />
  );
}
