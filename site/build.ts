// Builds the site into `site/dist`: the landing page through Bun's bundler, the docs from the repository's markdown.
// Every URL in the output is relative, so the folder serves from any path (GitHub Pages serves it from /watchpot/).
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { SITE } from "./site.config";
import { buildDocs } from "./src/docs";

const here = import.meta.dir;
const repoRoot = join(here, "..");

/** The font files the stylesheet names, copied out of their packages (SIL OFL 1.1, the licences copied beside them). */
const FONTS = [
  ["@fontsource-variable/archivo", "archivo-latin-standard-normal.woff2"],
  ["@fontsource-variable/archivo", "archivo-latin-ext-standard-normal.woff2"],
  ["@fontsource-variable/archivo", "archivo-latin-standard-italic.woff2"],
  ["@fontsource-variable/chivo-mono", "chivo-mono-latin-wght-normal.woff2"],
  ["@fontsource-variable/chivo-mono", "chivo-mono-latin-ext-wght-normal.woff2"],
] as const;

const NOT_FOUND = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>No such page · watchpot</title>
    <style>
      :root { --paper: #f4f7fb; --ink: #1c2b6e; }
      @media (prefers-color-scheme: dark) { :root { --paper: #0d1c4a; --ink: #e2ecf7; } }
      body { margin: 0; min-height: 100dvh; display: grid; place-content: center; gap: 1rem; padding: 2rem;
        background: var(--paper); color: var(--ink); font: 1.0625rem/1.6 "Helvetica Neue", Arial, sans-serif; }
      h1 { margin: 0; font-size: 2rem; line-height: 1.1; }
      p { margin: 0; max-width: 34rem; }
      a { color: inherit; }
    </style>
  </head>
  <body>
    <h1>No such page.</h1>
    <p>Nothing is published at this address. <a id="home" href="/">The site starts here</a>, and
      <a id="docs" href="/docs/index.html">the docs are here</a>.</p>
    <script>
      // A project site is served under its first path segment (/watchpot/); a site of its own from the root.
      const first = location.pathname.split("/")[1] || "";
      const base = location.hostname.endsWith("github.io") && first ? "/" + first + "/" : "/";
      document.getElementById("home").href = base;
      document.getElementById("docs").href = base + "docs/index.html";
    </script>
  </body>
</html>
`;

export interface BuildResult {
  ok: boolean;
  ms: number;
  pages: number;
  warnings: string[];
}

/** The guide's first page (as its built address under docs/) once `docs/guide/` has an index; else nothing. */
async function guideEntry(): Promise<string> {
  for (const name of ["README.md", "index.md"]) {
    if (await Bun.file(join(repoRoot, "docs/guide", name)).exists()) return "guide/index.html";
  }
  // A guide of numbered chapters and no index opens at its first chapter.
  const chapters = [...new Bun.Glob("*.md").scanSync(join(repoRoot, "docs/guide"))].sort();
  return chapters[0] ? `guide/${chapters[0].replace(/\.md$/, ".html")}` : "";
}

export async function build({ dev = false, out = join(here, "dist") } = {}): Promise<BuildResult> {
  const started = performance.now();
  await rm(out, { recursive: true, force: true });

  const bundle = await Bun.build({
    entrypoints: [join(here, "pages/index.html"), join(here, "pages/docs.html")],
    outdir: out,
    minify: !dev,
    // A section may load its engine entry on a press (the sound core is 240 KB of wasm): keep that out of the page.
    splitting: true,
    sourcemap: dev ? "linked" : "none",
    external: ["*.woff2"],
    naming: {
      entry: "[name].[ext]",
      chunk: "assets/[name]-[hash].[ext]",
      asset: "assets/[name]-[hash].[ext]",
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production"),
      "process.env.SITE_GUIDE": JSON.stringify(await guideEntry()),
    },
  });
  if (!bundle.success) {
    for (const log of bundle.logs) console.error(log);
    return { ok: false, ms: performance.now() - started, pages: 0, warnings: [] };
  }

  const fonts = join(out, "assets/fonts");
  await mkdir(fonts, { recursive: true });
  for (const [pkg, file] of FONTS) {
    const from = dirname(Bun.resolveSync(`${pkg}/package.json`, here));
    await cp(join(from, "files", file), join(fonts, file));
    await cp(join(from, "LICENSE"), join(fonts, `${pkg.split("/")[1]}-LICENSE.txt`));
  }

  // The docs shell was bundled as a page of its own so its stylesheet and script are hashed like the rest; the
  // renderer stamps every docs page out of it and the shell itself is not published.
  const shellPath = join(out, "docs.html");
  const shell = await Bun.file(shellPath).text();
  await rm(shellPath);
  const docs = await buildDocs({
    repoRoot,
    outDir: join(out, "docs"),
    shell,
    repo: { url: SITE.repoUrl, branch: SITE.repoBranch, public: SITE.repoPublic },
  });

  // What Pages serves for a missing path. It can be asked for at any depth, so it carries its own few styles and
  // finds the site's root from the address (a project site lives under its first path segment).
  await Bun.write(join(out, "404.html"), NOT_FOUND);

  // GitHub Pages: serve the folder as it is (no Jekyll pass, which would drop paths that start with an underscore).
  await Bun.write(join(out, ".nojekyll"), "");

  return {
    ok: true,
    ms: performance.now() - started,
    pages: docs.pages + docs.examples + 1,
    warnings: docs.warnings,
  };
}

if (import.meta.main) {
  const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
  const result = await build({
    dev: process.argv.includes("--dev"),
    out: outArg ? resolve(outArg) : undefined,
  });
  for (const warning of result.warnings) console.warn(`docs: ${warning}`);
  if (!result.ok) process.exit(1);
  console.log(`site: ${result.pages} pages in ${Math.round(result.ms)} ms → site/dist`);
}
