import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decimalComparisons } from "../../src/test/decimal-comparisons";

const FIXTURE = join(import.meta.dir, "fixtures", "decimal-comparisons");

test("flags Decimal-vs-Decimal for every operator and nothing else", async () => {
  const lines = readFileSync(join(FIXTURE, "cases.ts"), "utf8").split(/\r?\n/);
  const expected = lines.flatMap((line, i) => (line.endsWith("// flag") ? [i + 1] : []));
  const hits = await decimalComparisons({ tsconfig: join(FIXTURE, "tsconfig.json") });

  expect(hits.map((hit) => hit.line)).toEqual(expected);
  expect(new Set(hits.map((hit) => hit.operator))).toEqual(
    new Set(["<", "<=", ">", ">=", "==", "!=", "===", "!=="]),
  );
  for (const hit of hits) {
    expect(hit.file).toBe("cases.ts");
    expect(lines[hit.line - 1]?.slice(hit.column - 1).startsWith(hit.operator)).toBe(true);
    expect(lines[hit.line - 1]).toContain(hit.text);
  }
});
