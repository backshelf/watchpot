/**
 * Ties the guide's quoted code and output to the runnable examples in `docs/examples/`. Run by
 * `test/docs/guide-examples.slow.test.ts`; run it by hand to rewrite the quoted output from the real output:
 *
 *   bun scripts/guide-examples.ts           check, print every finding, exit 1 on any
 *   bun scripts/guide-examples.ts --write   rewrite each `example-output` block from what its example prints
 *
 * The convention is in `docs/README.md`, "Keeping the guide's examples true".
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const GUIDE = join(ROOT, "docs", "guide");
const EXAMPLES = join(ROOT, "docs", "examples");

export type Kind = "output" | "code" | "prints";

/** One marker in a chapter, and the fenced block it sits above (none for `prints`). */
export type Marker = {
  chapter: string;
  /** 1-based line of the marker. */
  line: number;
  kind: Kind;
  /** The example's path under `docs/examples/`. */
  file: string;
  /** `output` only: the 1-based inclusive range of the example's stdout lines the block quotes (default: all). */
  range: [number, number] | null;
  /** `prints` only: lines the example's stdout must contain. */
  texts: string[];
  /** The fenced block: its line indexes (0-based, of the opening and closing fence) and its lines. */
  fence: { open: number; close: number; lines: string[] } | null;
  /** "1st output block" and so on, counted per chapter and kind. */
  name: string;
};

export type Finding = { chapter: string; message: string };

const MARKER = /^<!--\s*example-(output|code|prints):\s*(.*?)\s*-->\s*$/;

const lf = (s: string) => s.replaceAll("\r\n", "\n");

const ordinal = (n: number) =>
  `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

export const chapters = (): string[] =>
  readdirSync(GUIDE)
    .filter((f) => /^\d\d-.*\.md$/.test(f))
    .sort();

const read = (chapter: string) => lf(readFileSync(join(GUIDE, chapter), "utf8")).split("\n");

/** Every marker in one chapter, with its fenced block. A malformed marker comes back in `problems`. */
export const parseChapter = (chapter: string): { markers: Marker[]; problems: Finding[] } => {
  const lines = read(chapter);
  const markers: Marker[] = [];
  const problems: Finding[] = [];
  const counts: Record<string, number> = {};
  for (let i = 0; i < lines.length; i++) {
    const m = MARKER.exec(lines[i] ?? "");
    if (!m) continue;
    const kind = m[1] as Kind;
    const where = `${chapter}:${i + 1}`;
    const body = m[2] ?? "";
    let file = body;
    let range: [number, number] | null = null;
    let texts: string[] = [];
    if (kind === "prints") {
      const parts = body.split("|").map((p) => p.trim());
      file = parts[0] ?? "";
      texts = parts.slice(1).filter(Boolean);
      if (texts.length === 0) {
        problems.push({
          chapter,
          message: `${where}: an example-prints marker names no text (use \`file | text | text\`)`,
        });
        continue;
      }
    } else {
      const parts = body.split(/\s+/);
      file = parts[0] ?? "";
      for (const extra of parts.slice(1)) {
        const r = /^lines=(\d+)-(\d+)$/.exec(extra);
        if (kind === "output" && r) range = [Number(r[1]), Number(r[2])];
        else problems.push({ chapter, message: `${where}: unknown marker option "${extra}"` });
      }
    }
    counts[kind] = (counts[kind] ?? 0) + 1;
    const name = `${ordinal(counts[kind] ?? 0)} ${kind} marker`;
    let fence: Marker["fence"] = null;
    if (kind !== "prints") {
      let open = i + 1;
      while (open < lines.length && (lines[open] ?? "").trim() === "") open++;
      const opener = lines[open] ?? "";
      if (!opener.startsWith("```")) {
        problems.push({ chapter, message: `${where}: the ${name} is not followed by a fenced block` });
        continue;
      }
      let close = open + 1;
      while (close < lines.length && !(lines[close] ?? "").startsWith("```")) close++;
      fence = { open, close, lines: lines.slice(open + 1, close) };
    }
    markers.push({ chapter, line: i + 1, kind, file, range, texts, fence, name });
  }
  return { markers, problems };
};

/** What an example prints on stdout, as lines. The example hands its own clock and seed to the engine. */
const runExample = async (file: string): Promise<string[]> => {
  const proc = Bun.spawn(["bun", join("docs", "examples", file)], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, out, err] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`exited ${code}: ${err.trim().split("\n").slice(-3).join(" / ")}`);
  return lf(out).trimEnd().split("\n");
};

