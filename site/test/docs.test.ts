import { describe, expect, test } from "bun:test";
import { docsPageOut, type Exists, type LinkContext, resolveLink } from "../src/docs/links";
import { indexBlocks, parseMarkdown, renderBody } from "../src/docs/markdown";
import { buildNavGroups, type IndexBlock, type NavPage, pluralLabel } from "../src/docs/nav";
import { basePrefix, fillShell } from "../src/docs/shell";
import { createSlugger } from "../src/docs/text";

const FILES: Record<string, "file" | "dir"> = {
  api: "dir",
  "api/core.api.md": "file",
  "templates/game/src/main.ts": "file",
  "templates/game": "dir",
  "codemods/README.md": "file",
  "src/core/store.ts": "file",
};
const exists: Exists = (path) => FILES[path] ?? null;

function context(isPublic: boolean): LinkContext {
  return {
    exists,
    repo: { url: "https://github.com/owner/repo", branch: "main", public: isPublic },
    map: {
      pages: new Map([
        ["docs/README.md", "index.html"],
        ["docs/gacha.md", "gacha.html"],
        ["docs/start-a-game.md", "start-a-game.html"],
        ["docs/guide/README.md", "guide/index.html"],
        ["docs/guide/01-setup.md", "guide/01-setup.html"],
        ["docs/guide/02-loop.md", "guide/02-loop.html"],
        ["README.md", "reference.html"],
        ["CHANGELOG.md", "changelog.html"],
      ]),
      sources: new Map([["docs/examples/gacha.ts", "examples/gacha.ts.html"]]),
    },
  };
}

const fromDocs = { repoPath: "docs/gacha.md", outPath: "gacha.html" };
const fromGuide = { repoPath: "docs/guide/01-setup.md", outPath: "guide/01-setup.html" };
const fromReadme = { repoPath: "README.md", outPath: "reference.html" };

describe("output paths", () => {
  test("an index becomes index.html in its folder, any other page keeps its name", () => {
    expect(docsPageOut("README.md")).toBe("index.html");
    expect(docsPageOut("guide/index.md")).toBe("guide/index.html");
    expect(docsPageOut("guide/01-foo.md")).toBe("guide/01-foo.html");
    expect(docsPageOut("x.md")).toBe("x.html");
  });

  test("%BASE% climbs from the page to the site root, the docs output's parent", () => {
    expect(basePrefix("x.html")).toBe("../");
    expect(basePrefix("guide/x.html")).toBe("../../");
  });
});

