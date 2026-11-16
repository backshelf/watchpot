// The import rules of the engine: the table, the matcher, the import reader and the walk that lists violations.
// `test/rules/imports.test.ts` fails on any value violation. The engine imports itself by relative path and, from
// the kit and the sim, by its own package name (`watchpot/core`), so a rule lists both spellings.
import { existsSync } from "node:fs";
import { posix } from "node:path";

/**
 * One rule. `from` picks the importing files. `forbid` names what they may not import:
 * - a path prefix (`src/react/`);
 * - a package (`pkg:react`, which also covers `react/...`);
 * - a target extension (`ext:.tsx`);
 * - a `RegExp`, tested against the target path.
 *
 * `allow` lists target path prefixes that stay legal and `exceptFrom` importers the rule skips. `names`, when set,
 * narrows the rule to imports that bring in one of those value names (`ImportRef.names` says what escapes it);
 * `exceptNames` exempts an import whose every value name is in the list (a type-only import has none).
 * `source` is where the rule is written down, cited by quoted phrase.
 */
export interface ImportRule {
  id: string;
  from: RegExp;
  forbid: (string | RegExp)[];
  allow?: string[];
  exceptFrom?: RegExp[];
  names?: string[];
  exceptNames?: string[];
  source: string[];
}

const DEV = /\/dev\//;
const CORE = ["pkg:watchpot/core", "src/core/"];
/** What the kit and the headless UI may take from `/core`: formatting and `decimal` helpers (types are free). */
const CORE_FOR_UI = [
  "SUFFIXES",
  "PLAIN_BELOW",
  "SCIENTIFIC_FROM_EXPONENT",
  "fmt",
  "fmtFull",
  "fmtCents",
  "fmtTimer",
  "fmtWait",
  "fmtPercent",
  "bonusPercent",
  "fmtCount",
  "D",
  "Decimal",
  "ZERO",
  "ONE",
  "isDecimal",
  "sum",
  "wholeNonNegative",
  "take",
  "toSafeNumber",
];
export const IMPORT_RULES: ImportRule[] = [
  {
    id: "kernel-pure",
    from: /^src\/core\//,
    forbid: [
      "pkg:react",
      "pkg:react-dom",
      "pkg:motion",
      "pkg:@paper-design/shaders-react",
      "pkg:canvas-confetti",
      "pkg:zzfx",
      "src/react/",
      "src/kit/",
    ],
    source: [".claude/CLAUDE.md › Rules: `/core` is pure"],
  },
  {
    id: "core-no-react",
    from: /^src\/(core|sim)\//,
    forbid: ["pkg:react", "pkg:react-dom", "pkg:motion", "pkg:@paper-design/shaders-react"],
    source: [".claude/CLAUDE.md › Rules: `/core` and `/sim` never import React"],
  },
  {
    // The kit's effects take props and read no game state: no store, no other entry but `/core` (narrowed by
    // `kit-core-narrow`).
    id: "kit-props-only",
    from: /^src\/kit\//,
    forbid: [
      "pkg:zustand",
      "pkg:watchpot/react",
      "pkg:watchpot/sim",
      "pkg:watchpot/test",
      "src/react/",
      "src/sim/",
      "src/test/",
    ],
    exceptFrom: [DEV],
    source: [".claude/CLAUDE.md › Rules: the kit takes props only"],
  },
  {
    // The kit is effects with no look: no stylesheet, and none of the UI packages a look is drawn with.
    id: "kit-lookless",
    from: /^src\/kit\//,
    forbid: ["ext:.css", "pkg:motion", "pkg:@paper-design/shaders-react"],
    source: ["README.md › Kit: `watchpot/kit` ships no CSS file and no class name of its own"],
  },
  {
    // From `/core` the kit reads only formatting (`fmt`), `decimal` helpers and `world` types.
    id: "kit-core-narrow",
    from: /^src\/kit\//,
    forbid: CORE,
    exceptNames: CORE_FOR_UI,
    source: [".claude/CLAUDE.md › Rules: the kit reads `/core` only for `fmt`, `decimal` and `world`"],
  },
  {
    // The headless primitives are behaviour alone: React, their own folder, the page-layout hook and `/core`
    // (narrowed by `ui-core-narrow`). No kit, no stylesheet, no motion, no store, no other entry.
    id: "ui-headless",
    from: /^src\/ui\//,
    forbid: [
      /^(?!src\/ui\/|src\/core\/|src\/react\/layout\.tsx$|pkg:react$|pkg:react-dom$|pkg:watchpot\/core$)/,
      "ext:.css",
    ],
    source: [
      "docs/ui.md: `watchpot/ui` peers on `react` and `react-dom` alone and reads `/core` for formatting",
    ],
  },
  {
    // From `/core` the primitives read what the kit reads: formatting and `decimal` helpers, and types.
    id: "ui-core-narrow",
    from: /^src\/ui\//,
    forbid: CORE,
    exceptNames: CORE_FOR_UI,
    source: ["docs/ui.md: from `/core`, formatting and `decimal` helpers only"],
  },
  {
    // The shader container stands alone: React and its own folder.
    id: "shader-alone",
    from: /^src\/shader\//,
    forbid: [/^(?!src\/shader\/|pkg:react$)/],
    source: ["docs/shader.md: `watchpot/shader` imports nothing but React and its own folder"],
  },
  {
    // The sound engine stands alone so `watchpot/sound` installs none of the kit's UI peers.
    id: "sound-alone",
    from: /^src\/sound\//,
    forbid: [/^(?!src\/sound\/|pkg:zzfx$)/],
    // The pack pipeline is a build-time entry of its own (`watchpot/sound/pack`): it runs in Bun and reads files.
    exceptFrom: [/^src\/sound\/pack\//],
    source: ["README.md › Sound: `watchpot/sound` imports nothing but its own folder and `zzfx`"],
  },
  {
    // The pack pipeline never rides into a game's bundle: nothing the sound entry reaches imports it.
    id: "sound-pack-build-time",
    from: /^src\/sound\/(?!pack\/)/,
    forbid: ["src/sound/pack/"],
    source: ["docs/sound-packs.md: `watchpot/sound/pack` runs in Bun at build time, never in a browser"],
  },
  {
    // The 3D entry rides on `/core` and the prefs hook alone, so a game takes it without the kit, the shell or a
    // stylesheet, and the other entries never pull `three` in.
    id: "three-narrow",
    from: /^src\/three\//,
    forbid: [/^src\/(?!three\/|core\/|react\/prefs\.ts$)/, /^pkg:watchpot\/(?!core$)/, "ext:.css"],
    source: ["docs/three.md: `watchpot/three` imports from the engine only `/core` and the prefs hook"],
  },
  {
    id: "three-alone",
    from: /^src\/(?!three\/)/,
    forbid: ["src/three/", "pkg:watchpot/three"],
    source: ["docs/three.md: no other entry imports `watchpot/three`"],
  },
];

/** The package a bare specifier names (`react/jsx-runtime` is `react`, `@a/b/c` is `@a/b`). */
function packageOf(spec: string): string {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? spec);
}

