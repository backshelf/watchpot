#!/usr/bin/env bun
/**
 * 0.9.0: the sound comes from `watchpot/sound` alone, and `createStems`, `stemOffset`, `soundSamples` and `mixLayers`
 * are gone. Run from the game's root:
 *
 *   bun ../watchpot/codemods/0.9.0-sound.ts [--write]
 *
 * Always: every import and export-from of `watchpot/kit` is split by where its names live now. A name `watchpot/sound`
 * exports under the same name (`createSound`, `Sound`, `SoundCue`, `SoundOptions`, `ClipLayer`, `Layer`, `Voice`,
 * `Wave`, `ZzfxParams`, `soundSeconds`, `toParams`) moves to `watchpot/sound`; the rest of the statement stays on
 * `watchpot/kit`. A statement with only moved names changes its module and nothing else.
 *
 * What it cannot prove it lists for a human, with file and line and what to write instead: every use of `createStems`,
 * `stemOffset`, `mixLayers`, `soundSamples` and `.context()`, the import of a name nothing exports now, and a namespace
 * import, `export *` or dynamic import of `watchpot/kit` that reaches a sound name.
 *
 * A dry run by default: it prints the edits and changes nothing until `--write`. Run the game's formatter afterwards:
 * the rewritten imports are written plainly, and a file may now import `watchpot/sound` twice.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const KIT = "watchpot/kit";
const SOUND = "watchpot/sound";

/** What the 0.6.1 kit exported that `watchpot/sound` still exports, by the same name. */
export const MOVED: ReadonlySet<string> = new Set([
  "ClipLayer",
  "createSound",
  "Layer",
  "Sound",
  "SoundCue",
  "SoundOptions",
  "soundSeconds",
  "toParams",
  "Voice",
  "Wave",
  "ZzfxParams",
]);

const STEMS =
  "`sound.music({ pack, stems: [...], sections })` over a built pack (docs/sound-music.md, docs/sound-packs.md): " +
  "`mix(levels)` becomes `music.section(name)` (on the bar) or `music.layer(stem, level)` (now); `position(stem)` " +
  "becomes `sound.transport.position()`; `meter()` becomes `sound.tap.read().level`; mute and volume are the sound's";

/** What each name that no entry exports now was, and what to write instead. */
export const GONE: Readonly<Record<string, string>> = {
  createStems: STEMS,
  Stems: "the type of `createStems`' result: `Music` from `watchpot/sound` is the type of `sound.music(...)`",
  StemsOptions:
    "the options of `createStems`: `MusicDef` from `watchpot/sound` is the definition of `sound.music`",
  stemOffset:
    "gone: the core keeps every loop in phase with the transport, so a stem raised late lands on the beat. Delete the call",
  mixLayers:
    "gone from the public surface: the sound renders each cue's zzfx `voices` itself, once. Delete the call and give the " +
    "cue `voices`",
};

const SOUND_SAMPLES =
  "`soundSamples(key)` is gone and nothing hands out a cue's samples: `sound.soundInfo(key)` has its length and whether " +
  "it plays a recording or zzfx voices, `sound.tap.read()` is the live master as figures to draw, and " +
  "`capture(sound, seconds)` records the output in development";
const CONTEXT =
  "`sound.context()` is unchanged (the AudioContext everything plays through, null before `unlock()`). It needs nothing " +
  "unless it fed `createStems`: then delete both with it (see createStems)";

/** What to do about a name the kit used to export. */
const explain = (name: string): string =>
  GONE[name] ?? (name === "soundSamples" ? SOUND_SAMPLES : `import it from ${SOUND}`);

/** The call sites listed for a human: a pattern over code (comments and strings blanked), and what to say. */
const SITES: readonly { pattern: RegExp; why: (m: RegExpExecArray) => string }[] = [
  { pattern: /\bcreateStems\b/g, why: () => `createStems: ${STEMS}` },
  { pattern: /\bstemOffset\b/g, why: () => `stemOffset: ${GONE.stemOffset}` },
  { pattern: /\bmixLayers\b/g, why: () => `mixLayers: ${GONE.mixLayers}` },
  { pattern: /\bsoundSamples\b/g, why: () => SOUND_SAMPLES },
  { pattern: /\.context\s*\(\s*\)/g, why: () => CONTEXT },
  { pattern: /\bcontext\s*:\s*[\w$.]+\.context\b(?!\s*\()/g, why: () => CONTEXT },
];

const SKIP_DIRS = new Set(["node_modules", "dist"]);
const SOURCE = /\.(c|m)?(t|j)sx?$/;

/** The game's sources, root-relative POSIX, outside `node_modules`, `dist` and dot-folders. */
export function gameFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const d of readdirSync(join(root, rel), { withFileTypes: true })) {
      const path = rel === "" ? d.name : `${rel}/${d.name}`;
      if (d.isDirectory()) {
        if (!SKIP_DIRS.has(d.name) && !d.name.startsWith(".")) walk(path);
      } else if (d.isFile() && SOURCE.test(d.name)) out.push(path);
    }
  };
  walk("");
  return out.sort();
}

