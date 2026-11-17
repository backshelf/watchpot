// The landing page's sim lab runs its seeds on the main thread, one a timeslice, so a seed must stay quick: with the
// sim's one-second default tick a seed took about two seconds and froze scrolling; with the lab's minute tick it
// takes a tenth of that. The bound is loose on purpose (a shared machine), and still far under the slow case.
import { expect, test } from "bun:test";
import { runLab } from "../src/game/lab";

test("one sim lab seed plays its three days in well under a second", () => {
  runLab("warm-up");
  const started = performance.now();
  const run = runLab("seed-timing");
  const ms = performance.now() - started;
  expect(run.rows.length).toBeGreaterThan(0);
  expect(ms).toBeLessThan(800);
});
