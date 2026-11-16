/**
 * A proof worker (`proveFitParallel` starts these): imports the game's proof module once, then replays each stretch
 * it is sent on the finished table and answers with what parted. Not exported: the engine starts it by its path.
 */

import { type FitRun, replayStretch } from "./fit";
import type { FitProofModule, ProofAnswer, ProofJob } from "./proof";
import { decodeSnapshot } from "./snapshot";

const scope = globalThis as unknown as {
  onmessage: ((e: MessageEvent<ProofJob>) => void) | null;
  postMessage(message: ProofAnswer): void;
};

const loaded = new Map<string, Promise<FitProofModule>>();

async function proofOf(job: ProofJob): Promise<FitProofModule> {
  const key = `${job.module}#${job.exportName}`;
  let mod = loaded.get(key);
  if (!mod) {
    mod = import(job.module).then((m: Record<string, unknown>) => {
      const found = m[job.exportName] as FitProofModule | undefined;
      if (!found || typeof found.replay !== "function" || !found.table)
        throw new Error(
          `${job.module} exports no proof module named "${job.exportName}" ({ table, replay })`,
        );
      return found;
    });
    loaded.set(key, mod);
  }
  return mod;
}

scope.onmessage = (e) => {
  const job = e.data;
  proofOf(job)
    .then((proof) => {
      proof.table.load(job.table);
      const failed = replayStretch(
        { from: job.from === null ? undefined : decodeSnapshot(job.from), to: decodeSnapshot(job.to) },
        (from) => proof.replay(from) as FitRun,
      );
      scope.postMessage({ index: job.index, failed });
    })
    .catch((err: unknown) => {
      scope.postMessage({
        index: job.index,
        failed: [],
        error: err instanceof Error ? err.message : String(err),
      });
    });
};
