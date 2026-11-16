import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { D, Decimal } from "watchpot/core";
import {
  createSimWorld,
  decodeSnapshot,
  encodeSnapshot,
  type FitGate,
  fitHolds,
  formatProfile,
  latestSnapshot,
  profileSim,
  proveFit,
  resumeSimWorld,
  runFit,
  type SimSnapshot,
  simStore,
  snapshotCadence,
  snapshotDiff,
  takeSnapshot,
  timeSteps,
} from "watchpot/sim";
import { main as fitKitExample } from "../../docs/examples/fit-kit";
import { CHARMS, game, type PondExtra, pondRun, TABLE } from "./pond";

const MIN = 60_000;

beforeEach(() => TABLE.load({}));

/** Plays a pond run `ms` more, a look every third second, as a sim script would. */
function play(run: ReturnType<typeof pondRun>, ms: number): void {
  const end = run.run.playedMs() + ms;
  for (let n = run.run.playedMs() / 1000; run.run.playedMs() < end; n++) {
    if (n % 3 === 0) run.run.look();
    run.run.step(1000);
  }
}

/** The whole state of a run, to compare two: the world, the player, the holdings. */
const whole = (run: ReturnType<typeof pondRun>) => ({
  world: run.world.snapshot(),
  player: run.player.remember(),
  have: run.have.remember(),
});

describe("the snapshot codec", () => {
  test("gives back every Decimal exactly, the ones a save's string loses included", () => {
    const values = Array.from({ length: 400 }, (_, i) => D(1.7 + i / 97).pow(37 * i + 0.123));
    values.push(D(Number.POSITIVE_INFINITY), D(0), D(-3.25), D("1e1e20"));
    const back = decodeSnapshot<{ values: Decimal[]; odd: number[] }>(
      encodeSnapshot({
        format: 1,
        atMs: 5,
        world: { now: 1, state: {} },
        extra: { values, odd: [Number.POSITIVE_INFINITY, Number.NaN, -0.5] },
      }),
    );
    const got = back.extra?.values ?? [];
    expect(got).toHaveLength(values.length);
    got.forEach((d, i) => {
      const want = values[i] as Decimal;
      expect(d).toBeInstanceOf(Decimal);
      expect([d.sign, d.layer, d.mag]).toEqual([want.sign, want.layer, want.mag]);
    });
    expect(back.extra?.odd).toEqual([Number.POSITIVE_INFINITY, Number.NaN, -0.5]);
    expect(snapshotDiff(back.extra?.values, values)).toEqual([]);
  });

  test("refuses text that is not a snapshot", () => {
    expect(() => decodeSnapshot('{"format":9}')).toThrow(/not a sim snapshot/);
  });

  test("snapshotDiff names where two values part", () => {
    expect(snapshotDiff({ a: { b: D(2) }, c: [1] }, { a: { b: D(3) }, c: [1] })).toEqual([
      '.a.b: {"$D":[1,0,2]} against {"$D":[1,0,3]}',
    ]);
  });
});

describe("snapshotCadence and latestSnapshot", () => {
  test("a mark every everyMs after where the run started; skipped marks count once", () => {
    const c = snapshotCadence(10, 25);
    expect(c.next()).toBe(30);
    expect(c.due(29)).toBe(false);
    expect(c.due(30)).toBe(true);
    expect(c.due(35)).toBe(false);
    expect(c.due(61)).toBe(true);
    expect(c.next()).toBe(70);
  });

  test("the latest at or before a moment that holds", () => {
    const at = (atMs: number) => ({ format: 1, atMs, world: { now: 0, state: {} } }) as const;
    const all = [at(10), at(30), at(20)];
    expect(latestSnapshot(all, 25)?.atMs).toBe(20);
    expect(latestSnapshot(all, 25, (s) => s.atMs !== 20)?.atMs).toBe(10);
    expect(latestSnapshot(all, 5)).toBeUndefined();
  });
});

