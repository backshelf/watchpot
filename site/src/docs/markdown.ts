// Markdown to the docs' HTML: Bun's parser, then a rewrite of its regular output (headings, links, code, tables).

import type { Highlight } from "./highlight";
import type { ResolvedLink } from "./links";
import type { IndexBlock } from "./nav";
import { createSlugger, decodeEntities, escapeHtml, htmlToText } from "./text";

const PARSER: Bun.markdown.Options = {
  tables: true,
  strikethrough: true,
  tasklists: true,
  autolinks: { url: true, www: true, email: false },
};

export interface Heading {
  level: number;
  id: string;
  /** Plain text. */
  text: string;
}

export interface ParsedPage {
  /** The first `# heading`'s text, or null. */
  title: string | null;
  /** The page's HTML without its first h1, headings carrying ids and anchors; links and code untouched. */
  html: string;
  /** h2 to h6, in order. */
  headings: Heading[];
  /** Every link's href, in document order (entities decoded). */
  hrefs: string[];
  /** The prose of its paragraphs, joined. */
  prose: string;
}

const HEADING = /<h([1-6])>([\s\S]*?)<\/h\1>/g;
const LINK = /<a href="([^"]*)"(?: title="([^"]*)")?>([\s\S]*?)<\/a>/g;
/** Inline code outside a link and outside a listing (group 2); a link or a listing, to be skipped whole (group 1). */
const MENTION = /(<a [\s\S]*?<\/a>|<pre>[\s\S]*?<\/pre>)|<code>([^<]+)<\/code>/g;
const CODE = /<pre><code(?: class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g;

/** Parses one markdown file: title, heading ids, links, prose. */
export function parseMarkdown(source: string): ParsedPage {
  const raw = Bun.markdown.html(source, PARSER);
  const slug = createSlugger();
  const headings: Heading[] = [];
  let title: string | null = null;
  // A page with no h1 that opens on a heading (the system pages open on `## Generators`) is titled by that heading:
  // it becomes the page's h1 and is not repeated under it.
  let promote = !/<h1[\s>]/.test(raw) && /^\s*<h[2-6][\s>]/.test(raw);
  const html = raw.replace(HEADING, (_whole, levelText: string, inner: string) => {
    const text = htmlToText(inner);
    if (promote) {
      promote = false;
      title = text;
      return "";
    }
    const id = slug(text);
    let level = Number(levelText);
    if (level === 1 && title === null) {
      title = text;
      return "";
    }
    if (level === 1) level = 2;
    headings.push({ level, id, text });
    const anchor =
      level <= 3
        ? ` <a class="anchor" href="#${escapeHtml(id)}" aria-label="Link to this section">#</a>`
        : "";
    return `<h${level} id="${escapeHtml(id)}">${inner}${anchor}</h${level}>`;
  });
  const hrefs = [...html.matchAll(LINK)].map((m) => decodeEntities(m[1] ?? ""));
  const prose = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)]
    .map((m) => htmlToText(m[1] ?? ""))
    .filter((text) => text !== "")
    .join(" ");
  return { title, html: html.replace(/^\s+/, ""), headings, hrefs, prose };
}

export interface RenderOptions {
  link: (href: string) => ResolvedLink;
  /**
   * Inline code that names a rendered source file (`start-a-game.ts`, `examples/vocab.ts`): the URL of its page,
   * or null to leave the code as it is. The docs name their examples this way far more often than they link them.
   */
  mention?: (text: string) => string | null;
  highlight: Highlight;
}

/** The figure a code block becomes. `code` is already highlighted HTML. */
export function codeFigure(code: string, lang: string): string {
  const label = escapeHtml(lang);
  return `<figure class="code" data-lang="${label}"><figcaption class="code__bar"><span class="code__lang">${label}</span><button class="code__copy" type="button" data-copy>Copy</button></figcaption><pre tabindex="0"><code>${code}</code></pre></figure>`;
}

