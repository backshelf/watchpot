// `watchpot/react` is hooks and runtime only: the walk from its entry must never arrive at a
// stylesheet, or a build with no CSS-module loader breaks on the import. Reads source as text.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { importsOf, resolve, trackedFiles } from "../../scripts/rules";

const ROOT = join(import.meta.dir, "..", "..");
const files = new Set(trackedFiles(ROOT));
const ENTRY = "src/react/index.ts";

// `importsOf` can swallow a real import when prose in a string says "import", so every line-anchored import and
// export-from is read on its own too (as `peers.test.ts` does).
const LINE_RE =
  /^(?:import|export)\s+(?:type\s+)?[^;'"`]*?from\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gm;
const specsOf = (text: string) => [
  ...importsOf(text).map((ref) => ref.spec),
  ...[...text.matchAll(LINE_RE)].map((m) => m[1] ?? m[2] ?? ""),
];

/** Every repo file the entry reaches, with the chain of imports that got there. */
function reached(entry: string): Map<string, string[]> {
  const chain = new Map<string, string[]>([[entry, [entry]]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift() as string;
    if (!/\.(ts|tsx)$/.test(file)) continue;
    for (const spec of specsOf(readFileSync(join(ROOT, file), "utf8"))) {
      const target = resolve(file, spec, files);
      if (target.startsWith("pkg:") || chain.has(target)) continue;
      chain.set(target, [...(chain.get(file) ?? []), target]);
      queue.push(target);
    }
  }
  return chain;
}

describe("watchpot/react", () => {
  const found = reached(ENTRY);

  test("the walk is not blind: the same walk from watchpot/devtools arrives at a stylesheet", () => {
    const all = [...reached("src/devtools/index.ts").keys()];
    expect(all.some((f) => f.endsWith(".css"))).toBe(true);
  });

  test("reaches no stylesheet, so a build with no CSS-module loader can import it", () => {
    expect(found.has("src/react/runtime.ts")).toBe(true);
    const hit = [...found].filter(([f]) => f.endsWith(".css")).map(([, c]) => c.join(" > "));
    expect(hit).toEqual([]);
  });
});