const diff = (want: string[], got: string[]): string => {
  const out: string[] = [];
  const n = Math.max(want.length, got.length);
  for (let i = 0; i < n; i++) {
    const w = want[i];
    const g = got[i];
    if (w === g) out.push(`    ${w}`);
    else {
      if (w !== undefined) out.push(`  - ${w}`);
      if (g !== undefined) out.push(`  + ${g}`);
    }
  }
  return out.join("\n");
};

/** Segments of a quoted code block: it may leave parts out with a line that is only `// ...`. */
const segments = (block: string[]): string[][] => {
  const out: string[][] = [[]];
  for (const l of block) {
    if (l.trim() === "// ...") out.push([]);
    else out[out.length - 1]?.push(l.trim());
  }
  return out.filter((s) => s.length > 0);
};

/** The first line at or after `from` where `seg` appears whole in `file`, or -1. Lines are compared trimmed. */
const find = (file: string[], seg: string[], from: number): number => {
  for (let at = from; at + seg.length <= file.length; at++) {
    if (seg.every((l, k) => file[at + k] === l)) return at;
  }
  return -1;
};

/** A line that is only a comment: a `//` line or a line of a block comment. */
const comment = (l: string) => /^(\/\/|\/\*|\*)/.test(l.trim());

/**
 * A quote matches when each of its segments is in the example, in order, with lines compared trimmed. A quote may
 * also leave out the example's whole-line comments (and bring none of its own that the example lacks): when the
 * strict match fails, both sides are compared again with their whole-line comments removed.
 */
const codeFinding = (m: Marker, source: string[]): string | null => {
  const strict = matchCode(m.fence?.lines ?? [], source);
  if (!strict) return null;
  const bare = matchCode(
    (m.fence?.lines ?? []).filter((l) => !comment(l) || l.trim() === "// ..."),
    source.filter((l) => !comment(l)),
  );
  return bare ? strict : null;
};

const matchCode = (block: string[], source: string[]): string | null => {
  const file = source.map((l) => l.trim());
  let from = 0;
  for (const seg of segments(block)) {
    const at = find(file, seg, from);
    if (at < 0) {
      // Report the line where the quote stops agreeing with the closest place in the file.
      let best = 0;
      let bestAt = 0;
      for (let start = 0; start < file.length; start++) {
        let k = 0;
        while (k < seg.length && file[start + k] === seg[k]) k++;
        if (k > best) [best, bestAt] = [k, start];
      }
      const where =
        find(file, seg, 0) >= 0
          ? "it is in the example, but earlier than the part before it"
          : "it differs from the example";
      return [
        `${where}; the quote matches for ${best} line(s), then:`,
        `    quoted:  ${seg[best] ?? "(ends)"}`,
        `    example: ${source[bestAt + best]?.trim() ?? "(ends)"}`,
      ].join("\n");
    }
    from = at + seg.length;
  }
  return null;
};

/** Every example file the guide can quote: `guide-*` files and the Simmer folder, as paths under `docs/examples/`. */
export const guideExamples = (): string[] => {
  const top = readdirSync(EXAMPLES, { withFileTypes: true });
  const own = top.filter((e) => e.isFile() && e.name.startsWith("guide-")).map((e) => e.name);
  const simmer = readdirSync(join(EXAMPLES, "simmer"), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(EXAMPLES, join(e.parentPath, e.name)).replaceAll("\\", "/"));
  return [...own, ...simmer].sort();
};

export type Report = {
  /** Findings by chapter file name; every chapter has an entry. */
  byChapter: Map<string, Finding[]>;
  /** Findings that belong to no chapter: an example no chapter references. */
  loose: Finding[];
  markers: Marker[];
  /** The stdout of each example a marker needed. */
  stdout: Map<string, string[] | Error>;
};