/** Rewrites a parsed page's links, code blocks and tables into the docs' markup. */
export function renderBody(html: string, options: RenderOptions): string {
  return html
    .replace(LINK, (_whole, hrefAttr: string, titleAttr: string | undefined, inner: string) => {
      const resolved = options.link(decodeEntities(hrefAttr));
      const text = inner.trim() === "" ? escapeHtml(decodeEntities(hrefAttr)) : inner;
      if (resolved.kind !== "link")
        return `<span class="repo-path" title="A path in the repository">${text}</span>`;
      const title = titleAttr ? ` title="${titleAttr}"` : "";
      const rel = resolved.external ? ' rel="noopener"' : "";
      return `<a href="${escapeHtml(resolved.href)}"${title}${rel}>${text}</a>`;
    })
    .replace(MENTION, (whole, skipped: string | undefined, text: string | undefined) => {
      if (skipped !== undefined || text === undefined) return whole;
      const href = options.mention?.(decodeEntities(text)) ?? null;
      return href === null ? whole : `<a class="code-link" href="${escapeHtml(href)}">${whole}</a>`;
    })
    .replace(CODE, (_whole, lang: string | undefined, body: string) => {
      const name = lang ? decodeEntities(lang).split(/\s/)[0] || "text" : "text";
      return codeFigure(options.highlight(decodeEntities(body), name), name);
    })
    .replace(/<table>/g, '<div class="table-wrap" role="region" aria-label="Table" tabindex="0"><table>')
    .replace(/<\/table>/g, "</table></div>");
}

const BLOCK_TAG = /<(\/?)(p|ul|ol|table|blockquote|pre|h[1-6]|div|details|hr)\b[^>]*>/g;

/** Splits HTML into its top-level blocks. */
export function topLevelBlocks(html: string): { tag: string; html: string }[] {
  const blocks: { tag: string; html: string }[] = [];
  let depth = 0;
  let start = 0;
  let tag = "";
  for (const match of html.matchAll(BLOCK_TAG)) {
    const closing = match[1] === "/";
    const name = match[2] ?? "";
    const at = match.index ?? 0;
    if (name === "hr") {
      if (depth === 0) blocks.push({ tag: "hr", html: match[0] });
      continue;
    }
    if (!closing) {
      if (depth === 0) {
        start = at;
        tag = name;
      }
      depth += 1;
    } else if (depth > 0) {
      depth -= 1;
      if (depth === 0) blocks.push({ tag, html: html.slice(start, at + match[0].length) });
    }
  }
  return blocks;
}

/**
 * The docs index as blocks for the sidebar: headings, and blocks of links (a table, a list, or a run of
 * paragraphs). `resolve` maps an href to a path relative to `docs/`, or null when it is not a docs page.
 */
export function indexBlocks(html: string, resolve: (href: string) => string | null): IndexBlock[] {
  const out: IndexBlock[] = [];
  let run: Extract<IndexBlock, { kind: "links" }> | null = null;
  for (const block of topLevelBlocks(html)) {
    const heading = /^h([1-6])$/.exec(block.tag);
    if (heading) {
      run = null;
      const text = htmlToText(block.html.replace(/<a class="anchor"[^>]*>#<\/a>/, ""));
      out.push({ kind: "heading", level: Number(heading[1]), text });
      continue;
    }
    const links = [...block.html.matchAll(LINK)]
      .map((m) => resolve(decodeEntities(m[1] ?? "")))
      .filter((p): p is string => p !== null);
    if (block.tag === "p" && links.length > 0) {
      if (run) run.links.push(...links);
      else {
        run = { kind: "links", shape: "paragraphs", links };
        out.push(run);
      }
      continue;
    }
    run = null;
    if (links.length === 0) continue;
    if (block.tag === "table") {
      const th = /<th\b[^>]*>([\s\S]*?)<\/th>/.exec(block.html);
      out.push({ kind: "links", shape: "table", firstHeader: htmlToText(th?.[1] ?? ""), links });
    } else {
      out.push({
        kind: "links",
        shape: block.tag === "ul" || block.tag === "ol" ? "list" : "paragraphs",
        links,
      });
    }
  }
  return out;
}
