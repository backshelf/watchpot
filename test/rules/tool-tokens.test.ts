// The developer tools wear the site's look: every colour and font token in `src/devtools/tokens.css` (as `--dp-<name>`)
// equals the site's `--<name>` in `site/src/styles/base.css`, light and dark, so a change to the site's palette that
// is not carried to the tools fails here.
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

describe("the tools' tokens are the site's", () => {
  for (const [scheme, siteOpener, toolOpener] of [
    ["light", ":root {", "[data-dp-tool] {"],
    ["dark", ':root[data-scheme="dark"] {', "  [data-dp-tool] {"],
  ] as const) {
    test(scheme, () => {
      const want = block(site, siteOpener);
      const have = block(scheme === "dark" ? tools.slice(tools.indexOf("@media")) : tools, toolOpener);
      expect(have.size).toBeGreaterThan(5);
      for (const [name, value] of have) {
        if (!name.startsWith("dp-")) throw new Error(`--${name} is not a --dp- property`);
        const siteName = name.slice(3);
        if (!want.has(siteName)) continue; // a tool-only token (none today)
        expect(`--${name}: ${value.replaceAll("--dp-", "--")}`).toBe(`--${name}: ${want.get(siteName)}`);
      }
    });
  }
});
