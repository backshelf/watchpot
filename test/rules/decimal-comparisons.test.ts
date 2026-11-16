// No Decimal is compared with an operator anywhere a game reads or copies from: `D(3) < D(20)` compiles and is false.
// Type-aware (TypeScript 7's checker), so only comparisons whose operands are both Decimals fail it.
import { expect, test } from "bun:test";
import { join } from "node:path";
import { decimalComparisons } from "../../src/test/decimal-comparisons";

test("no Decimal is compared with an operator", async () => {
  const hits = await decimalComparisons({
    tsconfig: join(import.meta.dir, "..", "..", "tsconfig.json"),
    under: ["src", "examples", "templates", "docs/examples"],
  });
  expect(hits).toEqual([]);
});
