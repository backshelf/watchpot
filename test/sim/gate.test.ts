import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runSeeds } from "watchpot/sim";

const script = join(import.meta.dir, "seed-job.ts");

describe("runSeeds", () => {
  test("returns results in seed order when later seeds finish first", async () => {
    const out = await runSeeds<{ seed: number }>({
      script,
      seeds: ["1", "2", "3"],
      args: ["--sleep=20", "--reverse"],
    });
    expect(out).toEqual([{ seed: 1 }, { seed: 2 }, { seed: 3 }]);
  });

  test("with one worker the jobs run one after another", async () => {
    const started = performance.now();
    await runSeeds({ script, seeds: ["1", "2", "3"], args: ["--sleep=50"], workers: 1 });
    expect(performance.now() - started).toBeGreaterThanOrEqual(150);
  });

  test("a failing seed rejects", async () => {
    await expect(
      runSeeds({ script, seeds: ["1", "2", "3"], args: ["--fail=2"], workers: 2 }),
    ).rejects.toThrow(/exited 1/);
  });
});
