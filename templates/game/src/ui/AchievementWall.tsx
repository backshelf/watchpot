// @feature achievements
import {
  AchievementGrid,
  type AchievementRow,
  type AchievementTile,
  type AchievementWords,
  cx,
} from "watchpot/ui";
import type { ReactNode } from "react";
import s from "./AchievementWall.module.css";

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
