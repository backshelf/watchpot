// The 0.3.0 codemod's vendor step from the real v0.1.11 tag into a temp game, and the promise behind it: every
// name the rewritten copies take from an engine entry is still exported by that entry today.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  gitTree,
  isRetired,
  main,
  maskSource,
  OLD_EXPORTS,
  scanRefs,
  TAG,
} from "../../codemods/0.3.0-headless-kit";

const ROOT = join(import.meta.dir, "..", "..");
const LOCAL = "src/vendor/kit";
const ENTRIES = {
  "watchpot/kit": "src/kit",
  "watchpot/react": "src/react",
  "watchpot/core": "src/core",
} as const;
type Entry = keyof typeof ENTRIES;

let game = "";
let copies: string[] = [];
beforeAll(() => {
  game = mkdtempSync(join(tmpdir(), "codemod-030-vendor-"));
  expect(main(["--write", "--vendor"], { cwd: game, log: () => {} })).toBe(0);
  copies = readdirSync(join(game, LOCAL), { recursive: true, encoding: "utf8" })
    .map((p) => p.replaceAll("\\", "/"))
    .filter((p) => isFile(join(game, LOCAL, p)));
});
afterAll(() => rmSync(game, { recursive: true, force: true }));

const read = (p: string) => readFileSync(join(game, LOCAL, p), "utf8");
const isFile = (p: string) => existsSync(p) && statSync(p).isFile();

/** Resolves a module path the way the bundler would, to a file that exists, or undefined. */
function resolveFile(base: string, module: string): string | undefined {
  const p = join(base, module);
  return [p, `${p}.ts`, `${p}.tsx`, join(p, "index.ts"), join(p, "index.tsx")].find(isFile);
}

/** Every name a current engine barrel exports, walked through `export *` and its files' own declarations. */
function exportedNames(file: string, seen = new Set<string>()): Set<string> {
  const names = new Set<string>();
  if (seen.has(file)) return names;
  seen.add(file);
  const src = readFileSync(file, "utf8");
  const masked = maskSource(src);
  for (const ref of scanRefs(src, masked)) {
    if (ref.kind !== "export") continue;
    if (ref.form === "named") for (const s of ref.specs ?? []) names.add(s.alias ?? s.name);
    else if (ref.form === "star" && ref.module.startsWith(".")) {
      const target = resolveFile(dirname(file), ref.module);
      if (target) for (const n of exportedNames(target, seen)) names.add(n);
    }
  }
  const DECL =
    /\bexport\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|type|interface|enum|namespace)\s+([\w$]+)/g;
  for (const m of masked.matchAll(DECL)) names.add(m[1] as string);
  for (const m of masked.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}(?!\s*from)/g)) {
    for (const part of (m[1] as string).split(",")) {
      const words = part
        .trim()
        .split(/\s+/)
        .filter((w) => w !== "type");
      const name = words[words.length - 1];
      if (name) names.add(name);
    }
  }
  return names;
}

describe(`vendoring from ${TAG}`, () => {
  test("copies every retired file, plus the index and the legacy effects", () => {
    const retired = gitTree(ROOT).list().filter(isRetired);
    expect(retired.length).toBe(77);
    expect(copies.length).toBe(retired.length + 2);
    expect(copies).toContain("index.ts");
    expect(copies).toContain("legacy-effects.css");
    expect(copies).toContain("kit/ui/Button/Button.module.css");
    expect(copies).toContain("react/GameShell.tsx");
  });

  test("the index re-exports every name that left, from files that were copied", () => {
    const refs = scanRefs(read("index.ts"));
    const names = refs.flatMap((r) => r.specs ?? []).map((s) => s.name);
    expect(names.sort()).toEqual(
      OLD_EXPORTS.filter((e) => e.bucket === "left")
        .map((e) => e.name)
        .sort(),
    );
    for (const ref of refs) expect(resolveFile(join(game, LOCAL), ref.module)).toBeDefined();
  });

  test("every relative import in the copies lands on a copied file", () => {
    const broken: string[] = [];
    for (const file of copies.filter((f) => /\.tsx?$/.test(f))) {
      for (const ref of scanRefs(read(file))) {
        if (!ref.module.startsWith(".")) continue;
        if (!resolveFile(join(game, LOCAL, dirname(file)), ref.module)) broken.push(`${file}: ${ref.module}`);
      }
    }
    expect(broken).toEqual([]);
  });

  test("every name the copies take from an engine entry is exported by that entry today", async () => {
    const wanted: Record<Entry, Map<string, boolean>> = {
      "watchpot/kit": new Map(),
      "watchpot/react": new Map(),
      "watchpot/core": new Map(),
    };
    for (const file of copies.filter((f) => /\.tsx?$/.test(f))) {
      for (const ref of scanRefs(read(file))) {
        if (!(ref.module in wanted)) continue;
        expect(ref.form).toBe("named");
        const into = wanted[ref.module as Entry];
        for (const s of ref.specs ?? [])
          into.set(s.name, (into.get(s.name) ?? false) || !(s.type || ref.typeOnly));
      }
    }
    const missing: Record<string, string[]> = {};
    for (const [entry, names] of Object.entries(wanted) as [Entry, Map<string, boolean>][]) {
      const declared = exportedNames(join(ROOT, ENTRIES[entry], "index.ts"));
      const runtime = new Set(Object.keys(await import(join(ROOT, ENTRIES[entry], "index.ts"))));
      const gone = [...names].filter(([name, value]) => !declared.has(name) || (value && !runtime.has(name)));
      if (gone.length > 0) missing[entry] = gone.map(([name]) => name).sort();
    }
    expect(missing).toEqual({});
  });
});
