// Which peers each non-kit entry can reach. A peer is optional in `package.json` only if no walk from an entry that
// a game without the kit's UI imports ever arrives at it. Reads source as text, like the import rules.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { importsOf, resolve, trackedFiles } from "../../scripts/rules";
import * as kit from "../../src/kit";
import * as sound from "../../src/sound";

const ROOT = join(import.meta.dir, "..", "..");
const files = new Set(trackedFiles(ROOT));
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  peerDependenciesMeta: Record<string, { optional?: boolean }>;
};
/** The UI peers proved unreachable from the entries below; a peer joins this list only with the proof. */
const UI_PEERS = ["@number-flow/react", "canvas-confetti"];
/** Peers the engine dropped with its styled kit: no entry may reach them, and package.json no longer lists them. */
const DROPPED = ["@paper-design/shaders-react", "motion"];
/** The 3D peers: only `watchpot/three` reaches them. */
const THREE_PEERS = ["three", "@react-three/fiber"];
const OPTIONAL = [...UI_PEERS, ...THREE_PEERS];
const THREE_ENTRY = "src/three/index.ts";

const ENTRIES = [
  "src/core/index.ts",
  "src/sim/index.ts",
  "src/test/index.ts",
  "src/react/index.ts",
  "src/hooks/index.ts",
  "src/sound/index.ts",
  "src/ui/index.ts",
  "src/shader/index.ts",
];

// `importsOf` can swallow a real import when prose in a string says "import", so the walk also reads every
// line-anchored import and export-from on its own: a reachability proof must not miss an edge.
const LINE_RE =
  /^(?:import|export)\s+(?:type\s+)?[^;'"`]*?from\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gm;
const specsOf = (text: string) => [
  ...importsOf(text).map((ref) => ref.spec),
  ...[...text.matchAll(LINE_RE)].map((m) => m[1] ?? m[2] ?? ""),
];

/** Every package the entry reaches through static and dynamic imports (type-only ones included), by repo path. */
function reaches(entry: string): Map<string, string[]> {
  const chain = new Map<string, string[]>([[entry, [entry]]]);
  const queue = [entry];
  const found = new Map<string, string[]>();
  while (queue.length) {
    const file = queue.shift() as string;
    if (!/\.(ts|tsx)$/.test(file)) continue;
    for (const spec of specsOf(readFileSync(join(ROOT, file), "utf8"))) {
      const target = resolve(file, spec, files);
      const path = [...(chain.get(file) ?? []), target];
      if (target.startsWith("pkg:")) {
        const name = target.slice(4);
        if (!found.has(name)) found.set(name, path);
      } else if (files.has(target) && !chain.has(target)) {
        chain.set(target, path);
        queue.push(target);
      }
    }
  }
  return found;
}

describe("the optional peers", () => {
  test("the walk sees a package a game's UI reaches", () => {
    expect(reaches("src/react/index.ts").has("react")).toBe(true);
  });

  test("the walk finds every UI peer from the kit, so a miss elsewhere is a proof and not a blind spot", () => {
    const found = reaches("src/kit/index.ts");
    expect(UI_PEERS.filter((name) => !found.has(name))).toEqual([]);
  });

  test("no entry reaches a dropped peer, and package.json lists none", () => {
    for (const entry of [...ENTRIES, "src/kit/index.ts", THREE_ENTRY]) {
      const found = reaches(entry);
      expect(DROPPED.filter((name) => found.has(name))).toEqual([]);
    }
    for (const name of DROPPED) expect(pkg.peerDependenciesMeta[name]).toBeUndefined();
  });

  test("every proved peer is marked optional in package.json", () => {
    for (const name of OPTIONAL) expect(pkg.peerDependenciesMeta[name]?.optional).toBe(true);
  });

  test("the walk starts from tracked entries", () => {
    for (const entry of [...ENTRIES, THREE_ENTRY]) expect(files.has(entry)).toBe(true);
  });

  test("watchpot/three reaches the 3D peers, so a miss elsewhere is a proof", () => {
    const found = reaches(THREE_ENTRY);
    expect(THREE_PEERS.filter((name) => !found.has(name))).toEqual([]);
  });

  test("watchpot/three reaches no UI peer", () => {
    const found = reaches(THREE_ENTRY);
    expect(UI_PEERS.filter((name) => found.has(name))).toEqual([]);
  });

  test.each(ENTRIES)("%s reaches no optional peer", (entry) => {
    const found = reaches(entry);
    const hit = OPTIONAL.filter((name) => found.has(name)).map(
      (name) => `${name} via ${found.get(name)?.join(" > ")}`,
    );
    expect(hit).toEqual([]);
  });

  test("the sound comes from watchpot/sound alone: the kit exports none of it", () => {
    expect(typeof sound.createSound).toBe("function");
    for (const name of ["createSound", "soundSeconds", "toParams", "mixLayers"])
      expect(name in kit).toBe(false);
  });
});