/**
 * The source with every comment, and the inside of every string and template, replaced by spaces (newlines kept), so
 * a pattern over it reads code only and an offset in it is an offset in the source.
 */
export function code(src: string): string {
  const out = src.split("");
  const blank = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (out[i] !== "\n") out[i] = " ";
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      const to = end < 0 ? src.length : end;
      blank(i, to);
      i = to;
    } else if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const to = end < 0 ? src.length : end + 2;
      blank(i, to);
      i = to;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j++;
        else if (c !== "`" && src[j] === "\n") break;
        j++;
      }
      blank(i + 1, Math.min(j, src.length));
      i = j + 1;
    } else i++;
  }
  return out.join("");
}

/** One name in braces: `type` before it, `as` after it. */
interface Spec {
  type: boolean;
  name: string;
  alias?: string;
}

const SPEC = /^(?:(type)\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?$/;

/** The specifiers inside braces, or null when something else (a comment, odd syntax) is in them. */
function parseSpecs(inner: string): Spec[] | null {
  if (/\/[/*]/.test(inner)) return null;
  const specs: Spec[] = [];
  for (const part of inner.split(",")) {
    const text = part.trim();
    if (text === "") continue;
    const m = SPEC.exec(text);
    if (!m) return null;
    specs.push({
      type: m[1] !== undefined,
      name: m[2] as string,
      ...(m[3] !== undefined ? { alias: m[3] } : {}),
    });
  }
  return specs;
}

const specText = (s: Spec) => `${s.type ? "type " : ""}${s.name}${s.alias ? ` as ${s.alias}` : ""}`;

/** `import { a, b } from "module";` as the original wrote its keyword, quote and semicolon. */
function render(kind: string, typeOnly: boolean, specs: Spec[], quote: string, module: string, semi: string) {
  return `${kind}${typeOnly ? " type" : ""} { ${specs.map(specText).join(", ")} } from ${quote}${module}${quote}${semi}`;
}

/** A statement of `watchpot/kit` that names braces. */
const STATEMENT = /(import|export)(\s+type)?\s*\{([^}]*)\}\s*from\s*(["'])watchpot\/kit\4(\s*;)?/y;
const NAMESPACE = /import\s+(?:type\s+)?\*\s+as\s+([\w$]+)\s+from\s*(["'])watchpot\/kit\2/y;
const STAR_EXPORT = /export\s+(?:type\s+)?\*(?:\s+as\s+[\w$]+)?\s+from\s*(["'])watchpot\/kit\1/y;
const DYNAMIC = /(?:\bimport|\brequire)\s*\(\s*(["'])watchpot\/kit\1\s*\)/y;

/** An edit to a source: replace `[from, to)` with `text`. */
interface Edit {
  from: number;
  to: number;
  text: string;
  line: number;
  before: string;
}

/** What the codemod found in one file. */
export interface FilePlan {
  file: string;
  /** The source after the edits (the same text when there are none). */
  after: string;
  edits: Edit[];
  human: { line: number; why: string }[];
}

/** The 1-based line of an offset. */
function lineAt(src: string, at: number): number {
  let line = 1;
  for (let i = 0; i < at; i++) if (src[i] === "\n") line++;
  return line;
}

/** Plans one file: the import edits, and what is left for a human. */
export function planFile(file: string, src: string): FilePlan {
  const masked = code(src);
  const edits: Edit[] = [];
  const human: FilePlan["human"] = [];
  const listed = new Set<string>();
  const note = (at: number, why: string) => {
    const line = lineAt(src, at);
    const key = `${line}:${why}`;
    if (listed.has(key)) return;
    listed.add(key);
    human.push({ line, why });
  };
  /** The statements already read, so a use inside one is not listed twice. */
  const covered: [number, number][] = [];
  const gone = (at: number, name: string) =>
    note(at, `import of ${name}, which nothing exports now: ${GONE[name]}`);

  for (const m of masked.matchAll(/\b(?:import|export|require)\b/g)) {
    const at = m.index;
    STATEMENT.lastIndex = at;
    const st = STATEMENT.exec(src);
    if (st) {
      const text = st[0];
      const kind = st[1] as string;
      const type = st[2];
      const quote = st[4] as string;
      const semi = st[5] ?? "";
      covered.push([at, at + text.length]);
      const specs = parseSpecs(st[3] as string);
      if (!specs) {
        note(
          at,
          `a ${kind} of ${KIT} with a comment or odd syntax in its braces: move any sound names to ${SOUND} by hand`,
        );
        continue;
      }
      const moved = specs.filter((s) => MOVED.has(s.name));
      for (const s of specs) if (s.name in GONE) gone(at, s.name);
      if (moved.length === 0) continue;
      const stay = specs.filter((s) => !MOVED.has(s.name));
      const typeOnly = type !== undefined;
      const column = at - (src.lastIndexOf("\n", at - 1) + 1);
      const indent = " ".repeat(column);
      const sound = render(kind, typeOnly, moved, quote, SOUND, semi);
      const replacement =
        stay.length === 0 ? sound : `${render(kind, typeOnly, stay, quote, KIT, semi)}\n${indent}${sound}`;
      edits.push({ from: at, to: at + text.length, text: replacement, line: lineAt(src, at), before: text });
      continue;
    }
    NAMESPACE.lastIndex = at;
    const ns = NAMESPACE.exec(src);
    if (ns) {
      const name = ns[1] as string;
      const names = [...MOVED, ...Object.keys(GONE), "soundSamples"].join("|");
      const use = new RegExp(`\\b${name.replace(/\$/g, "\\$")}\\s*\\.\\s*(${names})\\b`, "g");
      for (const u of masked.matchAll(use))
        note(
          u.index,
          `${name}.${u[1]} reads the sound through the kit's namespace, which exports none now: ${explain(u[1] as string)}`,
        );
      continue;
    }
    STAR_EXPORT.lastIndex = at;
    if (STAR_EXPORT.exec(src)) {
      note(at, `export * from ${KIT} no longer passes the sound on: export it from ${SOUND}`);
      continue;
    }
    DYNAMIC.lastIndex = at;
    if (DYNAMIC.exec(src))
      note(at, `${KIT} loaded dynamically: a sound name read from it comes from ${SOUND} now`);
  }

  for (const { pattern, why } of SITES) {
    for (const m of masked.matchAll(pattern)) {
      if (covered.some(([from, to]) => m.index >= from && m.index < to)) continue;
      note(m.index, why(m));
    }
  }

  let after = src;
  for (const e of [...edits].sort((a, b) => b.from - a.from))
    after = after.slice(0, e.from) + e.text + after.slice(e.to);
  human.sort((a, b) => a.line - b.line);
  return { file, after, edits, human };
}

/** What the codemod would do to a game. */
export interface Plan {
  files: FilePlan[];
}

/** Plans every source file under `root`. */
export function plan(root: string): Plan {
  const files: FilePlan[] = [];
  for (const file of gameFiles(root)) {
    const p = planFile(file, readFileSync(join(root, file), "utf8"));
    if (p.edits.length > 0 || p.human.length > 0) files.push(p);
  }
  return { files };
}

/** The report, one line each. */
export function report(p: Plan, write: boolean): string[] {
  const out = [
    `watchpot 0.9.0 sound codemod (${write ? "writing" : "dry run: nothing changed, pass --write"})`,
  ];
  const edited = p.files.filter((f) => f.edits.length > 0);
  const statements = edited.reduce((n, f) => n + f.edits.length, 0);
  if (statements > 0) {
    out.push("", `Imports (${statements})`);
    for (const f of edited) {
      for (const e of f.edits) {
        out.push(`  ${f.file}:${e.line}  ${e.before.replace(/\s+/g, " ")}`);
        for (const line of e.text.split("\n")) out.push(`      -> ${line.trim()}`);
      }
    }
  }
  const human = p.files.flatMap((f) => f.human.map((h) => ({ file: f.file, ...h })));
  if (human.length > 0) {
    out.push("", `For a human (${human.length})`);
    for (const h of human) out.push(`  ${h.file}:${h.line}  ${h.why}`);
  }
  out.push(
    "",
    `Summary: ${statements} imports rewritten in ${edited.length} files, ${human.length} items for a human.`,
  );
  if (statements > 0)
    out.push(
      "Run the game's formatter afterwards: the rewritten imports are written plainly, and may repeat a module.",
    );
  return out;
}

export const USAGE = `Usage: bun <watchpot>/codemods/0.9.0-sound.ts [--write]

Run from the game's root. A dry run unless --write.
  --write   apply the import edits`;

export function main(
  argv: string[],
  io: { cwd: string; log: (line: string) => void } = { cwd: process.cwd(), log: console.log },
): number {
  let write = false;
  for (const arg of argv) {
    if (arg === "--write") write = true;
    else if (arg === "--help" || arg === "-h") {
      io.log(USAGE);
      return 0;
    } else {
      io.log(`Unknown argument: ${arg}\n\n${USAGE}`);
      return 2;
    }
  }
  const p = plan(io.cwd);
  for (const line of report(p, write)) io.log(line);
  if (write) for (const f of p.files) if (f.edits.length > 0) writeFileSync(join(io.cwd, f.file), f.after);
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
