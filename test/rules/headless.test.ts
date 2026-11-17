// The engine carries no look: `watchpot/ui` and `watchpot/shader` never arrive at the kit or a stylesheet,
// `watchpot/kit` never arrives at a stylesheet and writes no class name, and the only CSS in `src/` is the dev panel's
// own. A game with its own CSS (and a build with no CSS-module loader) imports them freely. Reads source as text, like
// `hooks.test.ts`.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { importsOf, resolve, trackedFiles } from "../../scripts/rules";

const ROOT = join(import.meta.dir, "..", "..");
const files = new Set(trackedFiles(ROOT));

// `importsOf` can swallow a real import when prose in a string says "import", so every line-anchored import and
// export-from is read on its own too (as `peers.test.ts` does).
const LINE_RE =
  /^(?:import|export)\s+(?:type\s+)?[^;'"`]*?from\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gm;
const specsOf = (text: string) => [
  ...importsOf(text).map((ref) => ref.spec),
  ...[...text.matchAll(LINE_RE)].map((m) => m[1] ?? m[2] ?? ""),
];

/** Every repo file and package the entry reaches (type-only imports included), with the chain that got there. */
function reached(entry: string): Map<string, string[]> {
  const chain = new Map<string, string[]>([[entry, [entry]]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift() as string;
    if (!/\.(ts|tsx)$/.test(file)) continue;
    for (const spec of specsOf(readFileSync(join(ROOT, file), "utf8"))) {
      const target = resolve(file, spec, files);
      if (chain.has(target)) continue;
      chain.set(target, [...(chain.get(file) ?? []), target]);
      if (!target.startsWith("pkg:")) queue.push(target);
    }
  }
  return chain;
}

const offending = (found: Map<string, string[]>, bad: (f: string) => boolean) =>
  [...found].filter(([f]) => bad(f)).map(([, c]) => c.join(" > "));

describe("the headless entries", () => {
  test("the walk is not blind: from watchpot/devtools it arrives at a stylesheet", () => {
    const all = [...reached("src/devtools/index.ts").keys()];
    expect(all.some((f) => f.endsWith(".css"))).toBe(true);
  });

  test("watchpot/ui reaches neither the kit nor a stylesheet", () => {
    const found = reached("src/ui/index.ts");
    expect(found.has("src/ui/dialog.tsx")).toBe(true);
    expect(offending(found, (f) => f.startsWith("src/kit/") || f.endsWith(".css"))).toEqual([]);
  });

  test("watchpot/ui imports no package but react and react-dom (what `/core` needs is `/core`'s)", () => {
    const found = reached("src/ui/index.ts");
    const own = [...found.values()]
      .filter((c) => c.length > 1 && (c[c.length - 2] ?? "").startsWith("src/ui/"))
      .map((c) => c[c.length - 1] ?? "")
      .filter((t) => t.startsWith("pkg:"));
    expect(own.filter((p) => p !== "pkg:react" && p !== "pkg:react-dom")).toEqual([]);
  });

  test("watchpot/kit reaches no stylesheet: its effects take the game's class", () => {
    const found = reached("src/kit/index.ts");
    expect(found.has("src/kit/fx/Flash.tsx")).toBe(true);
    expect(offending(found, (f) => f.endsWith(".css"))).toEqual([]);
  });

  test("the kit writes no class name of its own: every className it sets is the caller's", () => {
    const literal = /className=\s*(["'`]|\{\s*["'`])/;
    const hits = [...files]
      .filter((f) => f.startsWith("src/kit/") && /\.tsx$/.test(f))
      .filter((f) => literal.test(readFileSync(join(ROOT, f), "utf8")));
    expect(hits).toEqual([]);
  });

  test("nothing in src/ ships CSS but the developer tools (dev panel, sound desk, sim desk), self-contained", () => {
    const css = [...files].filter((f) => f.startsWith("src/") && f.endsWith(".css"));
    expect(css.length).toBeGreaterThan(0);
    expect(css.filter((f) => !f.startsWith("src/devtools/") && !f.startsWith("src/desk/"))).toEqual([]);
    // Self-contained: a tool's stylesheet reads only the tools' own `--dp-*` properties, no game token.
    for (const f of css) {
      const vars = [...readFileSync(join(ROOT, f), "utf8").matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
      expect(vars.filter((v) => !v?.startsWith("--dp-"))).toEqual([]);
    }
  });

  test("watchpot/shader reaches nothing but React and its own folder", () => {
    const found = reached("src/shader/index.ts");
    expect(found.has("src/shader/glsl.ts")).toBe(true);
    expect(offending(found, (f) => f !== "pkg:react" && !f.startsWith("src/shader/"))).toEqual([]);
  });
});
