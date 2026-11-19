// Which guide pages there are, section by section: each section's outline's headings in order, and the page files
// that exist for them. Pure but for the directory listing.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The folder the sections and the kit live under: `site/src/guide/`. */
export const GUIDE_DIR = import.meta.dir;

/**
 * One section of the interactive guide: a folder holding its `OUTLINE.md` and its `pages/`, built to its own address
 * under the docs (`docs/<slug>/`). Getting started is the guide root itself, so its pages keep their addresses.
 */
export interface GuideSection {
  /** The output folder under the docs: `start`, `sound`. */
  slug: string;
  /** The section's source folder under `site/src/guide/`: `sound`, or `.` for the guide root. */
  dir: string;
  /** The heading of its group in the docs contents. */
  label: string;
  /** The group's one-line note, said under the label. */
  note: string;
  /** A word after the label in the contents (`new`). */
  tag?: string;
  /** The markdown chapters its pages replace, tagged as the older read in the contents. */
  replaces?: RegExp;
}

/** Getting started: the guide root, the first section in the contents. */
export const START_SECTION: GuideSection = {
  slug: "start",
  dir: ".",
  label: "Getting started",
  note: "Interactive pages, one idea each. Chapters marked older cover the same ground in one long read.",
  tag: "new",
  replaces: /^guide\/0[1-6]-/,
};

/** Every section, in the order the docs contents lists them. */
export const SECTIONS: readonly GuideSection[] = [
  START_SECTION,
  {
    slug: "sound",
    dir: "sound",
    label: "Sound",
    note: "Interactive pages on sound, one idea each: a cue, the voices, the mix.",
  },
  {
    slug: "sim",
    dir: "sim",
    label: "Sim and fit",
    note: "Interactive pages on the sim lab and fitting a game's numbers, one idea each.",
  },
  {
    slug: "shader",
    dir: "shader",
    label: "Shaders",
    note: "Interactive pages on shaders, one idea each: a surface, its uniforms, the pool, and when WebGL cannot run.",
  },
];

/** A section by its slug, as the build and the prerenderer name it. */
export function sectionFor(slug: string): GuideSection {
  const hit = SECTIONS.find((section) => section.slug === slug);
  if (!hit) throw new Error(`no guide section "${slug}"`);
  return hit;
}

/** The section's source folder. */
export function sectionDir(section: GuideSection): string {
  return join(GUIDE_DIR, section.dir);
}

/** The section's `pages/`. */
export function pagesDir(section: GuideSection): string {
  return join(sectionDir(section), "pages");
}

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

/** The section's page files, `NN-slug.tsx`, in order. A section with no `pages/` yet has none. */
export function pageFiles(section: GuideSection): PageFile[] {
  const dir = pagesDir(section);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (error) {
    // A section whose first page is not written yet has no `pages/` at all.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return names
    .filter((name) => /^\d{2}-[a-z0-9-]+\.tsx$/.test(name))
    .sort()
    .map((name) => ({
      n: Number(name.slice(0, 2)),
      slug: name.replace(/\.tsx$/, ""),
      path: join(dir, name),
    }));
}

/** The section's outline: the steps its pages are numbered against. */
export function outline(section: GuideSection): OutlineStep[] {
  return parseOutline(readFileSync(join(sectionDir(section), "OUTLINE.md"), "utf8"));
}
