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

/** A currency's glyph: its 14px mark in `currentColor`, sized by the slot it sits in (the counter draws it at 28px). */
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

/** The tab icons: 20px line drawings, one per screen kind. */
export const TAB_ICONS = {
  /** A tree: a trunk and a round crown. */
  make: line20(<path d="M10 18v-6m0 0-3-2m3 2 3-3M10 12a6 6 0 1 1 0-10 6 6 0 0 1 0 10Z" />),
  /** A module: a hexagonal bay with its hatch. */
  tree: line20(<path d="m10 2 7 4v8l-7 4-7-4V6Zm0 6v4m-2-2h4" />),
  /** A graft: the scion bound into the stock. */
  gacha: line20(
    <path d="M10 18V9m0 0c0-3 2-5 5-6-1 3-2 5-5 6Zm0 0C10 6 8 4 5 3c1 3 2 5 5 6ZM8 12h4m-4 2h4" />,
  ),
  /** A meteor: a stone and its tail. */
  event: line20(<path d="M3 3l8 8m-5-7 7 7m-3-9 5 5M15 16.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />),
  /** An orbit: the ring and the station on it. */
  prestige: line20(
    <path d="M18 10c0 2.2-3.6 4-8 4s-8-1.8-8-4 3.6-4 8-4 8 1.8 8 4ZM14 6.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" />,
  ),
};
