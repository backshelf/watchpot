// Build-time code highlighting with shiki and a CSS-variables theme: every colour is `var(--hl-…)`.

import { type BundledLanguage, createCssVariablesTheme, createHighlighter } from "shiki";
import { escapeHtml } from "./text";

const ALIASES: Record<string, BundledLanguage> = {
  ts: "ts",
  typescript: "ts",
  mts: "ts",
  cts: "ts",
  tsx: "tsx",
  js: "js",
  javascript: "js",
  mjs: "js",
  cjs: "js",
  jsx: "jsx",
  json: "json",
  jsonc: "json",
  glsl: "glsl",
  frag: "glsl",
  vert: "glsl",
  css: "css",
  html: "html",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  rust: "rust",
  rs: "rust",
  toml: "toml",
  diff: "diff",
  patch: "diff",
  markdown: "markdown",
  md: "markdown",
};

/** The grammar for an info string or file extension, or null for plain text. */
export function grammarFor(lang: string | undefined): BundledLanguage | null {
  if (!lang) return null;
  return ALIASES[lang.toLowerCase()] ?? null;
}

const THEME = createCssVariablesTheme({ name: "watchpot-docs", variablePrefix: "--hl-", fontStyle: true });

export type Highlight = (code: string, lang: string | undefined) => string;

/** One highlighter for the process: a dev server rebuilds many times and must not make one each time. */
let shared: ReturnType<typeof createHighlighter> | undefined;

/** A highlighted line: each token's text and its colour, a `var(--hl-…)` (or undefined for the foreground). */
export type TokenLine = { content: string; color?: string }[];

/** Tokens rather than HTML, for a page that draws its code itself (the guide's listings, whose values change). */
export async function createTokenizer(
  langs: Iterable<string | undefined>,
): Promise<(code: string, lang: string | undefined) => TokenLine[]> {
  const grammars = [...new Set([...langs].map(grammarFor).filter((g): g is BundledLanguage => g !== null))];
  shared ??= createHighlighter({ themes: [THEME], langs: [] });
  const highlighter = await shared;
  await highlighter.loadLanguage(...grammars);
  return (code, lang) => {
    const grammar = grammarFor(lang);
    if (!grammar) return code.split("\n").map((line) => [{ content: line }]);
    return highlighter
      .codeToTokensBase(code, { lang: grammar, theme: THEME })
      .map((line) => line.map((t) => ({ content: t.content, color: t.color })));
  };
}

/** The highlighter for a build, with the grammars in `langs` loaded (each once, kept across builds). */
export async function createHighlight(langs: Iterable<string | undefined>): Promise<Highlight> {
  const grammars = [...new Set([...langs].map(grammarFor).filter((g): g is BundledLanguage => g !== null))];
  shared ??= createHighlighter({ themes: [THEME], langs: [] });
  const highlighter = await shared;
  await highlighter.loadLanguage(...grammars);
  const loaded = new Set<string>(highlighter.getLoadedLanguages());
  return (code, lang) => {
    const text = code.replace(/\n$/, "");
    const grammar = grammarFor(lang);
    if (!grammar || !loaded.has(grammar)) return escapeHtml(text);
    const html = highlighter.codeToHtml(text, { lang: grammar, theme: THEME.name ?? "watchpot-docs" });
    const start = html.indexOf("<code>");
    const end = html.lastIndexOf("</code>");
    return start >= 0 && end > start ? html.slice(start + "<code>".length, end) : escapeHtml(text);
  };
}
