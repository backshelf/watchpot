// The developer tools wear the site's look in the light scheme: every colour and font token in the first block of
// `src/devtools/tokens.css` (as `--dp-<name>`) equals the site's `--<name>` in `site/src/styles/base.css`, so a change
// to the site's palette that is not carried to the tools fails here. The dark scheme is the tools' own neutral grey: only
// `--dp-live`, `--dp-live-deep` (the one mid-tone) are held to the site's dark values. `--dp-series-*` are tool-only.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** The custom properties declared in the first block `opener` begins, by name without the leading `--`. */
function block(css: string, opener: string): Map<string, string> {
  const at = css.indexOf(opener);
  if (at < 0) throw new Error(`no block ${opener}`);
  const body = css.slice(css.indexOf("{", at) + 1);
  const end = body.indexOf("}");
  return new Map(
    [...body.slice(0, end).matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? "", (m[2] ?? "").trim()]),
  );
}

const site = read("site/src/styles/base.css");
const tools = read("src/devtools/tokens.css");

const SERIES = /^dp-series-d+$/;
const SHARED_DARK = new Set(["dp-live", "dp-live-deep"]);

describe("the tools' tokens are the site's", () => {
  for (const [scheme, siteOpener, toolOpener] of [
    ["light", ":root {", "[data-dp-tool] {"],
    ["dark", ':root[data-scheme="dark"] {', "  [data-dp-tool] {"],
  ] as const) {
    test(scheme, () => {
      const want = block(site, siteOpener);
      const have = block(scheme === "dark" ? tools.slice(tools.indexOf("@media")) : tools, toolOpener);
      expect(have.size).toBeGreaterThan(5);
      let checked = 0;
      for (const [name, value] of have) {
        if (!name.startsWith("dp-")) throw new Error(`--${name} is not a --dp- property`);
        if (SERIES.test(name)) continue; // tool-only
        if (scheme === "dark" && !SHARED_DARK.has(name)) continue; // the tools' own grey
        const siteName = name.slice(3);
        if (!want.has(siteName)) continue; // a tool-only token
        checked++;
        expect(`--${name}: ${value.replaceAll("--dp-", "--")}`).toBe(`--${name}: ${want.get(siteName)}`);
      }
      expect(checked).toBeGreaterThan(scheme === "dark" ? 1 : 5);
    });
  }

  test("the fonts are the site's", () => {
    const want = block(site, ":root {");
    const have = block(tools, "[data-dp-tool] {");
    for (const name of ["font-sans", "font-mono"]) expect(have.get(`dp-${name}`)).toBe(want.get(name));
  });
});
