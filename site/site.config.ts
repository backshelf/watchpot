// What the site knows about where it is published. Change these when the repository goes public.
export const SITE = {
  name: "watchpot",
  /** The repository. Links into it are drawn only when `repoPublic` is true: a private link is a dead link. */
  repoUrl: "https://github.com/backshelf/watchpot",
  repoBranch: "main",
  repoPublic: false,
  /** The game shown as "made with it". */
  game: { name: "VOID IF REMOVED" },
} as const;

export type SiteConfig = typeof SITE;
