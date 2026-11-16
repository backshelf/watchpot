// What the build works out for one guide page from the examples: the listings (quoted from the files, highlighted,
// with the controls' tokens marked), the example's modules as JavaScript (the controls' tokens made placeholders),
// and the code box's piece. Reads files; everything else is in `source.ts`.
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { transform } from "sucrase";
import type { TokenLine } from "../docs/highlight";
import type { CodeData, CodeDef, EditData, PageDef, ParamDef, Run } from "./kit/page";
import type { ModuleSet, ParamValue } from "./kit/run";
import { dedent, findPiece, findToken, importsOf, omitKeys, type Range, SourceError, splice } from "./source";

export type Tokenize = (code: string, lang: string | undefined) => TokenLine[];

export interface ExampleFiles {
  /** The text of a file under `docs/examples/`. Throws when there is none. */
  read(path: string): string;
}

export function exampleFiles(repoRoot: string): ExampleFiles {
  const cache = new Map<string, string>();
  return {
    read(path) {
      const hit = cache.get(path);
      if (hit !== undefined) return hit;
      const full = join(repoRoot, "docs/examples", path);
      let text: string;
      try {
        text = readFileSync(full, "utf8");
      } catch {
        throw new SourceError(`no example docs/examples/${path}`);
      }
      text = text.replace(/\r\n/g, "\n");
      cache.set(path, text);
      return text;
    },
  };
}

const langOf = (file: string) => posix.extname(file).slice(1) || "ts";

/** The example file a param's token is in. */
export const paramFile = (def: ParamDef, gameFile: string): string => def.file ?? gameFile;

/** The token a param changes, and its default value. `text` is its file's (`paramFile`). */
export function paramSite(text: string, def: ParamDef): { range: Range; value: ParamValue } {
  const piece = findPiece(text, def.at);
  const range = findToken(text, piece, def.find, def.token ?? def.find);
  const written = text.slice(range.start, range.end);
  if (def.kind === "choice") {
    const at = def.options.findIndex((o) => o.code === written);
    if (at < 0) throw new SourceError(`none of the choices is the example's own \`${written}\``);
    return { range, value: at };
  }
  // A number written as a string (`D("1.52e6")`) is a number all the same.
  const value = Number(quoted(written) ? written.slice(1, -1) : written);
  if (!Number.isFinite(value)) throw new SourceError(`\`${written}\` is not a number`);
  return { range, value };
}