function forbids(f: string | RegExp, target: string): boolean {
  if (f instanceof RegExp) return f.test(target);
  if (f.startsWith("pkg:")) return target === f;
  if (f.startsWith("ext:")) return !target.startsWith("pkg:") && target.endsWith(f.slice(4));
  return target.startsWith(f);
}

/**
 * The rules an import breaks. `target` is a repo path, or `pkg:<name>` for a package; `names` are the value names
 * the import brings in (`ImportRef.names`).
 */
export function brokenRules(from: string, target: string, names: string[] = []): string[] {
  const broken: string[] = [];
  for (const rule of IMPORT_RULES) {
    if (!rule.from.test(from) || rule.exceptFrom?.some((re) => re.test(from))) continue;
    if (rule.names && !rule.names.some((n) => names.includes(n))) continue;
    if (rule.exceptNames && names.every((n) => rule.exceptNames?.includes(n))) continue;
    if (rule.allow?.some((a) => target.startsWith(a))) continue;
    if (rule.forbid.some((f) => forbids(f, target))) broken.push(rule.id);
  }
  return broken;
}

// ---------------------------------------------------------------------------------------------------------------
// The allowlist

/** The allowlist's key for a value violation: one entry covers every import of that rule in that file. */
/** The allowlist's key for a value violation: one entry covers every import of that rule in that file. */
export const allowKey = (file: string, rule: string) => `${file} ${rule}`;

/** Value violations accepted for now, by file and rule. It only shrinks. */
export const ALLOWLIST: ReadonlySet<string> = new Set([]);

/**
 * The repo's files, as forward-slash paths relative to `root`: tracked plus untracked, minus the ignored. Throws
 * when git fails or lists nothing, so a check never passes on an empty scan.
 */
