// Each of the template's fixture shapes, written as the scaffold would (no install: inside this checkout, on its own
// source), must type-check, build in production and hold its pacing contract. The template ships no tests; the
// engine's gates are what prove it.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeShape } from "../../templates/game/.scaffold/shape";

const ROOT = join(import.meta.dir, "..", "..");
const SCRATCH = join(ROOT, ".scratch", "template-shapes");
const TSC = join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "tsc.exe" : "tsc");

/** Runs a command in `cwd`; its exit code and what it printed. */
function run(cmd: string[], cwd: string) {
  const p = Bun.spawnSync(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  return { code: p.exitCode, out: `${p.stdout.toString()}${p.stderr.toString()}` };
}

afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

describe.each(["everything", "dimensions", "dimensions-reset", "smallest", "smallest-clicker"])(
  "the %s shape",
  (name) => {
    const dir = join(SCRATCH, name);

    test(
      "type-checks, builds and holds its contract",
      async () => {
        await writeShape(join(ROOT, "templates", "game", ".scaffold", "fixtures", `${name}.json`), dir);
        const tsc = run([TSC, "-p", dir], ROOT);
        expect(tsc.out).toBe("");
        expect(tsc.code).toBe(0);
        const build = run(
          ["bun", "build", "./index.html", "--outdir", join(dir, "dist"), "--production"],
          dir,
        );
        expect(build.code).toBe(0);
        expect(existsSync(join(dir, "dist", "index.html"))).toBe(true);
        const sim = run(["bun", "sim/run.ts", "--contract"], dir);
        expect(sim.out).not.toContain("| OUT |");
        expect(sim.code).toBe(0);
      },
      { timeout: 120_000 },
    );
  },
);
