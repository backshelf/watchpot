// `docs/imports.md` is generated from the rules in `scripts/rules.ts`: this fails when the page is stale.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IMPORT_RULES, IMPORTS_DOC_PATH, importsDoc } from "../../scripts/rules";

test("docs/imports.md is current: run `bun scripts/rules.ts --doc`", () => {
  const page = readFileSync(join(import.meta.dir, "..", "..", IMPORTS_DOC_PATH), "utf8").replace(
    /\r\n/g,
    "\n",
  );
  expect(page).toBe(importsDoc());
});

test("every rule says what it enforces, in one sentence", () => {
  for (const r of IMPORT_RULES) expect(r.says.trim().length, r.id).toBeGreaterThan(20);
});
