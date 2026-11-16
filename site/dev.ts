// The site's dev server: build, serve `site/dist`, rebuild when a source changes (refresh the page to see it).
// It serves the same files at `/` and at `/watchpot/`, the path GitHub Pages uses, so a root-relative URL that
// would break there breaks here too.
import { watch } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { build } from "./build";

const here = import.meta.dir;
const repoRoot = join(here, "..");
// `--out=<dir>` builds somewhere else (two dev servers at once need a folder each).
const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
const out = outArg ? resolve(outArg) : join(here, "dist");

let building = false;
let again = false;
async function rebuild() {
  if (building) {
    again = true;
    return;
  }
  building = true;
  try {
    const result = await build({ dev: true, out });
    for (const warning of result.warnings) console.warn(`docs: ${warning}`);
    console.log(result.ok ? `built ${result.pages} pages in ${Math.round(result.ms)} ms` : "build failed");
  } catch (error) {
    // A half-saved file must not take the server down: say why and wait for the next change.
    console.error("build failed:", error);
  }
  building = false;
  if (again) {
    again = false;
    void rebuild();
  }
}

await rebuild();

let timer: ReturnType<typeof setTimeout> | undefined;
const changed = (file: string | null) => {
  if (file && /(^|[\\/])(dist[^\\/]*|node_modules|\.impeccable)([\\/]|$)/.test(file)) return;
  clearTimeout(timer);
  timer = setTimeout(() => void rebuild(), 150);
};
for (const dir of ["site/src", "site/pages", "site/assets", "docs", "src"]) {
  watch(join(repoRoot, dir), { recursive: true }, (_event, file) => changed(file));
}
for (const file of ["README.md", "CHANGELOG.md", "site/site.config.ts"])
  watch(join(repoRoot, file), () => changed(file));

const server = Bun.serve({
  port: Number(process.env.PORT ?? 4173),
  async fetch(req) {
    let path = decodeURIComponent(new URL(req.url).pathname);
    if (path === "/watchpot") return Response.redirect("/watchpot/", 302);
    if (path.startsWith("/watchpot/")) path = path.slice("/watchpot".length);
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(out, path));
    if (!file.startsWith(out)) return new Response("no", { status: 403 });
    const body = Bun.file(file);
    if (await body.exists()) return new Response(body, { headers: { "cache-control": "no-store" } });
    return new Response("not found", { status: 404 });
  },
});

console.log(`site on ${server.url} (and ${server.url}watchpot/); refresh to see a change`);
