// The root README quotes `docs/examples/readme-smallest.ts`; `bun check` type-checks the file, this keeps the quote true.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");

test("the README's smallest game is the example file", () => {
  expect(read("README.md")).toContain(read("docs/examples/readme-smallest.ts"));
});