export const check = async (): Promise<Report> => {
  const byChapter = new Map<string, Finding[]>();
  const markers: Marker[] = [];
  const text = new Map<string, string>();
  for (const chapter of chapters()) {
    const { markers: ms, problems } = parseChapter(chapter);
    byChapter.set(chapter, [...problems]);
    markers.push(...ms);
    text.set(chapter, read(chapter).join("\n"));
  }
  const add = (chapter: string, message: string) => byChapter.get(chapter)?.push({ chapter, message });

  const known = new Set(guideExamples());
  const existing = (file: string) => {
    try {
      readFileSync(join(EXAMPLES, file));
      return true;
    } catch {
      return false;
    }
  };

  // The examples that print what a chapter quotes run once each, side by side.
  const needed = [
    ...new Set(markers.filter((m) => m.kind !== "code" && existing(m.file)).map((m) => m.file)),
  ];
  const stdout = new Map<string, string[] | Error>();
  await Promise.all(
    needed.map(async (file) => {
      try {
        stdout.set(file, await runExample(file));
      } catch (e) {
        stdout.set(file, e instanceof Error ? e : new Error(String(e)));
      }
    }),
  );

  for (const m of markers) {
    const at = `${m.chapter}:${m.line}`;
    if (!existing(m.file)) {
      add(m.chapter, `${at}: the ${m.name} points at docs/examples/${m.file}, which does not exist`);
      continue;
    }
    if (m.kind === "code") {
      const miss = codeFinding(m, lf(readFileSync(join(EXAMPLES, m.file), "utf8")).split("\n"));
      if (miss)
        add(m.chapter, `${at}: the ${m.name} quotes code that is not in docs/examples/${m.file}\n${miss}`);
      continue;
    }
    const out = stdout.get(m.file);
    if (out instanceof Error || !out) {
      add(m.chapter, `${at}: docs/examples/${m.file} did not run: ${out?.message ?? "no output"}`);
      continue;
    }
    if (m.kind === "prints") {
      for (const t of m.texts) {
        if (!out.some((l) => l.trim() === t)) {
          add(
            m.chapter,
            `${at}: the text below is not a line that docs/examples/${m.file} prints:\n    ${t}`,
          );
        }
      }
      continue;
    }
    const [from, to] = m.range ?? [1, out.length];
    const want = out.slice(from - 1, to).map((l) => l.trimEnd());
    const got = (m.fence?.lines ?? []).map((l) => l.trimEnd());
    if (want.join("\n") !== got.join("\n")) {
      add(
        m.chapter,
        `${at}: the ${m.name} quotes output that docs/examples/${m.file} does not print (lines ${from}-${to}; - is printed, + is quoted)\n${diff(want, got)}`,
      );
    }
  }

  // Every example file is quoted, linked or run from some chapter.
  const all = [...text.values()].join("\n");
  const loose: Finding[] = [];
  for (const file of known) {
    if (!all.includes(`examples/${file}`) && !markers.some((m) => m.file === file)) {
      loose.push({ chapter: "", message: `docs/examples/${file} is referenced by no chapter` });
    }
  }
  return { byChapter, loose, markers, stdout };
};

/** Rewrites every `example-output` block from what its example prints. Returns the blocks it changed. */
export const write = async (): Promise<string[]> => {
  const { markers, stdout } = await check();
  const changed: string[] = [];
  for (const chapter of chapters()) {
    const mine = markers.filter((m) => m.chapter === chapter && m.kind === "output" && m.fence);
    if (mine.length === 0) continue;
    const lines = read(chapter);
    // Bottom up, so a block that grows does not move the ones above it.
    for (const m of mine.sort((a, b) => b.line - a.line)) {
      const out = stdout.get(m.file);
      if (!m.fence || !out || out instanceof Error) continue;
      const [from, to] = m.range ?? [1, out.length];
      const next = out.slice(from - 1, to).map((l) => l.trimEnd());
      if (next.join("\n") === m.fence.lines.map((l) => l.trimEnd()).join("\n")) continue;
      lines.splice(m.fence.open + 1, m.fence.close - m.fence.open - 1, ...next);
      changed.push(`${chapter}:${m.line}`);
    }
    writeFileSync(join(GUIDE, chapter), lines.join("\n"));
  }
  return changed;
};

if (import.meta.main) {
  if (process.argv.includes("--write")) {
    const changed = await write();
    console.log(
      changed.length
        ? `rewrote ${changed.length} block(s):\n  ${changed.join("\n  ")}`
        : "nothing to rewrite",
    );
  } else {
    const report = await check();
    const all = [...report.byChapter.values()].flat().concat(report.loose);
    for (const f of all) console.log(`${f.message}\n`);
    console.log(all.length ? `${all.length} finding(s)` : `ok: ${report.markers.length} marker(s)`);
    process.exit(all.length ? 1 : 0);
  }
}
