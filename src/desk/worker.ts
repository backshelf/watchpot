// One seed of a desk run, in a Bun Worker: resumes from the snapshot cache, plays the fit window by window and posts
// each window as it is done. `sim.ts` starts one per seed and terminates it on a newer run.
import { mkdirSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { simCache, sourceKey, tunables } from "../sim/cache";
import type { Desk } from "../sim/desk";
import { type FitGate, type FittedGate, runFit } from "../sim/fit";
import type { SimSnapshot } from "../sim/snapshot";
import type { DeskPoint, ToClient, WorkerInit } from "./protocol";

type AnyDesk = Desk<never, never, unknown>;
const HOUR = 3_600_000;

declare const self: { postMessage(m: ToClient): void; onmessage: ((e: { data: WorkerInit }) => void) | null };

const post = (m: ToClient): void => self.postMessage(m);

function point(run: ReturnType<AnyDesk["run"]>): DeskPoint {
  const s = run.sample();
  const out: DeskPoint = {
    atMs: run.playedMs(),
    currencies: Object.fromEntries(Object.entries(s.currencies).map(([k, v]) => [k, String(v)])),
  };
  if (s.next)
    out.next = Object.fromEntries(
      Object.entries(s.next).map(([k, v]) => [k, { currency: String(v.currency), cost: String(v.cost) }]),
    );
  return out;
}

type WindowMsg = Extract<ToClient, { type: "window" }>;

/** The window cache beside the snapshot cache: `<root>/win-<fromMs>.json`, one per captured window. */
function windowCache(root: string) {
  const at = (f: string): number => Number(f.slice(4, -5));
  const names = async (): Promise<string[]> => {
    try {
      return (await readdir(root)).filter((f) => /^win-\d+(\.\d+)?\.json$/.test(f));
    } catch {
      return [];
    }
  };
  return {
    async save(m: WindowMsg): Promise<void> {
      const { id: _id, ...rest } = m;
      mkdirSync(root, { recursive: true });
      await Bun.write(`${root}/win-${m.fromMs}.json`, JSON.stringify(rest));
    },
    /** Every readable window ending by `atMs`, by `fromMs`. */
    async before(atMs: number): Promise<Omit<WindowMsg, "id">[]> {
      const out: Omit<WindowMsg, "id">[] = [];
      for (const f of await names()) {
        try {
          const w = JSON.parse(await Bun.file(`${root}/${f}`).text()) as Omit<WindowMsg, "id">;
          if (w.type === "window" && Number.isFinite(w.fromMs) && w.toMs <= atMs) out.push(w);
        } catch {
          // missing or unreadable: skipped
        }
      }
      return out.sort((a, b) => a.fromMs - b.fromMs);
    },
    async dropFrom(atMs: number): Promise<void> {
      for (const f of await names()) if (at(f) >= atMs) await rm(`${root}/${f}`, { force: true });
    },
  };
}

async function play(init: WorkerInit): Promise<void> {
  const { id, seed, cwd, pins } = init;
  const desk = (await import(pathToFileURL(init.deskPath).href)).default as AnyDesk;
  const values: Record<string, number> = { ...(desk.knobs.defaults() as object), ...init.knobs };
  const key = await sourceKey([...desk.source], { cwd, extra: `seed:${seed}` });
  const cache = simCache<unknown>({ key, dir: `${cwd}/.watchpot/sim-cache` });
  const wins = windowCache(`${cwd}/.watchpot/sim-cache/${key}`);
  let t = tunables(values);
  const gates = desk.run({ seed }).gates as readonly FitGate[];
  const resumed = await cache.resume(gates, t, pins);
  if (resumed) {
    t = tunables(values, undefined, { firstRead: resumed.firstRead });
    const atMs = resumed.snapshot.atMs;
    await cache.dropAfter(atMs);
    const earlier = await wins.before(atMs);
    for (const [i, w] of earlier.entries()) {
      const { resumedFromMs: _r, ...rest } = w;
      post({ ...rest, id, cached: true, ...(i === 0 ? { resumedFromMs: atMs } : {}) });
    }
    await wins.dropFrom(atMs);
  }
  const W = desk.windowHours * HOUR;
  const endMs = desk.end.hours * HOUR;
  let from: SimSnapshot<unknown> | undefined = resumed?.snapshot;
  let first = true;
  for (;;) {
    desk.knobs.bind(t);
    try {
      const run = desk.run({ seed, from });
      t.setClock(run.playedMs);
      const start = run.playedMs();
      const capture = run.capture !== undefined;
      const limit = capture ? Math.min(endMs, (Math.floor(start / W) + 1) * W) : endMs;
      const every = W / 120;
      const points: DeskPoint[] = [point(run)];
      let lastAt = start;
      const chained = run.afterStep?.bind(run);
      const afterStep = (): void => {
        chained?.();
        const at = run.playedMs();
        if (at - lastAt >= every) {
          lastAt = at;
          points.push(point(run));
        }
      };
      const result = runFit({
        ...desk.fit,
        ...run,
        afterStep,
        table: run.table,
        gates: run.gates as readonly FitGate[],
        done: () => run.done?.() ?? false,
        limitMs: limit,
        pinned: pins,
        from,
        snapshotEveryMs: desk.fit?.snapshotEveryMs ?? W,
      });
      if (points.at(-1)?.atMs !== run.playedMs()) points.push(point(run));
      const played = run.playedMs();
      for (const s of result.snapshots) await cache.save(s, t);
      const finished = result.finished || played >= endMs || (run.done?.() ?? false);
      const gatesOut: FittedGate[] = result.gates;
      const resumedFromMs = first && resumed ? resumed.snapshot.atMs : undefined;
      if (capture) {
        const win: WindowMsg = {
          type: "window",
          id,
          seed,
          fromMs: start,
          toMs: played,
          points,
          gates: gatesOut,
          ...(resumedFromMs !== undefined ? { resumedFromMs } : {}),
        };
        post(win);
        await wins.save({ ...win, resumedFromMs: undefined });
      } else {
        // No snapshots: the whole span was one fit; post it a window at a time.
        for (let k = Math.floor(start / W); k * W < played || k === Math.floor(start / W); k++) {
          const lo = k * W;
          const hi = Math.min(lo + W, played);
          const inWin = points.filter(
            (p) => p.atMs >= lo && (p.atMs < hi || (p.atMs === hi && hi === played)),
          );
          post({
            type: "window",
            id,
            seed,
            fromMs: Math.max(lo, start),
            toMs: hi,
            points: inWin,
            gates: gatesOut,
            ...(k === Math.floor(start / W) && resumedFromMs !== undefined ? { resumedFromMs } : {}),
          });
        }
      }
      first = false;
      const next = result.snapshots.at(-1);
      if (finished || !capture || played <= start) {
        post({ type: "done", id, seed, finished: result.finished, playedMs: played });
        return;
      }
      if (!next) throw new Error("the fit left no snapshot to carry on from");
      from = next;
    } finally {
      desk.knobs.bind(null);
    }
  }
}

self.onmessage = (e) => {
  const init = e.data;
  play(init).catch((err) =>
    post({
      type: "error",
      id: init.id,
      seed: init.seed,
      message: err instanceof Error ? err.message : String(err),
    }),
  );
};
