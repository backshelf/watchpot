import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { D } from "watchpot/core";
import { type FitGate, fitTable, type GatePin, runFit, simCache, sourceKey, tunables } from "watchpot/sim";

const tmp = mkdtempSync(join(tmpdir(), "watchpot-cache-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("tunables", () => {
  test("records first reads at the clock's time, keeps the first, and throws on write", () => {
    let now = 0;
    const t = tunables({ a: 1, b: "x", c: true });
    expect(t.values.a).toBe(1); // no clock yet: 0
    t.setClock(() => now);
    now = 500;
    t.values.b;
    now = 900;
    t.values.a;
    t.values.b;
    expect(t.firstRead()).toEqual({ a: 0, b: 500 });
    expect(() => {
      (t.values as { a: number }).a = 2;
    }).toThrow();
    expect(t.current()).toEqual({ a: 1, b: "x", c: true });
    expect(tunables({ a: 1 }, () => 7, { firstRead: { z: 3 } }).firstRead()).toEqual({ z: 3 });
  });
});

describe("sourceKey", () => {
  test("changes with a matched file's contents, not an unmatched one's", async () => {
    const dir = join(tmp, "src");
    await Bun.write(join(dir, "a.ts"), "one");
    await Bun.write(join(dir, "b.txt"), "x");
    const k = () => sourceKey(["*.ts"], { cwd: dir });
    const first = await k();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    await Bun.write(join(dir, "b.txt"), "y");
    expect(await k()).toBe(first);
    await Bun.write(join(dir, "a.ts"), "two");
    expect(await k()).not.toBe(first);
  });
});

const MIN = 60_000;
const LATE_AT = 5 * MIN;

/** A jar: `rate` coins a second from the start, `late` more a second once five minutes have been played. */
function game(
  values: { rate: number; late: number },
  from?: Awaited<ReturnType<ReturnType<typeof simCache>["resume"]>>,
  pinned?: Record<string, GatePin>,
) {
  const t = tunables(values, undefined, from);
  const s = { coins: D(0), playedMs: 0, paid: false };
  if (from) {
    const x = from.snapshot.extra as { coins: string; playedMs: number; paid: boolean };
    s.coins = D(x.coins);
    s.playedMs = x.playedMs;
    s.paid = x.paid;
  }
  t.setClock(() => s.playedMs);
  const seen = new Map<number, Record<string, number>>();
  const gates: FitGate[] = [{ key: "g", atMs: 8 * MIN, price: () => "1" }];
  const run = () =>
    runFit({
      table: fitTable(),
      gates,
      step: (dt) => {
        let per = t.values.rate;
        if (s.playedMs >= LATE_AT) per += t.values.late;
        s.coins = s.coins.add((per * dt) / 1000);
        s.playedMs += dt;
      },
      look: () => undefined,
      playedMs: () => s.playedMs,
      done: () => false,
      limitMs: 10 * MIN,
      stepMs: 1000,
      capture: () => {
        seen.set(s.playedMs, t.firstRead());
        return {
          // (a real game saves from here; the test notes the first reads as they stood now)
          world: { now: s.playedMs, state: {} },
          extra: { coins: s.coins.toString(), playedMs: s.playedMs, paid: s.paid },
        };
      },
      snapshotEveryMs: MIN,
      ...(pinned && { pinned }),
      ...(from && { from: from.snapshot }),
    });
  return { t, s, gates, run, seen };
}

describe("simCache", () => {
  test("resumes from the latest snapshot valid under what changed, and the resumed run equals a fresh one", async () => {
    const base = { rate: 1, late: 2 };
    const cache = simCache<unknown>({ key: "k", dir: join(tmp, "cache") });
    const g0 = game(base);
    const result = g0.run();
    // Saved after the run, with the tunables as they ended: `save` keeps only the reads made by each snapshot's moment.
    for (const snap of result.snapshots) await cache.save(snap, g0.t as never);
    expect(result.snapshots.length).toBeGreaterThan(5);

    const last = result.snapshots.at(-1)?.atMs;
    expect((await cache.resume(g0.gates, tunables(base)))?.snapshot.atMs).toBe(last);
    expect(await cache.resume(g0.gates, tunables({ ...base, rate: 3 }))).toBeUndefined();

    const changed = { ...base, late: 5 };
    const got = await cache.resume(g0.gates, tunables(changed));
    // The jar first reads `late` at 5 min. A read at a snapshot's own moment counts as before it (a game's clock can
    // reach that moment mid-step), so the latest snapshot that cannot have seen `late` is the one at 4 min.
    expect(got?.snapshot.atMs).toBe(LATE_AT - MIN);
    expect(got?.firstRead.late).toBeUndefined();

    const resumed = game(changed, got).run();
    const fresh = game(changed).run();
    expect(resumed.gates).toEqual(fresh.gates);
    expect(resumed.snapshots.at(-1)?.world).toEqual(fresh.snapshots.at(-1)?.world);
    expect(resumed.snapshots.at(-1)?.extra).toEqual(fresh.snapshots.at(-1)?.extra);

    await cache.dropAfter(LATE_AT);
    expect((await cache.resume(g0.gates, tunables(base)))?.snapshot.atMs).toBe(LATE_AT);
    await cache.clear();
    expect(await cache.resume(g0.gates, tunables(base))).toBeUndefined();
  });

  test("resume skips a snapshot invalidated by a changed pin before it", async () => {
    const cache = simCache<unknown>({ key: "pins", dir: join(tmp, "cache") });
    const pinned = { g: { price: 5 } };
    const g0 = game({ rate: 1, late: 2 }, undefined, pinned);
    const result = g0.run();
    for (const snap of result.snapshots) await cache.save(snap, g0.t as never);
    const t = () => tunables({ rate: 1, late: 2 });
    expect((await cache.resume(g0.gates, t(), pinned))?.snapshot.atMs).toBe(result.snapshots.at(-1)?.atMs);
    // g opens at 8 min: only snapshots before it still hold when its pin changes
    const got = await cache.resume(g0.gates, t(), { g: { price: 6 } });
    expect(got?.snapshot.atMs).toBeLessThan(8 * MIN);
    expect((await cache.resume(g0.gates, t()))?.snapshot.atMs).toBeLessThan(8 * MIN);
  });
});