describe("resuming a sim from a snapshot", () => {
  test("is the run that never stopped: the store, the rng, the player and the holdings", () => {
    TABLE.load({ c1: "40", c2: "300", c3: "2000", c4: "9000" });
    const a = pondRun();
    play(a, 40 * MIN);

    const b = pondRun();
    play(b, 15 * MIN);
    const text = encodeSnapshot(
      takeSnapshot<PondExtra>({
        atMs: b.run.playedMs(),
        world: b.world,
        player: b.player,
        extra: { have: b.have.remember() },
      }),
    );
    const c = pondRun(decodeSnapshot<PondExtra>(text));
    play(c, 25 * MIN);

    expect(c.state().pond.found).toBeGreaterThan(0); // the rng drew on the way
    expect(c.state().pond.charms.length).toBeGreaterThan(0); // and the player bought
    expect(c.run.playedMs()).toBe(a.run.playedMs());
    expect(c.world.now()).toBe(a.world.now());
    expect(snapshotDiff(whole(c), whole(a))).toEqual([]);
  });

  test("a plain store's snapshot leaves out actions and derived values, and restore brings them back", () => {
    const r = pondRun();
    TABLE.load({ c1: "1" });
    r.state().pond.buyCharm("c1");
    const data = r.world.snapshot().state;
    expect(Object.keys(data.pond ?? {}).sort()).toEqual(["charms", "drops", "found", "luck", "pumps"]);
    const fresh = pondRun();
    expect(fresh.state().pond.rate.toNumber()).toBe(1);
    (fresh.world.store as unknown as { restore(d: typeof data): void }).restore(data);
    expect(fresh.state().pond.rate.toNumber()).toBe(2);
    expect(fresh.state().pond.charms).toEqual(["c1"]);
    data.pond?.charms && (data.pond.charms as string[]).push("x");
    expect(fresh.state().pond.charms).toEqual(["c1"]); // restore copied it
  });
});

/** A whole fit of the pond, a snapshot every five minutes. */
function fitPond(from?: SimSnapshot<PondExtra>, move?: Partial<Record<string, number>>) {
  const r = pondRun(from);
  const gates: FitGate[] = r.gates.map((g) => ({ ...g, atMs: (move?.[g.key] ?? g.atMs / MIN) * MIN }));
  const result = runFit({
    ...r.run,
    table: TABLE,
    gates,
    done: r.done,
    limitMs: 30 * MIN,
    snapshotEveryMs: 5 * MIN,
    from,
  });
  return { result, table: TABLE.data(), gates };
}

describe("a fit with snapshots", () => {
  test("prices every gate and leaves a snapshot every five minutes and one at the end", () => {
    const { result, table } = fitPond();
    expect(result.finished).toBe(true);
    expect(Object.keys(table).sort()).toEqual([...CHARMS].sort());
    const marks = result.snapshots.map((s) => s.atMs);
    expect(marks.slice(0, 2)).toEqual([5 * MIN, 10 * MIN]);
    expect(marks.at(-1)).toBe(result.playedMs);
    // Each snapshot holds the table as it stood: a gate priced later is not in it yet.
    for (const snap of result.snapshots) {
      const priced = result.gates.filter((g) => (g.openedMs ?? Number.POSITIVE_INFINITY) <= snap.atMs);
      expect(Object.keys(snap.fit?.table ?? {}).sort()).toEqual(priced.map((g) => g.key).sort());
    }
    expect(Object.keys(result.snapshots[0]?.fit?.table ?? {}).length).toBeLessThan(CHARMS.length);
  });

  test("carried on from a snapshot, prices what the uninterrupted fit priced and leaves the same snapshots", () => {
    const whole = fitPond();
    const mark = whole.result.snapshots[1] as SimSnapshot<PondExtra>; // ten minutes in
    TABLE.load({ c4: "1" }); // whatever the table holds now, the fit takes the snapshot's
    const resumed = fitPond(decodeSnapshot<PondExtra>(encodeSnapshot(mark)));
    expect(resumed.table).toEqual(whole.table);
    expect(resumed.result.gates).toEqual(whole.result.gates);
    expect(resumed.result.playedMs).toBe(whole.result.playedMs);
    const later = whole.result.snapshots.slice(2);
    expect(resumed.result.snapshots.map((s) => s.atMs)).toEqual(later.map((s) => s.atMs));
    expect(snapshotDiff(resumed.result.snapshots, later)).toEqual([]);
  });

  test("refuses a snapshot the plan has moved under, and takes one moved only after it", () => {
    const whole = fitPond();
    const mark = whole.result.snapshots[1] as SimSnapshot<PondExtra>;
    expect(fitHolds(mark, fitPond(undefined, { c2: 6 }).gates)).toEqual([
      '"c2" is planned at 0:06, before the snapshot, and was not then',
      '"c2" was planned at 0:05, before the snapshot, and is not now',
    ]);
    expect(() => fitPond(mark, { c2: 6 })).toThrow(/cannot carry on/);
    expect(fitPond(mark, { c4: 16 }).result.finished).toBe(true);
  });
});

