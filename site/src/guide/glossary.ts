// The glossary as data for the guide's word popups: one source, `docs/glossary.md`, read at build time. Pure.
//
// An entry's popup text is its "In short" line when it has one (a paragraph that opens `**In short:**`, written for
// a reader who knows none of the jargon), else the first sentence of its first paragraph.

import { createSlugger, htmlToText } from "../docs/text";

export interface GlossaryEntry {
  /** The heading's anchor in the rendered glossary (`derived-value`), the id a page names the word by. */
  id: string;
  /** The heading as written (`Derived value`). */
  title: string;
  /** One plain sentence for the popup. */
  short: string;
  /** True when `short` is the entry's own "In short" line rather than its first sentence. */
  plain: boolean;
}

const SHORT = /^\*\*In short:\*\*\s*/;

/** Markdown inline text as plain text: links to their words, code and emphasis to their letters. */
function inlineText(md: string): string {
  const html = md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1");
  return htmlToText(html);
}

function firstSentence(text: string): string {
  const m = /^(.+?[.!?])(\s|$)/.exec(text);
  return (m?.[1] ?? text).trim();
}

/** Every `## ` entry of the glossary, in order. */
export function parseGlossary(markdown: string): GlossaryEntry[] {
  const slug = createSlugger();
  const entries: GlossaryEntry[] = [];
  const sections = markdown.split(/^## /m).slice(1);
  for (const section of sections) {
    const [head = "", ...rest] = section.split("\n");
    const title = head.trim();
    const paragraphs = rest
      .join("\n")
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
      .filter((p) => p !== "");
    const first = paragraphs[0] ?? "";
    const own = SHORT.test(first);
    const short = own ? inlineText(first.replace(SHORT, "")) : firstSentence(inlineText(first));
    entries.push({ id: slug(title), title, short, plain: own });
  }
  return entries;
}