export function trackedFiles(root: string): string[] {
  const p = Bun.spawnSync(["git", "ls-files", "-co", "--exclude-standard"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (p.exitCode !== 0) throw new Error(`git ls-files failed in ${root}: ${p.stderr.toString().trim()}`);
  const files = p.stdout
    .toString()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && existsSync(posix.join(root, l)));
  if (files.length === 0) throw new Error(`git ls-files listed no files in ${root}`);
  return files;
}

export interface ImportRef {
  spec: string;
  typeOnly: boolean;
  /**
   * The value names the clause brings in: each member not marked `type` under its imported name (the part before
   * `as`), `default` for a default binding and `*` for a namespace or a dynamic import. Empty for a type-only or a
   * bare import. A name reached through a namespace or re-exported under another name is not seen.
   */
  names: string[];
  line: number;
  start: number;
  end: number;
}

const FROM_RE = /\b(import|export)\s+(type\s+)?([^;=()"'`]*?)\bfrom\s*["']([^"']+)["']/g;
const BARE_RE = /\bimport\s*["']([^"']+)["']/g;
const DYNAMIC_RE = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

const lineAt = (t: string, index: number) => t.slice(0, index).split("\n").length;

/** `ImportRef.names` of an import clause (`X, { a, b as c, type T }`, `* as ns`, `{ a }`). */
function namesOf(clause: string): string[] {
  const braces = /\{([\s\S]*)\}/.exec(clause);
  const head = braces ? clause.slice(0, braces.index) : clause;
  const names: string[] = head
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith("*") ? "*" : "default"));
  for (const member of (braces?.[1] ?? "").split(",")) {
    const name = member.trim().split(/\s+as\s+/)[0] ?? "";
    if (name && !name.startsWith("type ")) names.push(name);
  }
  return names;
}

/** Every import and export-from in a file; comment lines are blanked first so doc examples do not count. */
export function importsOf(text: string): ImportRef[] {
  const code = text.replace(/^[ \t]*(\/\/|\/?\*).*$/gm, (m) => " ".repeat(m.length));
  const refs: ImportRef[] = [];
  for (const m of code.matchAll(FROM_RE)) {
    // A trailing comment inside the clause would otherwise glue onto the next member's name.
    const clause = (m[3] ?? "").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "").trim();
    const members = /^\{([\s\S]*)\}$/.exec(clause)?.[1];
    const allTypes = (members ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .every((s) => s.startsWith("type "));
    const typeOnly = Boolean(m[2]) || (members !== undefined && allTypes);
    refs.push({
      spec: m[4] ?? "",
      typeOnly,
      names: typeOnly ? [] : namesOf(clause),
      line: lineAt(code, m.index),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  for (const re of [BARE_RE, DYNAMIC_RE])
    for (const m of code.matchAll(re))
      refs.push({
        spec: m[1] ?? "",
        typeOnly: false,
        names: re === DYNAMIC_RE ? ["*"] : [],
        line: lineAt(code, m.index),
        start: m.index,
        end: m.index + m[0].length,
      });
  return refs;
}

/** The repo path a specifier names (trying the extensions and index files), or `pkg:<name>` for a package. */
export function resolve(from: string, spec: string, known: Set<string>): string {
  if (spec.startsWith("watchpot/")) return `pkg:${spec}`;
  if (!spec.startsWith(".")) return `pkg:${packageOf(spec)}`;
  const base = posix.normalize(posix.join(posix.dirname(from), spec));
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}/index.ts`, `${base}/index.tsx`])
    if (known.has(c)) return c;
  return base;
}

export interface Violation {
  file: string;
  line: number;
  imports: string;
  rule: string;
  typeOnly: boolean;
}

/** Whether a repo path is code the rules read: `.ts` and `.tsx` under `src/`. */
export const isRuledCode = (path: string) => /\.(ts|tsx)$/.test(path) && /^src\//.test(path);

/** Every rule every import of `files` breaks, in file and import order. `read` returns a repo path's text. */
export function violations(files: string[], read: (path: string) => string): Violation[] {
  const known = new Set(files);
  const out: Violation[] = [];
  for (const f of files) {
    if (!isRuledCode(f)) continue;
    for (const ref of importsOf(read(f))) {
      const target = resolve(f, ref.spec, known);
      for (const rule of brokenRules(f, target, ref.names))
        out.push({ file: f, line: ref.line, imports: target, rule, typeOnly: ref.typeOnly });
    }
  }
  return out;
}
