// The published package.json. In the repository, `exports` point at the TypeScript source, so the workspace (the
// example, the site), the tests and a git install all run with no build. A packed or published tarball points each
// runtime entry at `dist/` instead, so the entries also work on Node bundlers. `prepack` writes that manifest
// (keeping the source one beside it) and `postpack` puts the source one back; `bun pm pack` and `bun publish` run
// both, and read the manifest `prepack` leaves behind.
//
// Why not an export condition such as `bun` → source: Bun's dev server bundles a page with the browser's
// conditions, never `--conditions`, so a Bun game's page would resolve to a `dist/` the repository never builds.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const MANIFEST = join(ROOT, "package.json");
const KEPT = join(ROOT, "package.json.source");

/** Entries that run only on Bun at build time: they ship as source and keep their export. */
const SOURCE_ONLY = new Set(["./sound/pack", "./kit/theme"]);

type Exports = Record<string, string | Record<string, string>>;

/** The published `exports`: each runtime entry's `./src/<e>/index.ts` becomes its `dist/` declarations and JS. */
export function publishedExports(exports: Exports): Exports {
  const out: Exports = {};
  for (const [entry, target] of Object.entries(exports)) {
    if (SOURCE_ONLY.has(entry) || typeof target !== "string") {
      out[entry] = target;
      continue;
    }
    const match = /^\.\/src\/(.+)\.tsx?$/.exec(target);
    if (!match) throw new Error(`pack-manifest: export "${entry}" is "${target}", not a ./src/*.ts path`);
    out[entry] = { types: `./dist/${match[1]}.d.ts`, default: `./dist/${match[1]}.js` };
  }
  return out;
}

if (import.meta.main) {
  const mode = process.argv[2];
  if (mode === "write") {
    if (existsSync(KEPT)) throw new Error("pack-manifest: package.json.source exists; run `restore` first");
    const raw = readFileSync(MANIFEST, "utf8");
    const pkg = JSON.parse(raw) as { exports: Exports };
    writeFileSync(KEPT, raw);
    writeFileSync(
      MANIFEST,
      `${JSON.stringify({ ...pkg, exports: publishedExports(pkg.exports) }, null, 2)}\n`,
    );
    console.log("pack-manifest: exports point at dist/ for packing");
  } else if (mode === "restore") {
    if (existsSync(KEPT)) renameSync(KEPT, MANIFEST);
    console.log("pack-manifest: source package.json restored");
  } else {
    console.error("usage: bun scripts/pack-manifest.ts write|restore");
    process.exit(1);
  }
}