describe("links", () => {
  const ctx = context(false);
  const href = (h: string, from = fromDocs, c = ctx) => {
    const r = resolveLink(h, from, c);
    return r.kind === "link" ? r.href : r.kind;
  };

  test("a sibling page, keeping its anchor", () => {
    expect(href("start-a-game.md")).toBe("start-a-game.html");
    expect(href("start-a-game.md#install")).toBe("start-a-game.html#install");
  });

  test("the root README and CHANGELOG land inside the docs output", () => {
    expect(href("../README.md#core")).toBe("reference.html#core");
    expect(href("../CHANGELOG.md")).toBe("changelog.html");
    expect(href("../../README.md", fromGuide)).toBe("../reference.html");
  });

  test("from the root README into docs/, including a folder and its index", () => {
    expect(href("docs/gacha.md", fromReadme)).toBe("gacha.html");
    expect(href("docs/README.md", fromReadme)).toBe("index.html");
    expect(href("docs/guide/02-loop.md#turns", fromReadme)).toBe("guide/02-loop.html#turns");
    expect(href("docs/guide/", fromReadme)).toBe("guide/index.html");
  });

  test("from a nested folder: siblings, the parent and the parent's examples", () => {
    expect(href("02-loop.md", fromGuide)).toBe("02-loop.html");
    expect(href("../gacha.md", fromGuide)).toBe("../gacha.html");
    expect(href("README.md", fromGuide)).toBe("index.html");
    expect(href("../examples/gacha.ts", fromGuide)).toBe("../examples/gacha.ts.html");
    expect(href("guide/02-loop.md")).toBe("guide/02-loop.html");
  });

  test("an example file goes to its source page", () => {
    expect(href("examples/gacha.ts")).toBe("examples/gacha.ts.html");
  });

  test("an anchor to the same page stays an in-page anchor", () => {
    expect(href("#pity")).toBe("#pity");
    expect(href("gacha.md#pity")).toBe("#pity");
  });

  test("http links are kept and marked external", () => {
    const r = resolveLink("https://example.com/x", fromDocs, ctx);
    expect(r).toEqual({ kind: "link", href: "https://example.com/x", external: true });
  });

  test("other repository paths are plain text while the repository is private", () => {
    expect(href("../api")).toBe("path");
    expect(href("../templates/game/src/main.ts")).toBe("path");
    expect(href("codemods/README.md", fromReadme)).toBe("path");
  });

  test("other repository paths link to GitHub when public: blob for a file, tree for a folder", () => {
    const pub = context(true);
    expect(href("../api", fromDocs, pub)).toBe("https://github.com/owner/repo/tree/main/api");
    expect(href("../templates/game/src/main.ts", fromDocs, pub)).toBe(
      "https://github.com/owner/repo/blob/main/templates/game/src/main.ts",
    );
    expect(href("src/core/store.ts#L3", fromReadme, pub)).toBe(
      "https://github.com/owner/repo/blob/main/src/core/store.ts#L3",
    );
  });

  test("a relative link to nothing is reported missing, also when it climbs out of the repository", () => {
    expect(href("nope.md")).toBe("missing");
    expect(href("../../outside.md")).toBe("missing");
    expect(href("nope.md", fromDocs, context(true))).toBe("missing");
  });
});

describe("rendering", () => {
  const ctx = context(false);
  const render = (md: string, from = fromDocs) =>
    renderBody(parseMarkdown(md).html, {
      link: (h) => resolveLink(h, from, ctx),
      highlight: (code) => `HL(${code})`,
    });

  test("duplicate headings get -1, -2 like GitHub", () => {
    const slug = createSlugger();
    expect(["Setup", "Setup", "Setup", "Setup-1"].map(slug)).toEqual([
      "setup",
      "setup-1",
      "setup-2",
      "setup-1-1",
    ]);
    const page = parseMarkdown("# T\n\n## Notes\n\n### Notes\n\n## What's new?\n");
    expect(page.headings.map((h) => h.id)).toEqual(["notes", "notes-1", "whats-new"]);
    expect(page.title).toBe("T");
  });

  test("the first h1 is the title and leaves the body; h2 and h3 get anchors", () => {
    const page = parseMarkdown("# Title\n\nHi.\n\n## A b\n\n#### Deep\n");
    expect(page.html).not.toContain("<h1");
    expect(page.html).toContain('<h2 id="a-b">A b <a class="anchor" href="#a-b"');
    expect(page.html).toContain('<h4 id="deep">Deep</h4>');
  });

  test("links are rewritten by class; inline code that names a path is left alone", () => {
    const html = render(
      "[s](start-a-game.md) [api](../api) [w](https://x.dev) `examples/vocab.ts` [e](examples/gacha.ts)",
    );
    expect(html).toContain('<a href="start-a-game.html">s</a>');
    expect(html).toContain('<span class="repo-path" title="A path in the repository">api</span>');
    expect(html).toContain('<a href="https://x.dev" rel="noopener">w</a>');
    expect(html).toContain("<code>examples/vocab.ts</code>");
    expect(html).toContain('<a href="examples/gacha.ts.html">e</a>');
  });

  test("code blocks become figures with the raw code handed to the highlighter; tables are wrapped", () => {
    const html = render("```ts\nconst a = 1 < 2;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n");
    expect(html).toContain('<figure class="code" data-lang="ts">');
    expect(html).toContain("<code>HL(const a = 1 < 2;\n)</code>");
    expect(html).toContain('<div class="table-wrap" role="region" aria-label="Table" tabindex="0"><table>');
    expect(html).toContain("</table></div>");
  });

  test("the shell's placeholders are filled everywhere and its assets re-based", () => {
    const shell = '<link href="./assets/a.css">%TITLE%|%TITLE%|%BASE%|%CONTENT%';
    const out = fillShell(shell, "guide/x.html", { TITLE: "T", CONTENT: "%TITLE%" });
    expect(out).toBe('<link href="../../assets/a.css">T|T|../../|%TITLE%');
  });
});