describe("the proof", () => {
  test("replays the finished table between the snapshots and finds the fit's run", () => {
    const { result } = fitPond();
    const proof = proveFit({ marks: result.snapshots, replay: (from) => pondRun(from).run });
    expect(proof).toEqual({ stretches: result.snapshots.length, failed: [] });
  });

  test("a price below what the fit set opens a gate early, and the stretch it falls in parts", () => {
    const { result } = fitPond();
    TABLE.set("c3", "1");
    const proof = proveFit({ marks: result.snapshots, replay: (from) => pondRun(from).run });
    expect(proof.failed.length).toBeGreaterThan(0);
    expect(proof.failed[0]).toMatch(/^to 0:05: .*charms/);
  });

  test("from a fit that carried on from a snapshot, starts there", () => {
    const whole = fitPond();
    const start = whole.result.snapshots[1] as SimSnapshot<PondExtra>;
    const { result } = fitPond(start);
    const proof = proveFit({ marks: result.snapshots, start, replay: (from) => pondRun(from).run });
    expect(proof.failed).toEqual([]);
  });
});

describe("the profiler", () => {
  test("times the look against the step, and each of the game's steps by id", () => {
    let t = 0;
    const timer = () => t++;
    const timed = timeSteps(game, timer);
    expect(timed.game.features).not.toBe(game.features);
    const r = pondRun();
    TABLE.load({ c1: "40" });
    // A store over the timed game, carried on from the plain run's world.
    const world = resumeSimWorld((now) => simStore(timed.game, now, "pond"), r.world.snapshot());
    let played = 0;
    const profile = profileSim({
      steps: 50,
      timer,
      look: () => r.player.look(world.store as never),
      step: () => {
        world.play(1000);
        played += 1000;
      },
      timed,
      playedMs: () => played,
    });
    expect(profile.steps).toBe(50);
    expect(profile.playedMs).toBe(50_000);
    expect(profile.totalMs).toBe(profile.lookMs + profile.stepMs);
    expect(profile.perStep.step).toBeGreaterThan(0);
    const ids = profile.bySteps.map((s) => s.id).sort();
    expect(ids).toEqual(["pond.produce.flow", "pond.settle.luck"]);
    expect(profile.bySteps.every((s) => s.calls === 50)).toBe(true);
    const text = formatProfile(profile);
    expect(text).toMatch(/^50 steps, 0\.01 played hours, [\d.]+ ms a step: look [\d.]+, step [\d.]+/);
    expect(text).toContain("| pond.settle.luck | 50 |");
  });

  test("a timed game plays the same as the game", () => {
    const timed = timeSteps(game, () => 0);
    const a = createSimWorld((now) => simStore(game, now, "x"), 0);
    const b = createSimWorld((now) => simStore(timed.game, now, "x"), 0);
    a.play(120_000);
    b.play(120_000);
    expect(snapshotDiff(b.snapshot(), a.snapshot())).toEqual([]);
  });
});

describe("the fit kit's example", () => {
  test("fits, carries a fit on, proves the table and profiles, on one thread", async () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await fitKitExample()).toBe(true);
    } finally {
      log.mockRestore();
    }
  });
});
