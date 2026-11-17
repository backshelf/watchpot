import { describe, expect, test } from "bun:test";
import type { LabRun } from "../src/game/lab";
import { labPool, type WorkerLike } from "../src/game/lab-pool";

interface Msg {
  id: number;
  seed: string;
  tuning: unknown;
}

/** A fake worker. By default it answers at once; with `hold` it keeps each job until `finish` is called. */
class FakeWorker implements WorkerLike {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  terminated = false;
  jobs: Msg[] = [];
  constructor(private readonly hold: boolean) {}
  postMessage(m: unknown) {
    const msg = m as Msg;
    this.jobs.push(msg);
    if (!this.hold) this.reply(msg);
  }
  terminate() {
    this.terminated = true;
    this.onmessage = null;
  }
  busy() {
    return this.jobs.length > 0 && !this.terminated;
  }
  /** Answers the oldest job that has no answer yet. */
  finish(error?: string) {
    const msg = this.jobs.shift();
    if (msg) this.reply(msg, error);
  }
  private reply(msg: Msg, error?: string) {
    if (this.terminated) return;
    const data = error === undefined ? { id: msg.id, run: fakeRun(msg.seed) } : { id: msg.id, error };
    this.onmessage?.({ data });
  }
}

function fakeRun(seed: string): LabRun {
  return { seed, rows: [], verdicts: [], ms: 1, looks: 1 };
}

/** A pool whose workers are fakes; `made` lists them in creation order. */
function pool(size: number, hold: boolean) {
  const made: FakeWorker[] = [];
  const p = labPool({
    size,
    create: () => {
      const w = new FakeWorker(hold);
      made.push(w);
      return w;
    },
  });
  return { p, made };
}

/** A job whose rejection a test may leave unread (a cancelled or disposed job). */
function go(p: { run(seed: string, tuning: unknown): Promise<LabRun> }, seed: string, tuning: unknown = {}) {
  const job = p.run(seed, tuning);
  job.catch(() => {});
  return job;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("lab pool", () => {
  test("every seed comes back, and no more than size workers are made", async () => {
    const { p, made } = pool(2, false);
    const seeds = ["a", "b", "c", "d", "e"];
    const runs = await Promise.all(seeds.map((s) => go(p, s, { pressure: 0.25 })));
    expect(runs.map((r) => r.seed)).toEqual(seeds);
    expect(made.length).toBeLessThanOrEqual(2);
    p.dispose();
  });

  test("a fourth job waits for a free worker when size is three", async () => {
    const { p, made } = pool(3, true);
    const first = [go(p, "1", {}), go(p, "2", {}), go(p, "3", {})];
    const fourth = go(p, "4", {});
    expect(made.length).toBe(3);
    expect(made.every((w) => w.jobs.length === 1)).toBe(true);
    made[0]?.finish();
    expect((await first[0]) as LabRun).toMatchObject({ seed: "1" });
    await flush();
    expect(made.length).toBe(3);
    expect(made[0]?.jobs.map((j) => j.seed)).toEqual(["4"]);
    made[0]?.finish();
    expect(await fourth).toMatchObject({ seed: "4" });
    p.dispose();
  });

  test("cancel rejects queued and running jobs and terminates only busy workers", async () => {
    const { p, made } = pool(2, true);
    const first = go(p, "r1", {});
    const second = go(p, "r2", {});
    // Worker 0 answers its job and goes idle before the cancel; worker 1 is still busy.
    made[0]?.finish();
    await first;
    p.cancel();
    await expect(second).rejects.toThrow("cancelled");
    expect(made[0]?.terminated).toBe(false);
    expect(made[1]?.terminated).toBe(true);
    p.dispose();
  });

  test("cancel also rejects jobs still in the queue", async () => {
    const { p, made } = pool(1, true);
    const running = go(p, "r1", {});
    const queued = go(p, "q1", {});
    expect(made.length).toBe(1);
    p.cancel();
    await expect(running).rejects.toThrow("cancelled");
    await expect(queued).rejects.toThrow("cancelled");
    expect(made[0]?.terminated).toBe(true);
    p.dispose();
  });

  test("a job after cancel runs", async () => {
    const { p, made } = pool(1, true);
    const gone = go(p, "gone", {});
    p.cancel();
    await expect(gone).rejects.toThrow("cancelled");
    expect(made[0]?.terminated).toBe(true);
    const next = go(p, "next", {});
    expect(made.length).toBe(2);
    made[1]?.finish();
    expect(await next).toMatchObject({ seed: "next" });
    p.dispose();
  });

  test("an error reply rejects only that job", async () => {
    const { p, made } = pool(2, true);
    const bad = go(p, "bad", {});
    const good = go(p, "good", {});
    made[0]?.finish("boom");
    await expect(bad).rejects.toThrow("boom");
    made[1]?.finish();
    expect(await good).toMatchObject({ seed: "good" });
    p.dispose();
  });

  test("dispose terminates every worker", async () => {
    const { p, made } = pool(3, true);
    go(p, "1", {});
    go(p, "2", {});
    go(p, "3", {});
    made[0]?.finish();
    p.dispose();
    expect(made.every((w) => w.terminated)).toBe(true);
  });
});
