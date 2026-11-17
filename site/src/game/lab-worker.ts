// The sim lab's worker: one seed played off the main thread. The page posts a seed and its tuning, and gets back the
// run as plain data (or the error text when the run throws). `lab-pool.ts` keeps a few of these busy.
import { type LabRun, runLab } from "./lab";
import type { Tuning } from "./toy";

interface LabJob {
  id: number;
  seed: string;
  tuning: Tuning;
}

const scope = self as unknown as {
  onmessage: ((e: { data: unknown }) => void) | null;
  postMessage(m: unknown): void;
};

scope.onmessage = (e) => {
  const job = e.data as LabJob;
  try {
    const run: LabRun = runLab(job.seed, job.tuning);
    scope.postMessage({ id: job.id, run });
  } catch (err) {
    scope.postMessage({ id: job.id, error: err instanceof Error ? err.message : String(err) });
  }
};
