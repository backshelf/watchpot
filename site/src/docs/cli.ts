// Builds the docs into a folder with a stub shell, for checking the renderer alone.
// Usage: bun site/src/docs/cli.ts <outDir>

import { resolve } from "node:path";
import { SITE } from "../../site.config";
import { buildDocs } from "./index";

const outArg = process.argv[2];
if (!outArg) {
  console.error("usage: bun site/src/docs/cli.ts <outDir>");
  process.exit(1);
}

const STUB_SHELL = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%TITLE%</title>
<meta name="description" content="%DESCRIPTION%">
<link rel="stylesheet" href="./assets/site.css">
<base data-base="%BASE%">
</head>
<body>
<a href="%BASE%index.html">watchpot</a>
<div class="docs">%NAV%<main>%CONTENT%%PAGER%</main>%TOC%</div>
</body>
</html>
`;

const started = performance.now();
const result = await buildDocs({
  repoRoot: resolve(import.meta.dir, "../../.."),
  outDir: resolve(outArg),
  shell: STUB_SHELL,
  repo: { url: SITE.repoUrl, branch: SITE.repoBranch, public: SITE.repoPublic },
});
const ms = Math.round(performance.now() - started);
console.log(`${result.pages} pages, ${result.examples} source pages in ${ms} ms`);
for (const warning of result.warnings) console.warn(`warning: ${warning}`);
