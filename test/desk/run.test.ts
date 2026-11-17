// `watchpot sim`'s run service over a real WebSocket: windows per seed, resume from the cache, cancel by a newer run.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { ToClient, ToServer } from "../../src/desk/protocol";
import { startSim } from "../../src/desk/server";
import { useBunFetch } from "../happydom";

// The test preload (happy-dom) replaces the fetch globals, which `Bun.serve` refuses: Bun's own for this file.
let restore = (): void => {};
beforeAll(() => {
  restore = useBunFetch();
});
afterAll(() => restore());

const FIXTURE = join(import.meta.dir, "fixtures", "desk-game");
const HOUR = 3_600_000;
const made: string[] = [];
const stops: (() => void)[] = [];
const sockets: WebSocket[] = [];

afterEach(() => {
  for (const s of sockets.splice(0)) s.close();
  for (const stop of stops.splice(0)) stop();
});
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A copy of the fixture beside it (its imports are relative to the repo), so its cache is its own. */
function copy(): string {
  const dir = mkdtempSync(join(import.meta.dir, "fixtures", "run-"));
  made.push(dir);
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

async function connect(cwd: string) {
  const sim = await startSim({ cwd, port: 0 });
  stops.push(sim.stop);
  const ws = new WebSocket(`${sim.url.replace("http", "ws")}ws`);
  sockets.push(ws);
  const got: ToClient[] = [];
  const waiting: (() => void)[] = [];
  ws.onmessage = (e) => {
    got.push(JSON.parse(String(e.data)));
    for (const w of waiting.splice(0)) w();
  };
  await new Promise<void>((ok, fail) => {
    ws.onopen = () => ok();
    ws.onerror = () => fail(new Error("socket failed"));
  });
  const until = async (ok: (all: ToClient[]) => boolean): Promise<ToClient[]> => {
    const timeout = Date.now() + 30_000;
    while (!ok(got)) {
      if (Date.now() > timeout) throw new Error(`timed out; got ${JSON.stringify(got.map((m) => m.type))}`);
      await new Promise<void>((r) => {
        waiting.push(r);
        setTimeout(r, 200);
      });
    }
    return got;
  };
  const run = (m: Partial<ToServer> & { id: number }) =>
    ws.send(JSON.stringify({ type: "run", knobs: {}, pins: {}, seeds: 1, ...m }));
  return { ws, got, until, run };
}

type Win = Extract<ToClient, { type: "window" }>;
const windows = (all: ToClient[], id: number, seed = 1): Win[] =>
  all.filter((m): m is Win => m.type === "window" && m.id === id && m.seed === seed);
const finished =
  (id: number, seed = 1) =>
  (all: ToClient[]) =>
    all.some((m) => m.type === "done" && m.id === id && m.seed === seed);

describe("the sim desk's run service", () => {
  test("one seed: three windows, then done; points rise and the gate opens", async () => {
    const c = await connect(copy());
    c.run({ id: 1 });
    const all = await c.until(finished(1));
    const w = windows(all, 1);
    expect(w.map((x) => [x.fromMs, x.toMs])).toEqual([
      [0, HOUR],
      [HOUR, 2 * HOUR],
      [2 * HOUR, 3 * HOUR],
    ]);
    expect(w[0]?.resumedFromMs).toBeUndefined();
    const coins = w.flatMap((x) => x.points).map((p) => Number(p.currencies.coins));
    expect(coins.length).toBeGreaterThan(100);
    for (let i = 1; i < coins.length; i++)
      expect(coins[i] as number).toBeGreaterThanOrEqual(coins[i - 1] as number);
    expect(coins.at(-1)).toBeGreaterThan(coins[0] as number);
    expect(w[2]?.gates[0]?.openedMs).toBeDefined();
    expect(all.find((m) => m.type === "done")).toMatchObject({ playedMs: 3 * HOUR });
  }, 60_000);

  test("the same run again resumes from the cache and ends on the same point", async () => {
    const dir = copy();
    const a = await connect(dir);
    a.run({ id: 1 });
    const first = windows(await a.until(finished(1)), 1);
    const b = await connect(dir);
    b.run({ id: 2 });
    const again = windows(await b.until(finished(2)), 2);
    expect(again[0]?.resumedFromMs).toBeGreaterThan(0);
    expect(again.at(-1)?.points.at(-1)).toEqual(first.at(-1)?.points.at(-1));
  }, 60_000);

  test("a changed knob invalidates resume at its first read", async () => {
    const dir = copy();
    const a = await connect(dir);
    a.run({ id: 1 });
    await a.until(finished(1));
    const b = await connect(dir);
    b.run({ id: 2, knobs: { rate: 3 } });
    const w = windows(await b.until(finished(2)), 2);
    expect(w).toHaveLength(3);
    expect(w.some((x) => x.resumedFromMs !== undefined)).toBe(false);
  }, 60_000);

  test("a newer run cancels the running one", async () => {
    const c = await connect(copy());
    c.run({ id: 1 });
    c.run({ id: 2 });
    const all = await c.until(finished(2));
    const types = all.map((m) => `${m.type}:${m.id}`);
    expect(types).toContain("cancelled:1");
    expect(types.indexOf("cancelled:1")).toBeLessThan(types.indexOf("window:2"));
    expect(all.some((m) => m.type === "done" && m.id === 1)).toBe(false);
    expect(windows(all, 2)).toHaveLength(3);
  }, 60_000);

  test("an unknown knob is an error and nothing runs", async () => {
    const c = await connect(copy());
    c.run({ id: 7, knobs: { nope: 1 } });
    const all = await c.until((m) => m.some((x) => x.type === "error"));
    expect(all[0]).toMatchObject({ type: "error", id: 7 });
    await Bun.sleep(300);
    expect(all.every((m) => m.type === "error")).toBe(true);
  });

  test("a malformed message is an error with id -1, and so are bad seeds", async () => {
    const c = await connect(copy());
    c.ws.send("{nope");
    c.run({ id: 3, seeds: 9 });
    c.run({ id: 4, knobs: { rate: Number.NaN as number } });
    const all = await c.until((m) => m.length >= 3);
    expect(all.map((m) => [m.type, m.id])).toEqual([
      ["error", -1],
      ["error", 3],
      ["error", 4],
    ]);
  });

  test("two seeds give windows for seeds 1 and 2", async () => {
    const c = await connect(copy());
    c.run({ id: 1, seeds: 2 });
    const all = await c.until((m) => finished(1, 1)(m) && finished(1, 2)(m));
    expect(windows(all, 1, 1)).toHaveLength(3);
    expect(windows(all, 1, 2)).toHaveLength(3);
  }, 60_000);
});
