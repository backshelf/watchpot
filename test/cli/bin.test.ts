// The `watchpot` bin under Node: `bunx` honours its node shebang, so `bunx watchpot sim` starts in Node, and the bin
// must hand `sim` to Bun rather than refuse it.
import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = join(import.meta.dir, "..", "..", "bin", "watchpot.mjs");
const dir = mkdtempSync(join(tmpdir(), "watchpot-bin-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("started by Node, `sim` runs under Bun (it reaches the desk lookup, not the needs-Bun refusal)", () => {
  const run = spawnSync("node", [BIN, "sim", "--no-open"], { cwd: dir, encoding: "utf8" });
  expect(run.stderr).toContain("no desk file at");
  expect(run.stderr).not.toContain("sim needs Bun");
  expect(run.status).toBe(1);
});
