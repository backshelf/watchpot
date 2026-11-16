// Which guide pages there are: the outline's headings in order, and the page files that exist for them. Pure but for
// the directory listing.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface OutlineStep {
  n: number;
  title: string;
}

/** The outline's `## N. Title` headings, in order. */
export function parseOutline(markdown: string): OutlineStep[] {
  return [...markdown.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => ({
    n: Number(m[1]),
    title: (m[2] ?? "").trim(),
  }));
}

export interface PageFile {
  n: number;
  /** The file's name without its extension: `03-a-button`, also the page's address (`03-a-button.html`). */
  slug: string;
  path: string;
}

export const GUIDE_DIR = import.meta.dir;
export const PAGES_DIR = join(import.meta.dir, "pages");

/** The page files, `NN-slug.tsx`, in order. */
export function pageFiles(dir = PAGES_DIR): PageFile[] {
  return readdirSync(dir)
    .filter((name) => /^\d{2}-[a-z0-9-]+\.tsx$/.test(name))
    .sort()
    .map((name) => ({
      n: Number(name.slice(0, 2)),
      slug: name.replace(/\.tsx$/, ""),
      path: join(dir, name),
    }));
}

export function outline(): OutlineStep[] {
  return parseOutline(readFileSync(join(GUIDE_DIR, "OUTLINE.md"), "utf8"));
}

/** Where the guide's pages live under the docs output. */
export const START_DIR = "start";
