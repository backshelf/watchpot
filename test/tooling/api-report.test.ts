import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const REPORT = join(ROOT, "api");

async function check(dir: string) {
  const p = Bun.spawn(["bun", "scripts/api-report.ts", "check"], {
    cwd: ROOT,
    env: { ...process.env, WATCHPOT_API_DIR: dir },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  return { out, err, code };
}

test("api:check passes on the committed report and names a changed, added or removed file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "api-test-"));
  try {
    cpSync(REPORT, dir, { recursive: true });
    expect((await check(dir)).code).toBe(0);

    const target = join(dir, "core", "fmt.d.ts");
    writeFileSync(target, `${readFileSync(target, "utf8")}export declare const extra: number;\n`);
    writeFileSync(join(dir, "core", "stray.d.ts"), "export {};\n");
    rmSync(join(dir, "core", "rng.d.ts"));
    const r = await check(dir);
    expect(r.code).toBe(1);
    expect(r.err).toContain("changed core/fmt.d.ts");
    expect(r.err).toContain("removed core/stray.d.ts");
    expect(r.err).toContain("added   core/rng.d.ts");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // Two runs of the report generator: seconds on a busy machine, where the default five would fail a green gate.
}, 30_000);
