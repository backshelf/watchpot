// Finding a piece of an example file by name, so a page quotes the example's own code and cannot drift from it.
// Pure: every function here takes the file's text. A piece is named by its top-level symbol (`pot`), optionally
// followed by keys inside it (`pot > actions`), never by line numbers, so an example can be edited around it.

export interface Range {
  /** Offset of the first character of the piece (its first line's start, doc comment included). */
  start: number;
  /** Offset just past its last character (the end of its last line, before the newline). */
  end: number;
}

export class SourceError extends Error {}

const lineStarts = (text: string): number[] => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return starts;
};

const lineEnd = (text: string, start: number) => {
  const at = text.indexOf("\n", start);
  return at < 0 ? text.length : at;
};

const indentOf = (line: string) => /^\s*/.exec(line)?.[0].length ?? 0;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The lines of a block that opens on line `first` (indented `indent`): every line after it that is blank or indented
 * deeper, then the closing line at the same indent when it starts with a bracket. A first line that ends its own
 * statement (`;` at the top level, `,` inside an object) is the whole block.
 */
function blockEnd(lines: string[], first: number, indent: number): number {
  const opening = (lines[first] ?? "").trimEnd();
  if (/[;,]$/.test(opening) && !/[{([]\s*[;,]?$/.test(opening)) return first;
  let last = first;
  for (let i = first + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue;
    const deeper = indentOf(line) > indent;
    if (deeper) {
      last = i;
      continue;
    }
    if (indentOf(line) === indent && /^\s*[}\])]/.test(line)) last = i;
    break;
  }
  return last;
}

/** The comment lines (`/** … *\/` or `//`) directly above line `at`, as the index of the first; `at` when none. */
function docAbove(lines: string[], at: number): number {
  let first = at;
  for (let i = at - 1; i >= 0; i--) {
    const t = (lines[i] ?? "").trim();
    if (t.startsWith("/**") || t.startsWith("*") || t.startsWith("//")) first = i;
    else break;
  }
  return first;
}

/**
 * Where a named piece of `text` is. `path` is a top-level symbol (`pot`, `BURNER_COST`, `perSecond`, a name a
 * top-level destructuring binds, or a function a top-level statement calls: `mountGame`) or `*` for the whole file,
 * then optionally ` > key > key` for an entry nested in it (`pot > actions`). A top-level symbol brings its
 * doc comment with it; a nested key does not unless `doc` is true.
 */
export function findPiece(text: string, path: string, options: { doc?: boolean } = {}): Range {
  if (path.trim() === "*") return { start: 0, end: text.replace(/\s+$/, "").length };
  const [symbol, ...keys] = path.split(">").map((part) => part.trim());
  if (!symbol) throw new SourceError(`an empty piece name`);
  const lines = text.split("\n");
  const starts = lineStarts(text);
  const name = escapeRe(symbol);
  const declare = new RegExp(
    `^(?:export\\s+)?(?:default\\s+)?(?:declare\\s+)?(?:async\\s+)?(?:const|let|var|function\\*?|class|type|interface|enum)\\s+${name}\\b`,
  );
  // A name bound by destructuring (`const { useGameState } = …`), or a top-level call (`mountGame(store, …)`).
  const destructured = new RegExp(`^(?:export\\s+)?(?:const|let|var)\\s+\\{[^}]*\\b${name}\\b[^}]*\\}\\s*=`);
  const called = new RegExp(`^(?:await\\s+)?${name}\\(`);
  let first = lines.findIndex((line) => declare.test(line));
  if (first < 0) first = lines.findIndex((line) => destructured.test(line));
  if (first < 0) first = lines.findIndex((line) => called.test(line));
  if (first < 0) throw new SourceError(`no top-level \`${symbol}\` in the file`);
  let last = blockEnd(lines, first, 0);
  let docFirst = docAbove(lines, first);
  for (const key of keys) {
    const keyLine = new RegExp(`^(\\s+)(?:async\\s+)?(?:"${escapeRe(key)}"|${escapeRe(key)})\\s*[:(]`);
    let found = -1;
    let depth = Infinity;
    for (let i = first + 1; i <= last; i++) {
      const m = keyLine.exec(lines[i] ?? "");
      // The shallowest match: `actions` the feature's own, not a key of the same name deeper in.
      if (m?.[1] && m[1].length < depth) {
        found = i;
        depth = m[1].length;
      }
    }
    if (found < 0) throw new SourceError(`no \`${key}\` inside \`${path}\``);
    first = found;
    last = blockEnd(lines, found, depth);
    docFirst = options.doc ? docAbove(lines, found) : found;
  }
  const start = starts[docFirst] ?? 0;
  return { start, end: lineEnd(text, starts[last] ?? 0) };
}

/** The indent common to every non-blank line of `text`, and `text` without it. */
export function dedent(text: string): { text: string; indent: number } {
  const lines = text.split("\n");
  const indent = Math.min(...lines.filter((l) => l.trim() !== "").map(indentOf));
  const by = Number.isFinite(indent) ? indent : 0;
  return { text: lines.map((l) => l.slice(Math.min(by, indentOf(l)))).join("\n"), indent: by };
}

/** `text` with every non-blank line after the first indented by `indent` spaces (the inverse of `dedent`). */
export function reindent(text: string, indent: number): string {
  const pad = " ".repeat(indent);
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : pad + line))
    .join("\n");
}

/**
 * Where a parameter's token sits in `text`: `find` must occur exactly once inside `piece`, and `token` exactly once
 * inside `find`. Returns the token's absolute range.
 */
export function findToken(text: string, piece: Range, find: string, token: string): Range {
  const inside = text.slice(piece.start, piece.end);
  const at = inside.indexOf(find);
  if (at < 0) throw new SourceError(`\`${find}\` is not in the piece`);
  if (inside.indexOf(find, at + 1) >= 0) throw new SourceError(`\`${find}\` is in the piece more than once`);
  const t = find.indexOf(token);
  if (t < 0) throw new SourceError(`\`${token}\` is not in \`${find}\``);
  if (find.indexOf(token, t + 1) >= 0) throw new SourceError(`\`${token}\` is in \`${find}\` more than once`);
  const start = piece.start + at + t;
  return { start, end: start + token.length };
}

/** Replaces each range of `text` (none overlapping) with its text. */
export function splice(text: string, edits: readonly { range: Range; text: string }[]): string {
  const sorted = [...edits].sort((a, b) => b.range.start - a.range.start);
  let out = text;
  for (const { range, text: put } of sorted) out = out.slice(0, range.start) + put + out.slice(range.end);
  return out;
}

/** The pieces of `text` named in `omit` (each `piece > key`, nested in `range`), cut to one `// ...` line each. */
export function omitKeys(
  text: string,
  path: string,
  omit: readonly string[],
): { range: Range; text: string }[] {
  return omit.map((key) => {
    const range = findPiece(text, `${path} > ${key}`);
    const indent = indentOf(text.slice(range.start, lineEnd(text, range.start)));
    return { range, text: `${" ".repeat(indent)}// ...` };
  });
}

/** The specifiers a module imports, as written (`watchpot/core`, `./simmer/game`). */
export function importsOf(text: string): string[] {
  return [...text.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1] ?? "");
}
