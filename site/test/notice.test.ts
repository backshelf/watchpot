// The approved "how this was made" notice, everywhere it is said: the exported constant the site renders from,
// and the copies the site cannot import (README, the guide's chapter, the two HTML shells). A half-finished swap
// fails here.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { NOTICE_BODY, NOTICE_TITLE } from "../src/notice";

const ROOT = join(import.meta.dir, "..", "..");

/** A file's text with every run of whitespace flattened, so a wrapped line still matches the sentence. */
async function flat(path: string): Promise<string> {
  return (await Bun.file(join(ROOT, path)).text()).replace(/\s+/g, " ");
}

describe("the how-this-was-made notice", () => {
  test("the exported title and body are the approved wording", () => {
    expect(NOTICE_TITLE).toBe("How this was made.");
    expect(NOTICE_BODY).toBe(
      "This was written AI-assisted, under close direction from a developer who has spent years playing idle games.",
    );
  });

  test("README.md's how-this-was-made paragraph is the notice", async () => {
    expect(await flat("README.md")).toContain(`**How this was made.** ${NOTICE_BODY}`);
  });

  test("the guide's first chapter says the notice", async () => {
    expect(await flat("docs/guide/01-what-watchpot-is.md")).toContain(`## How this was made ${NOTICE_BODY}`);
  });

  test("the index page's noscript text says the notice", async () => {
    expect(await flat("site/pages/index.html")).toContain(NOTICE_BODY);
  });

  test("the docs shell's footer says the notice", async () => {
    expect(await flat("site/pages/docs.html")).toContain(NOTICE_BODY);
  });

  test("no section writes its own copy of the notice, nor names the vendor or the model", async () => {
    for (const section of ["site/src/sections/Hero.tsx", "site/src/sections/HowMade.tsx"]) {
      const text = await flat(section);
      expect(text).not.toContain(NOTICE_BODY);
      expect(text).not.toMatch(/anthropic|claude|AI model/i);
    }
  });
});
