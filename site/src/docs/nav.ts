// The sidebar: which group each page sits in and in what order. Pure functions over page data.

import { posix } from "node:path";
import { deslug, escapeHtml, naturalCompare } from "./text";

export interface NavPage {
  /** Path relative to `docs/`, e.g. `gacha.md` or `guide/01-start.md`. */
  path: string;
  title: string;
  /** Pages this page links, as paths relative to `docs/`, in the order it first links them. */
  links: string[];
}

/** One block of the docs index, in document order. */
export type IndexBlock =
  | { kind: "heading"; level: number; text: string }
  | {
      kind: "links";
      shape: "table" | "list" | "paragraphs";
      /** A table's first header cell text. */
      firstHeader?: string;
      /** Linked paths relative to `docs/`, in order. */
      links: string[];
    };

export interface NavGroup {
  label: string;
  /** Paths relative to `docs/`. */
  pages: string[];
}

const INDEX_NAMES = /^(readme|index)\.md$/i;
const NEVER_A_GROUP = new Set(["examples"]);

export function isIndexPath(path: string): boolean {
  return INDEX_NAMES.test(posix.basename(path));
}

function folderOf(path: string): string | null {
  const slash = path.indexOf("/");
  return slash < 0 ? null : path.slice(0, slash);
}

/** `Recipe` → `Recipes`; anything but a single singular word is kept. */
export function pluralLabel(cell: string): string {
  const text = cell.trim();
  if (!/^[\p{L}]+$/u.test(text) || /s$/i.test(text)) return text;
  if (/[^aeiou]y$/i.test(text)) return `${text.slice(0, -1)}ies`;
  return `${text}s`;
}

/**
 * Groups the docs' pages for the sidebar. Folder groups first (by folder name), then the top-level pages in
 * the order and blocks the docs index links them, then whatever the index never links under "More".
 */
export function buildNavGroups(pages: readonly NavPage[], index: readonly IndexBlock[]): NavGroup[] {
  const byPath = new Map(pages.map((page) => [page.path, page]));
  const groups: NavGroup[] = [];

  const folders = [...new Set(pages.map((page) => folderOf(page.path)))]
    .filter((folder): folder is string => folder !== null && !NEVER_A_GROUP.has(folder))
    .sort(naturalCompare);
  for (const folder of folders) {
    const members = pages.filter((page) => folderOf(page.path) === folder);
    const own = members.find((page) => page.path.split("/").length === 2 && isIndexPath(page.path));
    const rest = members
      .filter((page) => page !== own)
      .map((page) => page.path)
      .sort(naturalCompare);
    if (!own) {
      groups.push({ label: deslug(folder), pages: rest });
      continue;
    }
    const ordered = [own.path];
    for (const link of own.links) {
      if (rest.includes(link) && !ordered.includes(link)) ordered.push(link);
    }
    for (const path of rest) if (!ordered.includes(path)) ordered.push(path);
    groups.push({ label: own.title, pages: ordered });
  }

  const topLevel = new Set(
    pages.filter((p) => folderOf(p.path) === null && !isIndexPath(p.path)).map((p) => p.path),
  );
  const placed = new Set<string>();
  const folderGroups = groups.length;
  const addTo = (label: string, paths: string[]) => {
    if (paths.length === 0) return;
    const existing = groups.slice(folderGroups).find((group) => group.label === label);
    if (existing) existing.pages.push(...paths);
    else groups.push({ label, pages: paths });
  };

  let heading: string | null = null;
  for (const block of index) {
    if (block.kind === "heading") {
      if (block.level >= 2) heading = block.text;
      continue;
    }
    const linked = block.links.filter((link) => topLevel.has(link));
    if (linked.length === 0) continue;
    const fresh: string[] = [];
    for (const link of linked) {
      if (placed.has(link)) continue;
      placed.add(link);
      fresh.push(link);
    }
    const label =
      heading ?? (block.shape === "table" && block.firstHeader ? pluralLabel(block.firstHeader) : "More");
    heading = null;
    addTo(label, fresh);
  }

  const leftover = [...topLevel, ...pages.filter((p) => folderOf(p.path) === "examples").map((p) => p.path)]
    .filter((path) => !placed.has(path))
    .sort((a, b) => naturalCompare(byPath.get(a)?.title ?? a, byPath.get(b)?.title ?? b));
  addTo("More", leftover);
  return groups;
}

export interface NavLink {
  /** Output path relative to the docs output. */
  out: string;
  title: string;
}

export interface NavModel {
  top: NavLink[];
  groups: { label: string; links: NavLink[] }[];
}

/** Every page in sidebar order, for the pager. */
export function navOrder(model: NavModel): NavLink[] {
  return [...model.top, ...model.groups.flatMap((group) => group.links)];
}

/** The group label of a page, or null for the top list. */
export function groupOf(model: NavModel, out: string): string | null {
  return model.groups.find((group) => group.links.some((link) => link.out === out))?.label ?? null;
}

function navItem(link: NavLink, current: string, url: (out: string) => string): string {
  const here = link.out === current ? ' aria-current="page"' : "";
  return `<li><a href="${escapeHtml(url(link.out))}"${here}>${escapeHtml(link.title)}</a></li>`;
}

export function renderNav(model: NavModel, current: string, url: (out: string) => string): string {
  const top = `<ul class="doc-nav__top">${model.top.map((l) => navItem(l, current, url)).join("")}</ul>`;
  const groups = model.groups
    .map(
      (group) =>
        `<section class="doc-nav__group"><h2 class="doc-nav__label">${escapeHtml(group.label)}</h2><ul>${group.links
          .map((l) => navItem(l, current, url))
          .join("")}</ul></section>`,
    )
    .join("");
  return `<nav class="doc-nav" aria-label="Docs">${top}${groups}</nav>`;
}

export function renderPager(model: NavModel, current: string, url: (out: string) => string): string {
  const order = navOrder(model);
  const at = order.findIndex((link) => link.out === current);
  if (at < 0) return "";
  const prev = order[at - 1];
  const next = order[at + 1];
  if (!prev && !next) return "";
  const side = (link: NavLink, cls: string, rel: string, word: string) =>
    `<a class="doc-pager__${cls}" rel="${rel}" href="${escapeHtml(url(link.out))}"><span>${word}</span><strong>${escapeHtml(link.title)}</strong></a>`;
  return `<nav class="doc-pager" aria-label="Previous and next page">${prev ? side(prev, "prev", "prev", "Previous") : ""}${
    next ? side(next, "next", "next", "Next") : ""
  }</nav>`;
}