const quoted = (text: string) => /^(["'`]).*\1$/.test(text);

/** The expression put where a param's token was: its value, read when the example runs. */
function placeholder(name: string, def: ParamDef): string {
  const read = `__param(${JSON.stringify(name)})`;
  if (def.kind !== "choice") return quoted(def.token ?? def.find) ? `String(${read})` : read;
  // A choice puts each of its expressions in, picked by the value: each stays code the example can run.
  return `(${def.options.map((o, i) => `${read} === ${i} ? (${o.run ?? o.code}) : `).join("")}undefined)`;
}

/**
 * An example as JavaScript the page can run: types stripped, imports made `require` calls, JSX for React. The page
 * imports a module and never runs it as a script, so `import.meta.main` (an example's "run me" block) is false.
 */
function toJs(source: string, path: string): string {
  const transforms: ("typescript" | "imports" | "jsx")[] = ["typescript", "imports"];
  if (path.endsWith(".tsx")) transforms.push("jsx");
  const js = transform(source, {
    transforms,
    filePath: path,
    production: true,
    jsxRuntime: "automatic",
  }).code;
  return js.replace(/\bimport\.meta\b/g, "({ main: false })");
}

/**
 * The example's modules: the page's file and every example file it imports, each with the params whose tokens it
 * holds made placeholders.
 */
export function modulesFor(files: ExampleFiles, main: string, params: Record<string, ParamDef>): ModuleSet {
  const edited = (path: string) => {
    const text = files.read(path);
    const edits = Object.entries(params)
      .filter(([, def]) => paramFile(def, main) === path)
      .map(([name, def]) => ({ range: paramSite(text, def).range, text: placeholder(name, def) }));
    return toJs(splice(text, edits), path);
  };
  const js: Record<string, string> = { [main]: edited(main) };
  const queue = [main];
  while (queue.length > 0) {
    const path = queue.shift() ?? "";
    for (const spec of importsOf(files.read(path))) {
      if (!spec.startsWith(".")) continue;
      const base = posix.normalize(posix.join(posix.dirname(path), spec));
      const found = [base, `${base}.ts`, `${base}.tsx`].find((p) => {
        try {
          files.read(p);
          return true;
        } catch {
          return false;
        }
      });
      if (!found || found in js) continue;
      js[found] = edited(found);
      queue.push(found);
    }
  }
  for (const def of Object.values(params)) {
    const file = paramFile(def, main);
    if (!(file in js))
      throw new SourceError(`a control's file, ${file}, is neither ${main} nor one it imports`);
  }
  return { main, js };
}

/**
 * A listing: the piece's text with folded keys cut to `// ...`, dedented, highlighted, and each param's token
 * marked. Built on a per-character map from the listing back to the file, so a token is found wherever it lands.
 */
export function listing(
  files: ExampleFiles,
  tokenize: Tokenize,
  def: CodeDef,
  gameFile: string,
  params: Record<string, ParamDef>,
): CodeData {
  const file = def.file ?? gameFile;
  const text = files.read(file);
  const piece = findPiece(text, def.at);
  const folds = def.omit ? omitKeys(text, def.at, def.omit) : [];
  // The listing, character by character, with each character's offset in the file (-1 for a fold's own text).
  const chars: string[] = [];
  const from: number[] = [];
  // Folds that follow one another with nothing but space between read as one `// ...`.
  const sorted = [...folds]
    .sort((a, b) => a.range.start - b.range.start)
    .reduce<typeof folds>((merged, fold) => {
      const last = merged[merged.length - 1];
      if (last && text.slice(last.range.end, fold.range.start).trim() === "") {
        merged[merged.length - 1] = {
          range: { start: last.range.start, end: fold.range.end },
          text: last.text,
        };
      } else merged.push(fold);
      return merged;
    }, []);
  let at = piece.start;
  for (const fold of [...sorted, null]) {
    const stop = fold ? fold.range.start : piece.end;
    for (let i = at; i < stop; i++) {
      chars.push(text[i] ?? "");
      from.push(i);
    }
    if (fold) {
      for (const c of fold.text) {
        chars.push(c);
        from.push(-1);
      }
      at = fold.range.end;
    }
  }
  // Dedent, keeping the map in step.
  const { indent } = dedent(chars.join(""));
  const keptChars: string[] = [];
  const keptFrom: number[] = [];
  let column = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] ?? "";
    const leading = column < indent && (c === " " || c === "\t");
    if (!leading) {
      keptChars.push(c);
      keptFrom.push(from[i] ?? -1);
    }
    column = c === "\n" ? 0 : column + 1;
  }
  const shown = keptChars.join("");
  // Which listing offsets each param covers.
  const marks: { start: number; end: number; name: string }[] = [];
  for (const [name, p] of Object.entries(params)) {
    if (paramFile(p, gameFile) === file) {
      const site = paramSite(text, p).range;
      const hits = keptFrom.flatMap((src, i) => (src >= site.start && src < site.end ? [i] : []));
      if (hits.length > 0) marks.push({ start: hits[0] ?? 0, end: (hits[hits.length - 1] ?? 0) + 1, name });
    }
  }
  const lang = langOf(file);
  const palette: string[] = [];
  const colour = (c: string | undefined) => {
    const key = c ?? "";
    let i = palette.indexOf(key);
    if (i < 0) i = palette.push(key) - 1;
    return i;
  };
  let offset = 0;
  const lines: Run[][] = tokenize(shown, lang).map((line) => {
    const runs: Run[] = [];
    for (const token of line) {
      const start = offset;
      const end = start + token.content.length;
      // Split the token where a mark begins or ends, so a marked run is exactly the token.
      const cuts = new Set([start, end]);
      for (const m of marks) {
        if (m.start > start && m.start < end) cuts.add(m.start);
        if (m.end > start && m.end < end) cuts.add(m.end);
      }
      const points = [...cuts].sort((a, b) => a - b);
      for (let k = 0; k < points.length - 1; k++) {
        const a = points[k] ?? 0;
        const b = points[k + 1] ?? 0;
        const mark = marks.find((m) => a >= m.start && b <= m.end);
        const piece = shown.slice(a, b);
        runs.push(mark ? [piece, colour(token.color), mark.name] : [piece, colour(token.color)]);
      }
      offset = end;
    }
    offset += 1; // the newline
    return runs;
  });
  return { file, lang, lines, palette };
}

/** The code box: the piece the reader edits, and the file around it. */
export function editFor(files: ExampleFiles, page: PageDef, worker: string): EditData | null {
  const edit = page.game.edit;
  if (!edit) return null;
  const text = files.read(page.game.file);
  const range = findPiece(text, edit.at);
  // The box holds whole lines: from the start of the piece's first line.
  const { text: piece, indent } = dedent(text.slice(range.start, range.end));
  return {
    piece,
    before: text.slice(0, range.start),
    after: text.slice(range.end),
    indent,
    trial: [...(edit.trial ?? [])],
    worker,
  };
}

/** Every value a page's params start at: the example's own. */
export function defaultsFor(files: ExampleFiles, page: PageDef): Record<string, ParamValue> {
  return Object.fromEntries(
    Object.entries(page.params ?? {}).map(([name, def]) => [
      name,
      paramSite(files.read(paramFile(def, page.game.file)), def).value,
    ]),
  );
}
