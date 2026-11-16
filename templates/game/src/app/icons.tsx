import type { ReactNode } from "react";

/** The currency glyphs a game picks from by id: single-ink 14px marks in `currentColor`. */
export type GlyphId =
  | "coin"
  | "drop"
  | "gem"
  | "leaf"
  | "star"
  | "moon"
  | "bolt"
  | "shell"
  | "flame"
  | "key"
  | "sun"
  | "seed";

const GLYPH_PATHS: Record<GlyphId, ReactNode> = {
  coin: <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  drop: <path d="M7 1.5C9.5 5 11 7 11 9a4 4 0 0 1-8 0c0-2 1.5-4 4-7.5Z" fill="currentColor" />,
  gem: <path d="M3 5 5 2h4l2 3-4 7Z" fill="currentColor" />,
  leaf: (
    <path
      d="M2 12C2 6 6 2 12 2c0 6-4 10-10 10Zm0 0 6-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  ),
  star: (
    <path d="m7 1 1.8 3.9 4.2.5-3.1 2.9.8 4.2L7 10.4 3.3 12.5l.8-4.2L1 5.4l4.2-.5Z" fill="currentColor" />
  ),
  moon: <path d="M9.5 1.5a5.5 5.5 0 1 0 3 9.5A6 6 0 0 1 9.5 1.5Z" fill="currentColor" />,
  bolt: <path d="M8 1 3 8h3.5L5.5 13 11 6H7.5Z" fill="currentColor" />,
  shell: (
    <path
      d="M7 2C3.5 2 1.5 5 1.5 8.5L7 12l5.5-3.5C12.5 5 10.5 2 7 2Zm0 0v10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  ),
  flame: (
    <path
      d="M7 1c3 3 4.5 5 4.5 7.5a4.5 4.5 0 0 1-9 0C2.5 6.5 4 5 5 3.5 5.5 5 6 5.5 7 6Z"
      fill="currentColor"
    />
  ),
  key: (
    <path d="M5 9a3 3 0 1 1 2.5-1.3L13 13m-3-3 1.5-1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
  ),
  sun: (
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7" cy="7" r="2.5" />
      <path d="M7 1v1.5M7 11.5V13M1 7h1.5m9 0H13M2.8 2.8l1 1m6.4 6.4 1 1m-8.4 0 1-1m6.4-6.4 1-1" />
    </g>
  ),
  seed: (
    <path
      d="M7 1.5c2.8 1.6 4 4.4 4 6.5a4 4 0 0 1-8 0c0-2.1 1.2-4.9 4-6.5Zm0 4V12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  ),
};

/** A currency's glyph: its 14px mark in `currentColor`, sized by the slot it sits in. */
export const glyphOf = (id: GlyphId, size = 14): ReactNode => (
  <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" focusable="false">
    {GLYPH_PATHS[id]}
  </svg>
);

/** A 20px line drawing in `currentColor`: the frame the tab icons are drawn in. */
const line20 = (path: ReactNode) => (
  <svg
    width={20}
    height={20}
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {path}
  </svg>
);

/** The tab icons, one per screen kind. */
export const TAB_ICONS = {
  make: line20(<path d="M4 16V9m6 7V5m6 11v-9" />),
  // @if tree
  tree: line20(<path d="M10 17V9m0 0L5 4m5 5 5-5M5 4v0m10 0v0" />),
  // @end
  // @if gacha
  gacha: line20(<path d="M3 8h14v9H3Zm0 0 2-4h10l2 4M10 8v9" />),
  // @end
  // @if prestige
  prestige: line20(<path d="M16 10a6 6 0 1 1-2-4.5M16 3v3h-3" />),
  // @end
  // @if achievements
  achievements: line20(<path d="M3 3h6v6H3Zm8 0h6v6h-6ZM3 11h6v6H3Zm8 0h6v6h-6Z" />),
  // @end
};

// @if achievements
/** An achievement tile's mark: a seal, filled once earned, a question for a secret one. */
export const tileMark = (earned: boolean, hidden: boolean): ReactNode => (
  <svg width={22} height={22} viewBox="0 0 22 22" aria-hidden="true" focusable="false">
    {hidden ? (
      <path d="M8 8a3 3 0 1 1 4 2.8c-.7.3-1 .8-1 1.5V13m0 3v.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    ) : (
      <circle cx="11" cy="11" r="7" fill={earned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" />
    )}
  </svg>
);
// @end

// @if visitor
/** The visitor's placeholder mark: a small round body with legs, in `currentColor`. The build draws the game's own. */
export const VISITOR_MARK: ReactNode = (
  <svg width={30} height={30} viewBox="0 0 30 30" aria-hidden="true" focusable="false">
    <ellipse cx="15" cy="15" rx="8" ry="6" fill="currentColor" />
    <path
      d="M9 11 5 8m4 7H4m5 4-4 3m16-11 4-3m-4 7h5m-5 4 4 3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);
// @end
