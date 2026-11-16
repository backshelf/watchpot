import { describe, expect, test } from "bun:test";
import {
  defineGame,
  drawTarget,
  feature,
  gradeStrike,
  passesIn,
  type SweepTarget,
  seedRng,
  sweep,
  sweepAt,
} from "watchpot/core";
import { freshStore, T0 } from "watchpot/test";

/** A copy of a state without its actions: what a recipe is handed, for calling a draft helper directly. */
const plain = <T>(state: T): T => JSON.parse(JSON.stringify(state));

const GRADES = [
  { id: "perfect", within: 0.25 },
  { id: "good", within: 1 },
];

describe("sweep kernel", () => {
  test("a triangle goes there and back in a period; a saw goes across and starts again", () => {
    const tri = { periodMs: 2000 };
    expect(sweepAt(0, tri)).toBe(0);
    expect(sweepAt(500, tri)).toBe(0.5);
    expect(sweepAt(1000, tri)).toBe(1);
    expect(sweepAt(1500, tri)).toBe(0.5);
    expect(sweepAt(2500, tri, 1000)).toBe(0.5);
    const saw = { periodMs: 2000, wave: "saw" as const };
    expect(sweepAt(1500, saw)).toBe(0.75);
    expect(sweepAt(-500, saw)).toBe(0.75);
    expect(passesIn(4000, tri)).toBe(4);
    expect(passesIn(4000, saw)).toBe(2);
  });

  test("a strike takes the nearest target at the tightest grade it is within", () => {
    const targets: SweepTarget[] = [
      { at: 0.2, width: 0.2 },
      { at: 0.6, width: 0.1 },
    ];
    expect(gradeStrike(0.21, targets, GRADES)).toMatchObject({ index: 0, grade: "perfect" });
    expect(gradeStrike(0.28, targets, GRADES)).toMatchObject({ index: 0, grade: "good" });
    expect(gradeStrike(0.64, targets, GRADES)).toMatchObject({ index: 1, grade: "good" });
    expect(gradeStrike(0.4, targets, GRADES)).toBeNull();
    // Inside the span but outside every grade is a miss.
    expect(gradeStrike(0.28, targets, [{ id: "perfect", within: 0.25 }])).toBeNull();
  });

  test("a new target is drawn inside the track and clear of the ones down while there is room", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      let rng = seedRng(seed);
      const down: SweepTarget[] = [];
      for (let i = 0; i < 3; i++) {
        const [t, next] = drawTarget(rng, 0.1, down);
        rng = next;
        expect(t.at - 0.05).toBeGreaterThanOrEqual(0);
        expect(t.at + 0.05).toBeLessThanOrEqual(1);
        for (const o of down) expect(Math.abs(o.at - t.at)).toBeGreaterThanOrEqual(0.1 - 1e-9);
        down.push(t);
      }
    }
  });
});

describe("sweep feature", () => {
  const purse = feature({ key: "purse", initial: () => ({ paid: 0, wide: 0.2 }) });
  const line = sweep({
    key: "line",
    reach: [purse],
    setup: (s) => ({ motion: { periodMs: 2000 }, count: 3, width: s.purse.wide }),
    grades: GRADES,
    onStrike: (d, result) => {
      if (result.hit) d.purse.paid += result.hit.grade === "perfect" ? 5 * result.streak : 1;
    },
  });
  const game = defineGame({
    id: "sweeps",
    save: { key: "sweeps.save", version: 1 },
    features: [purse, line],
  });

  test("a hit pays, takes its target, tops the track up and extends the streak; a miss ends it", () => {
    const { store, clock } = freshStore(game, { at: T0, seed: "sweep" });
    store.getState().tick(100, T0 + 100);
    const first = store.getState().line.targets[0];
    expect(store.getState().line.targets).toHaveLength(3);
    if (!first) throw new Error("no target");
    // The triangle is at `first.at` this long after it began.
    clock.set(store.getState().line.since + first.at * 1000);
    const hit = store.getState().line.strike();
    expect(hit.hit?.grade).toBe("perfect");
    expect(hit.streak).toBe(1);
    expect(store.getState().purse.paid).toBe(5);
    expect(store.getState().line.targets).toHaveLength(3);
    expect(store.getState().line.targets).not.toContainEqual(first);
    // Strike where no target is: find a gap.
    const gaps = store.getState().line.targets.map((t) => t.at);
    const free = [0.02, 0.5, 0.98].find((p) => gaps.every((at) => Math.abs(at - p) > 0.11)) ?? 0.02;
    clock.set(store.getState().line.since + free * 1000);
    expect(store.getState().line.strike()).toMatchObject({ hit: null, streak: 0 });
    expect(store.getState().line).toMatchObject({ strikes: 2, misses: 1, best: 1, hits: { perfect: 1 } });
  });

  test("select reads the setup and the cursor off the game; draft strikes inside a recipe", () => {
    const { store } = freshStore(game, { at: T0, seed: "sweep" });
    const s = store.getState();
    expect(line.select.setup(s)).toMatchObject({ count: 3, width: 0.2 });
    expect(line.select.cursor(s, s.line.since + 500)).toBeCloseTo(0.5);
    expect(line.def.grades).toBe(GRADES);
    const draft = plain({ line: s.line, purse: s.purse });
    expect(line.draft.strike(draft, s.line.since + 100)).toMatchObject({ streak: expect.any(Number) });
    expect(draft.line.strikes).toBe(1);
  });

  test("a callback reads a reached feature; one it does not reach is a type error", () => {
    const other = feature({ key: "other", initial: () => ({ m: 0 }) });
    const peek = sweep({
      key: "peek",
      reach: [purse],
      grades: GRADES,
      setup: (s) => ({
        motion: { periodMs: 1000 },
        count: 1,
        // @ts-expect-error `other` is not in the reach
        width: s.other.m + s.purse.wide,
      }),
    });
    expect(peek.key).toBe("peek");
    expect(other.key).toBe("other");
  });
});
