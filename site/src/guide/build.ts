// Builds one section of the guide's pages into `<out>/docs/<section>/`: one script per page (its page and the kit,
// hydrating the HTML the build drew), the code box's worker, and each page's HTML in the docs' own shell.
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { SearchEntry } from "../docs";
import type { NavLink } from "../docs/nav";
import { escapeHtml } from "../docs/text";
import { GUIDE_DIR, type GuideSection, outline, pageFiles } from "./pages";
import type { PrerenderJob, PrerenderResult } from "./prerender";

export interface GuideBuild {
  ok: boolean;
  /** The pages in order, as the docs' contents list them. */
  links: NavLink[];
  search: SearchEntry[];
  /** Writes each page into the docs output with the docs' shell; `nav` draws the contents for a page. */
  write: (fill: (out: string, slots: Record<string, string>) => string, nav: (out: string) => string) => void;
  warnings: string[];
  /** Each page's script and what it loads up front, in bytes (minified when not dev), keyed by address. */
  weights: Record<string, number>;
}

/** The section's pages in order with their addresses under the docs output (`start/01-….html`), from the outline. */
export function guideLinks(section: GuideSection): NavLink[] {
  const steps = outline(section);
  return pageFiles(section).map((f) => ({
    out: `${section.slug}/${f.slug}.html`,
    title: steps.find((s) => s.n === f.n)?.title ?? f.slug,
  }));
}

/** The JavaScript a built entry loads before it runs: itself and the chunks it imports, followed through. */
function weightOf(file: string, root: string, seen = new Set<string>()): number {
  if (seen.has(file)) return 0;
  seen.add(file);
  const text = readFileSync(file, "utf8");
  let total = statSync(file).size;
  for (const m of text.matchAll(/(?:^|[;\n}])\s*import\s*(?:[^"'()]*?from\s*)?["']([^"']+\.js)["']/g)) {
    const spec = m[1] ?? "";
    const next = spec.startsWith(".") ? join(file, "..", spec) : join(root, spec);
    try {
      total += weightOf(next, root, seen);
    } catch {
      // A chunk the bundler names some other way: left out of the sum.
    }
  }
  return total;
}

export async function buildGuide({
  repoRoot,
  out,
  dev,
  section,
}: {
  repoRoot: string;
  out: string;
  dev: boolean;
  section: GuideSection;
}): Promise<GuideBuild> {
  const files = pageFiles(section);
  const links = guideLinks(section);
  const warnings: string[] = [];
  const none: GuideBuild = { ok: true, links: [], search: [], write: () => {}, warnings, weights: {} };
  if (files.length === 0) return none;

  // Each page's script: three lines that hydrate it, written outside the source tree so no watcher sees them, in
  // this section's own folder (a dev build and a release build never share one, and neither do two sections).
  const entries = join(tmpdir(), "watchpot-site-guide", basename(out), section.slug);
  rmSync(entries, { recursive: true, force: true });
  mkdirSync(entries, { recursive: true });
  const client = join(GUIDE_DIR, "kit/client.tsx").replaceAll("\\", "/");
  const entryPaths = files.map((f) => {
    const path = join(entries, `${f.slug}.tsx`);
    writeFileSync(
      path,
      `import page from ${JSON.stringify(f.path.replaceAll("\\", "/"))};\nimport { hydrateGuide } from ${JSON.stringify(client)};\nhydrateGuide(page);\n`,
    );
    return path;
  });
  const worker = join(GUIDE_DIR, "kit/worker.ts");
  const bundle = await Bun.build({
    entrypoints: [...entryPaths, worker],
    outdir: out,
    target: "browser",
    minify: !dev,
    splitting: true,
    sourcemap: dev ? "linked" : "none",
    naming: {
      entry: "assets/guide/[name]-[hash].[ext]",
      // A shared chunk is named after whichever entry Bun met first: a page's name on it would mislead.
      chunk: "assets/guide/shared-[hash].[ext]",
      asset: "assets/guide/[name]-[hash].[ext]",
    },
    define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
  });
  if (!bundle.success) {
    for (const log of bundle.logs) console.error(log);
    return { ...none, ok: false };
  }
  const entryOut = (name: string) =>
    bundle.outputs.find(
      (o) => o.kind === "entry-point" && basename(o.path).startsWith(`${name}-`) && o.path.endsWith(".js"),
    )?.path;
  const workerOut = entryOut("worker");
  if (!workerOut) throw new Error(`the ${section.label} guide's worker was not built`);
  const fromPage = (path: string) => `../../${path.slice(out.length + 1).replaceAll("\\", "/")}`;

  // Draw the pages in a process of their own: a dev rebuild must read every page and example afresh.
  const jobPath = join(entries, "job.json");
  const resultPath = join(entries, "result.json");
  const job: PrerenderJob = { repoRoot, section: section.slug, worker: fromPage(workerOut), out: resultPath };
  writeFileSync(jobPath, JSON.stringify(job));
  const proc = Bun.spawn([process.execPath, join(GUIDE_DIR, "prerender.tsx"), jobPath], {
    cwd: repoRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await proc.exited) !== 0) return { ...none, ok: false };
  const result = JSON.parse(readFileSync(resultPath, "utf8")) as PrerenderResult;
  for (const problem of result.problems) warnings.push(`guide: ${problem}`);

  const weights: Record<string, number> = {};
  for (const page of result.pages) {
    const script = entryOut(page.slug);
    if (script) weights[`${section.slug}/${page.slug}`] = weightOf(script, out);
  }
  weights[`${section.slug}/worker`] = weightOf(workerOut, out);

  const search: SearchEntry[] = result.pages.map((p) => ({
    url: `${section.slug}/${p.slug}.html`,
    title: p.title,
    group: section.label,
    headings: p.headings,
    text: p.idea,
  }));

  const write: GuideBuild["write"] = (fill, nav) => {
    for (const page of result.pages) {
      const script = entryOut(page.slug);
      const pageOut = `${section.slug}/${page.slug}.html`;
      const content = [
        `<div id="guide-root">${page.html}</div>`,
        `<script type="application/json" id="guide-data">${page.json}</script>`,
        script ? `<script type="module" src="${escapeHtml(fromPage(script))}"></script>` : "",
      ].join("\n");
      const html = fill(pageOut, {
        TITLE: escapeHtml(`${page.title} · ${section.label} · watchpot docs`),
        DESCRIPTION: escapeHtml(page.idea),
        NAV: nav(pageOut),
        CONTENT: content,
        PAGER: "",
        TOC: "",
      }).replace('class="docs__body"', 'class="docs__body docs__body--guide"');
      mkdirSync(join(out, "docs", section.slug), { recursive: true });
      writeFileSync(join(out, "docs", pageOut), html);
    }
  };

  return {
    ok: true,
    links: links.filter((l) => result.pages.some((p) => l.out.endsWith(`/${p.slug}.html`))),
    search,
    write,
    warnings,
    weights,
  };
}
