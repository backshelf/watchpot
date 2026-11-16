// Builds the docs section of the site from the repository's markdown. The filesystem is read here only.

import { statSync } from "node:fs";
import { join, posix } from "node:path";
import { createHighlight, grammarFor } from "./highlight";
import {
  docsPageOut,
  type Exists,
  type LinkContext,
  type RepoInfo,
  relativeUrl,
  renderedTarget,
  resolveLink,
  resolveRepoPath,
} from "./links";
import { codeFigure, indexBlocks, type ParsedPage, parseMarkdown, renderBody } from "./markdown";
import {
  buildNavGroups,
  groupOf,
  type NavLink,
  type NavModel,
  type NavPage,
  navOrder,
  renderNav,
  renderPager,
} from "./nav";
import { fillShell } from "./shell";
import { clip, deslug, escapeHtml, firstSentences, naturalCompare } from "./text";

export interface DocsOptions {
  /** Absolute path of the repository root. */
  repoRoot: string;
  /** Absolute output directory for the docs section, e.g. <site>/dist/docs. */
  outDir: string;
  /** The built shell page (HTML text) with placeholders. */
  shell: string;
  /** Repository facts for links that leave the docs. */
  repo: RepoInfo;
}

export interface DocsResult {
  pages: number;
  examples: number;
  warnings: string[];
}

export interface SearchEntry {
  url: string;
  title: string;
  group: string;
  headings: string[];
  text: string;
}

interface Page {
  repoPath: string;
  out: string;
  parsed: ParsedPage;
  title: string;
}

const DOCS = "docs";
const EXAMPLES = "docs/examples";
const OUTSIDE_PAGES: { repoPath: string; out: string; title: string }[] = [
  { repoPath: "README.md", out: "reference.html", title: "Reference" },
  { repoPath: "CHANGELOG.md", out: "changelog.html", title: "Changelog" },
];

function scan(dir: string, pattern: string): string[] {
  try {
    if (!statSync(dir).isDirectory()) return [];
  } catch {
    return [];
  }
  return [...new Bun.Glob(pattern).scanSync({ cwd: dir, onlyFiles: true, dot: false })]
    .map((p) => p.replaceAll("\\", "/"))
    .sort(naturalCompare);
}

function fsExists(repoRoot: string): Exists {
  const cache = new Map<string, "file" | "dir" | null>();
  return (repoPath) => {
    const hit = cache.get(repoPath);
    if (hit !== undefined) return hit;
    let what: "file" | "dir" | null = null;
    try {
      what = statSync(join(repoRoot, repoPath)).isDirectory() ? "dir" : "file";
    } catch {
      what = null;
    }
    cache.set(repoPath, what);
    return what;
  };
}

function renderToc(page: ParsedPage): string {
  const entries = page.headings.filter((h) => h.level === 2 || h.level === 3);
  if (entries.length < 2) return "";
  let html = "";
  let open = false;
  let nested = false;
  for (const h of entries) {
    const item = `<a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a>`;
    if (h.level === 2 || !open) {
      if (nested) html += "</ol>";
      if (open) html += "</li>";
      html += `<li>${item}`;
      open = true;
      nested = false;
    } else {
      if (!nested) html += "<ol>";
      html += `<li>${item}</li>`;
      nested = true;
    }
  }
  if (nested) html += "</ol>";
  if (open) html += "</li>";
  return `<nav class="doc-toc" aria-label="On this page"><h2 class="doc-toc__label">On this page</h2><ol>${html}</ol></nav>`;
}

function crumbs(group: string | null): string {
  return `<p class="doc__crumbs">Docs${group ? ` / ${escapeHtml(group)}` : ""}</p>`;
}

