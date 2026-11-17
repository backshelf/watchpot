// A small pool of lab workers: each takes one seed at a time from a first-in, first-out queue. Workers are made on
// demand, up to `size`. `cancel()` drops the queue and ends the busy workers (the idle ones are kept).
import type { LabRun } from "./lab";
import type { Tuning } from "./toy";

/** The part of a Web Worker the pool uses, so a test can stand in a fake. */
export interface WorkerLike {
  postMessage(m: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  terminate(): void;
}

export interface LabPoolOptions {
  size: number;
  create: () => WorkerLike;
}

export interface LabPool {
  run(seed: string, tuning: Tuning): Promise<LabRun>;
  /** Rejects every queued and running job with "cancelled"; ends the busy workers, keeps the idle ones. */
  cancel(): void;
  /** Cancels, then terminates every worker. */
  dispose(): void;
}

interface Job {
  id: number;
  seed: string;
  tuning: Tuning;
  resolve(run: LabRun): void;
  reject(error: Error): void;
}

interface Slot {
  worker: WorkerLike;
  job: Job | null;
}

export function labPool({ size, create }: LabPoolOptions): LabPool {
  const slots: Slot[] = [];
  const queue: Job[] = [];
  let nextId = 1;
  let disposed = false;

  const pump = () => {
    while (queue.length > 0) {
      let slot = slots.find((s) => s.job === null);
      if (!slot) {
        if (slots.length >= size) return;
        slot = attach(create());
        slots.push(slot);
      }
      const job = queue.shift() as Job;
      slot.job = job;
      slot.worker.postMessage({ id: job.id, seed: job.seed, tuning: job.tuning });
    }
  };

  // Answers come back on the worker's own message handler; a reply for a job that is no longer running is ignored.
  const attach = (worker: WorkerLike): Slot => {
    const slot: Slot = { worker, job: null };
    worker.onmessage = (e) => {
      const msg = e.data as { id: number; run?: LabRun; error?: string };
      const job = slot.job;
      if (!job || job.id !== msg.id) return;
      slot.job = null;
      if (msg.error !== undefined) job.reject(new Error(msg.error));
      else if (msg.run !== undefined) job.resolve(msg.run);
      else job.reject(new Error("no run came back"));
      pump();
    };
    return slot;
  };

  const end = (slot: Slot) => {
    slot.worker.onmessage = null;
    slot.worker.terminate();
  };

  const cancel = () => {
    for (const job of queue.splice(0)) job.reject(new Error("cancelled"));
    for (let i = slots.length - 1; i >= 0; i--) {
      const slot = slots[i] as Slot;
      if (slot.job === null) continue;
      const job = slot.job;
      slot.job = null;
      end(slot);
      slots.splice(i, 1);
      job.reject(new Error("cancelled"));
    }
  };

  return {
    run(seed, tuning) {
      if (disposed) return Promise.reject(new Error("disposed"));
      return new Promise<LabRun>((resolve, reject) => {
        queue.push({ id: nextId++, seed, tuning, resolve, reject });
        pump();
      });
    },
    cancel,
    dispose() {
      cancel();
      disposed = true;
      for (const slot of slots.splice(0)) end(slot);
    },
  };
}
