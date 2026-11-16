import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every page under `docs/` has exactly one `#` heading, its title: the reader, the site and the contents all take the
 * page's name from it, and a second one splits the page in two. A `#` line inside a fenced code block is code, not a
 * heading, and is not counted.
 */
const ROOT = join(import.meta.dir, "..", "..");
const DOCS = join(ROOT, "docs");

const pages = readdirSync(DOCS, { recursive: true, encoding: "utf8" })
  .filter((f) => f.endsWith(".md"))
  .map((f) => relative(ROOT, join(DOCS, f)).replaceAll("\\", "/"))
  .sort();

/** The page's `#` headings, fenced code left out. */
function titles(text: string): string[] {
  let fence: string | null = null;
  const found: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const open = /^\s*(`{3,}|~{3,})/.exec(line);
    if (open) {
      const mark = open[1] as string;
      if (fence === null) fence = mark[0] as string;
      else if (mark[0] === fence) fence = null;
      continue;
    }
    if (fence === null && /^# \S/.test(line)) found.push(line);
  }
  return found;
}

describe("the docs' headings", () => {
  test("the scan reads the pages", () => {
    expect(pages.length).toBeGreaterThan(40);
  });

  test("every page has exactly one # heading", () => {
    const wrong = pages
      .map((page) => ({ page, titles: titles(readFileSync(join(ROOT, page), "utf8")) }))
      .filter((p) => p.titles.length !== 1);
    expect(wrong).toEqual([]);
  });
});
