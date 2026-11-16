// Draws every guide page at build time, in a process of its own (so a rebuild always reads the pages fresh):
//   bun site/src/guide/prerender.tsx <job.json>
// The job names the repository and the built worker's address; the answer, every page's HTML and data, is written to
// the job's `out` file.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { createTokenizer } from "../docs/highlight";
import { htmlToText } from "../docs/text";
import { defaultsFor, editFor, exampleFiles, listing, modulesFor } from "./data";
import { parseGlossary } from "./glossary";
import { fresh, StaticHost } from "./kit/host";
import type { CodeData, Link, PageData, PageDef, StepData, TermData } from "./kit/page";
import { GuideRoot } from "./kit/shell";
import { outline, pageFiles } from "./pages";

export interface PrerenderJob {
  repoRoot: string;
  /** The worker script, as a URL from a guide page. */
  worker: string;
  out: string;
}

export interface PrerenderedPage {
  n: number;
  slug: string;
  title: string;
  /** The idea, as plain text: the page's description and its search text. */
  idea: string;
  headings: string[];
  html: string;
  json: string;
}

export interface PrerenderResult {
  pages: PrerenderedPage[];
  /** Mistakes in a page's declaration, each naming the page. */
  problems: string[];
}

/** Every page, drawn. A page that cannot be built is left out and named in `problems`. */
export async function prerender(job: Omit<PrerenderJob, "out">): Promise<PrerenderResult> {
  const files = exampleFiles(job.repoRoot);
  const tokenize = await createTokenizer(["ts", "tsx"]);
  const glossary: Record<string, TermData> = Object.fromEntries(
    parseGlossary(readFileSync(join(job.repoRoot, "docs/glossary.md"), "utf8")).map((e) => [
      e.id,
      { title: e.title, short: e.short, href: `../glossary.html#${e.id}` },
    ]),
  );
  const steps = outline();
  const written = pageFiles();
  const byN = new Map(written.map((f) => [f.n, f]));
  const pages: PrerenderedPage[] = [];
  const problems: string[] = [];

  for (const file of written) {
    try {
      const page = (await import(file.path)).default as PageDef;
      const step = steps.find((s) => s.n === file.n);
      if (!step) throw new Error(`step ${file.n} is not in OUTLINE.md`);
      if (step.title !== page.title) throw new Error(`its title is not OUTLINE.md's "${step.title}"`);
      const stepData: StepData[] = steps.map((s) => {
        const f = byN.get(s.n);
        return { n: s.n, title: s.title, href: f ? `${f.slug}.html` : null };
      });
      const prevFile = byN.get(file.n - 1);
      const nextFile = byN.get(file.n + 1);
      const prev: Link | null = prevFile
        ? { href: `${prevFile.slug}.html`, title: steps.find((s) => s.n === prevFile.n)?.title ?? "" }
        : (page.prev ?? null);
      const next: Link | null = nextFile
        ? { href: `${nextFile.slug}.html`, title: steps.find((s) => s.n === nextFile.n)?.title ?? "" }
        : (page.next ?? null);
      const params = page.params ?? {};
      const modules = modulesFor(files, page.game.file, params);
      const code: Record<string, CodeData> = Object.fromEntries(
        Object.entries(page.code ?? {}).map(([id, def]) => [
          id,
          listing(files, tokenize, def, page.game.file, params),
        ]),
      );
      const defaults = defaultsFor(files, page);
      const data: PageData = {
        n: file.n,
        slug: file.slug,
        steps: stepData,
        code,
        terms: {},
        modules,
        defaults,
        source: { file: page.game.file, href: `../examples/${page.game.file}.html` },
        edit: editFor(files, page, job.worker),
        prev,
        next,
      };
      const used = new Set<string>();
      const host = new StaticHost(fresh(modules, defaults, page.game));
      const html = renderToString(
        <GuideRoot page={page} data={data} host={host} glossary={glossary} used={used} />,
      );
      data.terms = Object.fromEntries(
        [...used].sort().flatMap((id) => (glossary[id] ? [[id, glossary[id]]] : [])),
      );
      const headings = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => htmlToText(m[1] ?? ""));
      pages.push({
        n: file.n,
        slug: file.slug,
        title: page.title,
        idea: htmlToText(renderToStaticMarkup(<span>{page.idea}</span>)),
        headings,
        html,
        // `<` escaped so the data can never close its script element.
        json: JSON.stringify(data).replace(/</g, "\\u003c"),
      });
    } catch (error) {
      problems.push(`${file.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { pages, problems };
}

if (import.meta.main) {
  const jobPath = process.argv[2];
  if (!jobPath) {
    console.error("usage: bun site/src/guide/prerender.tsx <job.json>");
    process.exit(1);
  }
  const job = JSON.parse(readFileSync(jobPath, "utf8")) as PrerenderJob;
  const result = await prerender(job);
  writeFileSync(job.out, JSON.stringify(result));
}
