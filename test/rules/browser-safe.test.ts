import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// `/core` and `/sim` are bundled for the browser (the site's sim lab, a game's page): no Node built-in imports.
const ROOTS = ["src/core", "src/sim"];

test("core and sim import no node: modules", () => {
  const found: string[] = [];
  for (const root of ROOTS)
    for (const file of readdirSync(root, { recursive: true, encoding: "utf8" })) {
      if (!/\.tsx?$/.test(file)) continue;
      const text = readFileSync(join(root, file), "utf8");
      if (/from\s+["']node:/.test(text)) found.push(join(root, file));
    }
  expect(found).toEqual([]);
});