describe("sidebar", () => {
  const page = (path: string, title: string, links: string[] = []): NavPage => ({ path, title, links });

  test("a table's single singular first header becomes a plural label", () => {
    expect(pluralLabel("Recipe")).toBe("Recipes");
    expect(pluralLabel("System")).toBe("Systems");
    expect(pluralLabel("Category")).toBe("Categories");
    expect(pluralLabel("Two words")).toBe("Two words");
  });

  test("index blocks: tables, lists and paragraph runs, with headings in between", () => {
    const md = [
      "# Docs",
      "",
      "Intro with [a](a.md).",
      "",
      "And [b](b.md).",
      "",
      "| Recipe | Page |",
      "| - | - |",
      "| C | [c](c.md) |",
      "",
      "## Tools",
      "",
      "- [d](d.md)",
      "- [x](https://x.dev)",
    ].join("\n");
    const blocks = indexBlocks(parseMarkdown(md).html, (h) => (h.endsWith(".md") ? h : null));
    expect(blocks).toEqual([
      { kind: "links", shape: "paragraphs", links: ["a.md", "b.md"] },
      { kind: "links", shape: "table", firstHeader: "Recipe", links: ["c.md"] },
      { kind: "heading", level: 2, text: "Tools" },
      { kind: "links", shape: "list", links: ["d.md"] },
    ]);
  });

  test("folders first, then the index's blocks in order, then the unlinked pages under More", () => {
    const pages = [
      page("README.md", "Overview"),
      page("zeta.md", "Zeta"),
      page("alpha.md", "Alpha"),
      page("beta.md", "Beta"),
      page("gamma.md", "Gamma"),
      page("orphan-b.md", "B orphan"),
      page("orphan-a.md", "A orphan"),
      page("guide/README.md", "The guide", ["guide/02-two.md", "guide/01-one.md"]),
      page("guide/01-one.md", "One"),
      page("guide/02-two.md", "Two"),
      page("guide/10-ten.md", "Ten"),
      page("guide/03-three.md", "Three"),
      page("advanced-topics/2-b.md", "B"),
      page("advanced-topics/10-a.md", "A"),
      page("examples/notes.md", "Notes"),
    ];
    const index: IndexBlock[] = [
      { kind: "heading", level: 1, text: "Docs" },
      { kind: "links", shape: "table", firstHeader: "Recipe", links: ["zeta.md", "alpha.md"] },
      { kind: "heading", level: 2, text: "Deeper" },
      { kind: "links", shape: "list", links: ["beta.md", "zeta.md"] },
      { kind: "links", shape: "paragraphs", links: ["gamma.md"] },
    ];
    expect(buildNavGroups(pages, index)).toEqual([
      { label: "Advanced topics", pages: ["advanced-topics/2-b.md", "advanced-topics/10-a.md"] },
      {
        label: "The guide",
        pages: [
          "guide/README.md",
          "guide/02-two.md",
          "guide/01-one.md",
          "guide/03-three.md",
          "guide/10-ten.md",
        ],
      },
      { label: "Recipes", pages: ["zeta.md", "alpha.md"] },
      { label: "Deeper", pages: ["beta.md"] },
      { label: "More", pages: ["gamma.md", "orphan-a.md", "orphan-b.md", "examples/notes.md"] },
    ]);
  });
});
