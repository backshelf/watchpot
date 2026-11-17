// The npm build (`bun scripts/build.ts`): dist/ is what Node bundlers consume, so it is checked for real — the
// files and declarations of the runtime entries, the devtools' stylesheets, no `.ts` specifier left in any emitted
// JS, plain Node loading `watchpot/core`'s compiled entry, and the published manifest (`scripts/pack-manifest.ts`)
// pointing every runtime entry at what the build made.
import { beforeAll, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dir, "..", "..");
const DIST = join(ROOT, "dist");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

beforeAll(async () => {
  const p = Bun.spawn(["bun", "scripts/build.ts"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  if (code !== 0) throw new Error(`bun scripts/build.ts failed (exit ${code}):\n${out}${err}`);
});

test("dist ships compiled JS and declarations for the runtime entries", () => {
  for (const entry of ["core", "sound", "react"]) {
    for (const suffix of ["index.js", "index.d.ts"]) {
      expect(existsSync(join(DIST, entry, suffix)), `dist/${entry}/${suffix}`).toBe(true);
    }
  }
});

test("no dist JS imports or exports a .ts specifier", () => {
  const SPECIFIER = /(\bfrom|\bimport\s*\(|\bimport)(\s*)(["'])((?:[^"\\\n])*)\3/g;
  const offenders: string[] = [];
  for (const file of walk(DIST).filter((f) => f.endsWith(".js"))) {
    for (const match of readFileSync(file, "utf8").matchAll(SPECIFIER)) {
      const spec = match[4];
      if (spec !== undefined && /\.tsx?$/.test(spec)) offenders.push(`${file}: ${spec}`);
    }
  }
  expect(offenders).toEqual([]);
});

test("the devtools CSS modules ship beside their compiled modules", () => {
  expect(existsSync(join(DIST, "devtools", "DevPanel.module.css"))).toBe(true);
});

test("the store's declarations load the zustand middleware types a game's compiler needs", () => {
  // Without these, a game typechecking against dist/ sees every store as `never` (1.0.0-rc.2 on npm did).
  const head = readFileSync(join(ROOT, "dist/core/feature-types.d.ts"), "utf8")
    .split("\n")
    .slice(0, 4)
    .join("\n");
  expect(head).toContain('/// <reference types="zustand/middleware" preserve="true" />');
  expect(head).toContain('/// <reference types="zustand/middleware/immer" preserve="true" />');
});

test("plain Node imports dist/core/index.js and sees defineGame", async () => {
  const node = Bun.which("node");
  if (!node) {
    console.warn("dist: node is not on PATH; skipped the plain-Node import check");
    return;
  }
  // A file URL: on Windows, plain Node rejects an absolute path's `d:` scheme in import().
  const entry = pathToFileURL(join(DIST, "core", "index.js")).href;
  const p = Bun.spawn(
    [
      node,
      "--input-type=module",
      "-e",
      `import(${JSON.stringify(entry)}).then((m) => console.log(typeof m.defineGame))`,
    ],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
  );
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  if (code !== 0) throw new Error(`node could not import dist/core/index.js:\n${out}${err}`);
  expect(out.trim()).toBe("function");
});

test("the published manifest points every runtime entry at files the build made", async () => {
  const { publishedExports } = await import("../../scripts/pack-manifest");
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    exports: Record<string, string>;
  };
  for (const [entry, target] of Object.entries(publishedExports(pkg.exports))) {
    if (typeof target === "string") {
      // A build-time entry: still its TypeScript source.
      expect(target).toMatch(/^\.\/src\/.+\.ts$/);
      continue;
    }
    expect(Object.keys(target)).toEqual(["types", "default"]);
    for (const file of Object.values(target))
      expect(existsSync(join(ROOT, file)), `${entry}: ${file}`).toBe(true);
  }
});
