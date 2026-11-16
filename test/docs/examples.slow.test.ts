import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guide's runnable examples and the Simmer core still run. Each is a separate `bun` process, run headless, and
 * fails here on a throw or a non-zero exit. The output is not checked: the chapters quote it, and a number that moves
 * with tuning is not a failure.
 */
const ROOT = join(import.meta.dir, "..", "..");
const EXAMPLES = join(ROOT, "docs", "examples");

/** A guide example is runnable when it has an `import.meta.main` block. */
const guide = readdirSync(EXAMPLES)
  .filter((f) => /^guide-.*\.tsx?$/.test(f))
  .filter((f) => readFileSync(join(EXAMPLES, f), "utf8").includes("import.meta.main"))
  .sort();

/** The Simmer core: every module of the tutorial game that holds no React. */
const simmer = readdirSync(join(EXAMPLES, "simmer"))
  .filter((f) => /\.ts$/.test(f))
  .sort();

/** Builds a store over a module's `game`, catches up and plays a minute, the way a page's first second does. */
const SIMMER_SCRIPT = (file: string) => `
import { createIdleStore } from "watchpot/core";
const mod = await import(${JSON.stringify(join(EXAMPLES, "simmer", file).replaceAll("\\", "/"))});
if (mod.game) {
  let wall = Date.UTC(2026, 0, 1);
  const store = createIdleStore(mod.game, { now: () => wall });
  store.getState().catchUp(wall);
  wall += 60_000;
  store.getState().tick(60_000, wall);
}
`;

const run = async (args: string[]) => {
  const proc = Bun.spawn(["bun", ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  return { code, stderr };
};

describe("the guide's examples run", () => {
  test("the scan finds them", () => {
    expect(guide.length).toBeGreaterThan(5);
    expect(simmer).toContain("game.ts");
  });

  for (const file of guide) {
    test.concurrent(file, async () => {
      const { code, stderr } = await run([join("docs", "examples", file)]);
      expect({ file, code, stderr: code === 0 ? "" : stderr }).toEqual({ file, code: 0, stderr: "" });
    }, 60_000);
  }

  for (const file of simmer) {
    test.concurrent(`simmer/${file}`, async () => {
      const { code, stderr } = await run(["-e", SIMMER_SCRIPT(file)]);
      expect({ file, code, stderr: code === 0 ? "" : stderr }).toEqual({ file, code: 0, stderr: "" });
    }, 60_000);
  }
});
