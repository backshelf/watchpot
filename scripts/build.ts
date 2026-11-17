// Build dist/: compiled JS and declarations, file by file with tsc — no bundler. A bundle per entry would duplicate
// the shared modules (the store-registry WeakMaps in src/core/persist.ts) between `watchpot/core` and
// `watchpot/react`, which breaks them. Bun reads src/ through the package.json `bun` export condition; dist/ is
// what npm ships, so the runtime entries also work on Node bundlers.
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");
const t0 = performance.now();

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

function kind(p: string): "file" | "dir" | undefined {
  try {
    return statSync(p).isDirectory() ? "dir" : "file";
  } catch {
    return undefined;
  }
}

// Import and export specifiers in emitted JS — static, side-effect and dynamic (`import("./x")`) — and
// `new URL(…, import.meta.url)` worker paths: the two places tsc emits a relative module path verbatim.
const SPECIFIER = /(\bfrom|\bimport\s*\(|\bimport)(\s*)(["'])((?:[^"\\\n])*)\3/g;
const NEW_URL = /(new\s+URL\(\s*)(["'])((?:[^"\\\n])*)\2(\s*,\s*import\.meta\.url\s*\))/g;

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST);

// A temp tsconfig extending the root one, like scripts/api-report.ts: emit everything under src/ except the two
// build-time, Bun-only entries (the sound pack and the theme builder).
const work = mkdtempSync(join(tmpdir(), "watchpot-build-"));
let code = -1;
let output = "";
try {
  const cfg = join(work, "tsconfig.json");
  writeFileSync(
    cfg,
    JSON.stringify({
      extends: join(ROOT, "tsconfig.json"),
      compilerOptions: {
        noEmit: false,
        declaration: true,
        rewriteRelativeImportExtensions: true,
        outDir: DIST,
        rootDir: SRC,
        sourceMap: false,
        types: ["bun"],
        typeRoots: [join(ROOT, "node_modules", "@types")],
      },
      // Glob patterns want forward slashes, even on Windows.
      include: [`${SRC.replaceAll("\\", "/")}/**/*`],
      exclude: [`${SRC.replaceAll("\\", "/")}/sound/pack/**`, `${SRC.replaceAll("\\", "/")}/kit/theme/**`],
    }),
  );
  const tsc = join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "tsc.exe" : "tsc");
  const p = Bun.spawn([tsc, "-p", cfg], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [out, err, exited] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  code = exited;
  output = out + err;
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (code !== 0 || kind(join(DIST, "core", "index.js")) !== "file") {
  console.error(`watchpot build: tsc failed (exit ${code})\n${output}`);
  process.exit(1);
}

// Stylesheets ship beside their compiled modules: the devtools' CSS-module imports stay as they are, and a bundler
// (Vite) resolves them. Copied before the specifier pass below, so those imports resolve in dist.
for (const css of walk(SRC)) {
  if (!css.endsWith(".css")) continue;
  const dest = join(DIST, relative(SRC, css));
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(css, dest);
}

// tsc emits the source's relative specifiers verbatim, and they are extensionless (`moduleResolution: bundler`),
// which plain Node cannot resolve. Rewrite each one to the file that dist actually ships: `./x` becomes `./x.js`,
// or `./x/index.js` when x is a folder; what already lands on a dist file (a copied .css, an explicit .js) stays.
// A `new URL` path ending in `.ts` loses the extension. A relative specifier that resolves to nothing fails the
// build: dist must not ship a path that dangles.
const failures: string[] = [];

function rewritten(file: string, spec: string, stripTs: boolean): string | null {
  if (!spec.startsWith(".")) return null;
  const where = relative(ROOT, file).replaceAll("\\", "/");
  const target = resolve(dirname(file), spec);
  if (kind(target) === "file") return null;
  const bare = stripTs ? target.replace(/\.tsx?$/, "") : target;
  if (kind(`${bare}.js`) === "file") return `${stripTs ? spec.replace(/\.tsx?$/, "") : spec}.js`;
  if (kind(target) === "dir" && kind(join(target, "index.js")) === "file") return `${spec}/index.js`;
  failures.push(
    `${where}: "${spec}" resolves to nothing in dist (no ${relative(ROOT, `${bare}.js`)}, no ${relative(
      ROOT,
      join(target, "index.js"),
    )})`,
  );
  return null;
}

for (const file of walk(DIST).filter((f) => f.endsWith(".js"))) {
  const text = readFileSync(file, "utf8");
  const out = text
    .replace(NEW_URL, (whole, head, quote, spec, tail) => {
      const next = rewritten(file, spec, true);
      return next === null ? whole : head + quote + next + quote + tail;
    })
    .replace(SPECIFIER, (whole, head, space, quote, spec) => {
      const next = rewritten(file, spec, false);
      return next === null ? whole : head + space + quote + next + quote;
    });
  if (out !== text) writeFileSync(file, out);
}

if (failures.length > 0) {
  console.error(
    `watchpot build: relative specifiers that do not resolve in dist:\n  ${failures.join("\n  ")}`,
  );
  process.exit(1);
}

// Nothing may still import or export a `.ts` specifier (rewriteRelativeImportExtensions' job).
const tsSpecifiers: string[] = [];
for (const file of walk(DIST).filter((f) => f.endsWith(".js"))) {
  for (const match of readFileSync(file, "utf8").matchAll(SPECIFIER)) {
    const spec = match[4];
    if (spec !== undefined && /\.tsx?$/.test(spec))
      tsSpecifiers.push(`${relative(ROOT, file).replaceAll("\\", "/")}: ${spec}`);
  }
}
if (tsSpecifiers.length > 0) {
  console.error(
    `watchpot build: dist JS still imports or exports .ts specifiers:\n  ${tsSpecifiers.join("\n  ")}`,
  );
  process.exit(1);
}

console.log(`watchpot dist built in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
