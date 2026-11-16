import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { proveFit, proveFitParallel, runFit } from "watchpot/sim";
import { pondRun, TABLE } from "./pond";

const MIN = 60_000;

/** The pond fitted, a snapshot every three minutes. */
function fit() {
  TABLE.load({});
  const r = pondRun();
  return runFit({
    ...r.run,
    table: TABLE,
    gates: r.gates,
    done: r.done,
    limitMs: 30 * MIN,
    snapshotEveryMs: 3 * MIN,
  });
}

const MODULE = join(import.meta.dir, "pond.ts");

describe("the proof on workers", () => {
  test("gives what the proof on one thread gives, for a sound table and a broken one", async () => {
    const result = fit();
    expect(result.finished).toBe(true);
    const marks = result.snapshots;
    const sound = await proveFitParallel({ module: MODULE, table: TABLE.data(), marks, workers: 3 });
    expect(sound).toEqual({ stretches: marks.length, failed: [] });

    TABLE.set("c2", "1");
    const broken = await proveFitParallel({ module: MODULE, table: TABLE.data(), marks, workers: 3 });
    const one = proveFit({ marks, replay: (from) => pondRun(from).run });
    expect(broken.failed.length).toBeGreaterThan(0);
    expect(broken).toEqual(one);
  }, 30_000);

  test("a module without the export is a failed line per stretch, not a hang", async () => {
    const result = fit();
    const proof = await proveFitParallel({
      module: MODULE,
      exportName: "nothing",
      table: TABLE.data(),
      marks: result.snapshots.slice(0, 2),
      workers: 2,
    });
    expect(proof.failed).toHaveLength(2);
    expect(proof.failed[0]).toMatch(/exports no proof module named "nothing"/);
  }, 30_000);
});