export async function buildDocs(options: DocsOptions): Promise<DocsResult> {
  const { repoRoot, outDir, repo } = options;
  const warnings: string[] = [];
  const exists = fsExists(repoRoot);

  // Read and parse every markdown page.
  const docsDir = join(repoRoot, DOCS);
  const sources: { repoPath: string; out: string; fixed?: string }[] = scan(docsDir, "**/*.md").map((p) => ({
    repoPath: `${DOCS}/${p}`,
    out: docsPageOut(p),
  }));
  const claimed = new Map<string, string>();
  const unique = sources.filter((s) => {
    const prior = claimed.get(s.out);
    if (prior) warnings.push(`${s.repoPath}: renders to ${s.out}, already taken by ${prior}; skipped`);
    else claimed.set(s.out, s.repoPath);
    return !prior;
  });
  for (const outside of OUTSIDE_PAGES) {
    if (exists(outside.repoPath) === "file" && !claimed.has(outside.out)) {
      unique.push({ repoPath: outside.repoPath, out: outside.out, fixed: outside.title });
      claimed.set(outside.out, outside.repoPath);
    }
  }
  const pages: Page[] = await Promise.all(
    unique.map(async (s) => {
      const parsed = parseMarkdown(await Bun.file(join(repoRoot, s.repoPath)).text());
      const fallback = deslug(posix.basename(s.repoPath).replace(/\.md$/i, ""));
      return {
        repoPath: s.repoPath,
        out: s.out,
        parsed,
        title: s.fixed ?? parsed.title ?? fallback,
      };
    }),
  );
  const pageMap = new Map(pages.map((p) => [p.repoPath, p.out]));
  const byRepoPath = new Map(pages.map((p) => [p.repoPath, p]));

  // Source pages: every non-markdown file under docs/examples, plus any other docs/ file a page links.
  const sourcePaths = new Set(scan(join(repoRoot, EXAMPLES), "**/*").map((p) => `${EXAMPLES}/${p}`));
  for (const page of pages) {
    for (const href of page.parsed.hrefs) {
      const target = resolveRepoPath(href, page.repoPath);
      if (!target || target.outside || !target.path.startsWith(`${DOCS}/`)) continue;
      if (/\.md$/i.test(target.path) || exists(target.path) !== "file") continue;
      sourcePaths.add(target.path);
    }
  }
  for (const path of sourcePaths) if (/\.md$/i.test(path)) sourcePaths.delete(path);
  const sourceMap = new Map(
    [...sourcePaths].sort(naturalCompare).map((p) => [p, `${p.slice(DOCS.length + 1)}.html`]),
  );
  const ctx: LinkContext = { map: { pages: pageMap, sources: sourceMap }, exists, repo };

  // The sidebar.
  const docsRel = (repoPath: string) =>
    repoPath.startsWith(`${DOCS}/`) ? repoPath.slice(DOCS.length + 1) : null;
  const docsPages = pages.filter((p) => docsRel(p.repoPath) !== null);
  const linkedDocsPages = (page: Page, hrefs: string[]) =>
    hrefs.flatMap((href) => {
      const target = resolveRepoPath(href, page.repoPath);
      if (!target || target.outside) return [];
      const out = renderedTarget(target.path, ctx.map);
      const hit = out ? docsPages.find((p) => p.out === out) : undefined;
      const rel = hit ? docsRel(hit.repoPath) : null;
      return rel ? [rel] : [];
    });
  const navPages: NavPage[] = docsPages.map((p) => ({
    path: docsRel(p.repoPath) ?? p.repoPath,
    title: p.title,
    links: linkedDocsPages(p, p.parsed.hrefs),
  }));
  const index = docsPages.find((p) => p.out === "index.html");
  const blocks = index
    ? indexBlocks(index.parsed.html, (href) => linkedDocsPages(index, [href])[0] ?? null)
    : [];
  const groups = buildNavGroups(navPages, blocks);
  const outOf = new Map(docsPages.map((p) => [docsRel(p.repoPath) ?? "", p]));
  const toLink = (page: Page): NavLink => ({ out: page.out, title: page.title });
  const top: NavLink[] = [];
  if (index) top.push({ out: index.out, title: "Overview" });
  for (const outside of OUTSIDE_PAGES) {
    const page = pages.find((p) => p.repoPath === outside.repoPath);
    if (page) top.push(toLink(page));
  }
  const nav: NavModel = {
    top,
    groups: groups.map((g) => ({
      label: g.label,
      links: g.pages.flatMap((path) => {
        const page = outOf.get(path);
        return page ? [toLink(page)] : [];
      }),
    })),
  };
  const order = navOrder(nav);
  const rank = new Map(order.map((link, i) => [link.out, i]));

  const highlight = await createHighlight([
    ...pages.flatMap((p) => [...p.parsed.html.matchAll(/<code class="language-([^"\s]*)/g)].map((m) => m[1])),
    ...[...sourceMap.keys()].map((p) => posix.extname(p).slice(1)),
  ]);

  const writes: Promise<number>[] = [];
  const search: SearchEntry[] = [];
  const usedBy = new Map<string, Page[]>();
  const shellFor = (out: string, slots: Record<string, string>) => fillShell(options.shell, out, slots);
  const urlFrom = (from: string) => (to: string) => relativeUrl(from, to);

  // A source file by its bare name, where one file alone has it (`gacha.ts`); null where two do.
  const byName = new Map<string, string | null>();
  for (const path of sourceMap.keys()) {
    const name = posix.basename(path);
    byName.set(name, byName.has(name) ? null : path);
  }

  for (const page of pages) {
    const group = groupOf(nav, page.out);
    const body = renderBody(page.parsed.html, {
      highlight,
      mention: (text) => {
        if (!/^[\w./@-]+\.\w+$/.test(text)) return null;
        const near = posix.normalize(posix.join(posix.dirname(page.repoPath), text));
        const hit = [near, posix.normalize(text), byName.get(text) ?? ""].find((p) => sourceMap.has(p));
        const out = hit ? sourceMap.get(hit) : undefined;
        if (!hit || !out) return null;
        const users = usedBy.get(hit) ?? [];
        if (!users.includes(page)) users.push(page);
        usedBy.set(hit, users);
        return relativeUrl(page.out, out);
      },
      link: (href) => {
        const resolved = resolveLink(href, { repoPath: page.repoPath, outPath: page.out }, ctx);
        if (resolved.kind === "missing") warnings.push(`${page.repoPath}: broken link "${href}"`);
        const target = resolved.kind === "link" ? resolved.target : undefined;
        const hash = /#(.+)$/.exec(href)?.[1];
        const linked = hash ? (href.startsWith("#") ? page : byRepoPath.get(target ?? "")) : undefined;
        if (hash && linked && !linked.parsed.headings.some((h) => h.id === hash)) {
          warnings.push(`${page.repoPath}: link "${href}" names no heading in ${linked.repoPath}`);
        }
        if (target && sourceMap.has(target)) {
          const users = usedBy.get(target) ?? [];
          if (!users.includes(page)) users.push(page);
          usedBy.set(target, users);
        }
        return resolved;
      },
    });
    const content = `<article class="doc"><header class="doc__head">${crumbs(group)}<h1>${escapeHtml(page.title)}</h1></header><div class="doc__body">${body}</div></article>`;
    const description = firstSentences(page.parsed.prose, 160);
    writes.push(
      Bun.write(
        join(outDir, page.out),
        shellFor(page.out, {
          TITLE: escapeHtml(`${page.title} · watchpot docs`),
          DESCRIPTION: escapeHtml(description),
          NAV: renderNav(nav, page.out, urlFrom(page.out)),
          CONTENT: content,
          PAGER: renderPager(nav, page.out, urlFrom(page.out)),
          TOC: renderToc(page.parsed),
        }),
      ),
    );
    search.push({
      url: page.out,
      title: page.title,
      group: group ?? "Docs",
      headings: page.parsed.headings.filter((h) => h.level <= 3).map((h) => h.text),
      text: clip(page.parsed.prose, 300),
    });
  }

  for (const [repoPath, out] of sourceMap) {
    const shown = repoPath.slice(DOCS.length + 1);
    const ext = posix.extname(repoPath).slice(1);
    const code = await Bun.file(join(repoRoot, repoPath)).text();
    const users = (usedBy.get(repoPath) ?? []).sort(
      (a, b) =>
        (rank.get(a.out) ?? Infinity) - (rank.get(b.out) ?? Infinity) || naturalCompare(a.title, b.title),
    );
    const usedByHtml = users.length
      ? `<p class="doc__usedby">Used by: ${users
          .map((u) => `<a href="${escapeHtml(relativeUrl(out, u.out))}">${escapeHtml(u.title)}</a>`)
          .join(", ")}</p>`
      : "";
    const folder = posix.dirname(shown);
    const group = folder === "." ? null : deslug(folder.split("/")[0] ?? folder);
    const lang = grammarFor(ext) ? ext : "text";
    const content = `<article class="doc doc--source"><header class="doc__head">${crumbs(group)}<h1><code>${escapeHtml(shown)}</code></h1></header>${usedByHtml}${codeFigure(highlight(code, ext), lang)}</article>`;
    const description = users.length
      ? `The source of ${shown}, the example for ${users.map((u) => u.title).join(", ")}.`
      : `The source of ${shown}.`;
    writes.push(
      Bun.write(
        join(outDir, out),
        shellFor(out, {
          TITLE: escapeHtml(`${shown} · watchpot docs`),
          DESCRIPTION: escapeHtml(clip(description, 160)),
          NAV: renderNav(nav, out, urlFrom(out)),
          CONTENT: content,
          PAGER: "",
          TOC: "",
        }),
      ),
    );
  }

  writes.push(Bun.write(join(outDir, "search.json"), `${JSON.stringify(search)}\n`));
  await Promise.all(writes);
  return { pages: pages.length, examples: sourceMap.size, warnings };
}
