// `D(3) < D(20)` compiles and is false: Decimals compare with `.lt()`, `.gte()`, `.eq()`, never an operator. This asks
// TypeScript's checker for every comparison's operand types and names each `file:line` that compares two Decimals.
import { expect, test } from "bun:test";
import { join } from "node:path";
import { decimalComparisons } from "watchpot/test";

test("no Decimal is compared with an operator", async () => {
  const tsconfig = join(import.meta.dir, "..", "tsconfig.json");
  expect(await decimalComparisons({ tsconfig, under: ["src", "sim"] })).toEqual([]);
});
