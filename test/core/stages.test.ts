import { describe, expect, test } from "bun:test";
import {
  advanceTrack,
  D,
  defineGame,
  feature,
  passable,
  resistanceAt,
  type StageTrack,
  secondsToClear,
  stages,
  type TrackState,
  trackFill,
  ZERO,
} from "watchpot/core";
import { freshStore, T0 } from "watchpot/test";

const START: TrackState = { stage: 0, worn: ZERO, best: 0 };
/** 10, 20, 40, 80, ... and every fourth stage five times as hard. */
const ROAD: StageTrack = { id: "road", resistance: { base: 10, growth: 2 }, boss: { every: 4, mult: 5 } };

describe("advanceTrack", () => {
  test("resistance climbs, and a boss stands on every nth stage", () => {
    expect(resistanceAt(ROAD, 0).toNumber()).toBe(10);
    expect(resistanceAt(ROAD, 2).toNumber()).toBe(40);
    expect(resistanceAt(ROAD, 3).toNumber()).toBeCloseTo(400);
    expect(resistanceAt({ id: "f", resistance: (n) => (n + 1) * 7 }, 2).toNumber()).toBe(21);
  });

  test("one long step clears what many short ones do", () => {
    const long = advanceTrack(START, 5, 20_000, ROAD); // 100 of force: 10 + 20 + 40, then 30 into the boss
    expect(long.cleared).toBe(3);
    expect(long.state).toMatchObject({ stage: 3, best: 3 });
    expect(long.state.worn.toNumber()).toBeCloseTo(30);
    let s = START;
    let cleared = 0;
    for (let i = 0; i < 200; i++) {
      const step = advanceTrack(s, 5, 100, ROAD);
      s = step.state;
      cleared += step.cleared;
    }
    expect(cleared).toBe(3);
    expect(s.worn.toNumber()).toBeCloseTo(30);
    expect(trackFill(ROAD, s)).toBeCloseTo(30 / 400);
    expect(secondsToClear(ROAD, s, 5)).toBeCloseTo(74);
  });

  test("with a time limit a stage the force cannot fell in time is a wall, not a wait", () => {
    const timed: StageTrack = { ...ROAD, limitMs: 10_000 };
    // 5 a second fells up to 50 in the limit: stages 0, 1 and 2 (40) fall, the boss (400) stands.
    const step = advanceTrack(START, 5, 3_600_000, timed);
    expect(step.state).toMatchObject({ stage: 3, best: 3 });
    expect(step.state.worn.toNumber()).toBe(0);
    expect(passable(timed, step.state, 5)).toBe(false);
    expect(passable(timed, step.state, 40)).toBe(true);
    expect(secondsToClear(timed, step.state, 5)).toBeNull();
  });

  test("a track ends at its length", () => {
    const short: StageTrack = { id: "s", resistance: { base: 1, growth: 1 }, length: 3 };
    const step = advanceTrack(START, 100, 60_000, short);
    expect(step.cleared).toBe(3);
    expect(trackFill(short, step.state)).toBe(1);
  });
});

describe("stages feature", () => {
  const army = feature({ key: "army", initial: () => ({ force: 5, loot: 0, unlocked: false }) });
  const front = stages({
    reach: [army],
    key: "front",
    tracks: [ROAD, { id: "side", resistance: { base: 1, growth: 10 } }],
    force: (s) => s.army.force,
    open: (s, t) => t.id === "road" || s.army.unlocked,
    onClear: (d, _track, from, to) => {
      d.army.loot += to - from;
    },
  });
  const game = defineGame({
    id: "fronts",
    save: { key: "fronts.save", version: 1 },
    features: [army, front],
  });

  test("an open track is worn each pass, a closed one stands, and a cleared stage pays", () => {
    const { store } = freshStore(game, { at: T0 });
    store.getState().tick(20_000, T0 + 20_000);
    const s = store.getState();
    expect(s.front.tracks.road).toMatchObject({ stage: 3, best: 3 });
    expect(s.front.tracks.side).toMatchObject({ stage: 0 });
    expect(s.army.loot).toBe(3);
    expect(front.select.fill(s, "road")).toBeCloseTo(30 / 400);
    expect(front.select.force(s, "road").eq(D(5))).toBe(true);
    // Back to an earlier stage, never past the furthest.
    expect(s.front.enter("road", 1)).toBe(true);
    expect(store.getState().front.enter("road", 9)).toBe(false);
    expect(store.getState().front.tracks.road).toMatchObject({ stage: 1, best: 3 });
  });

  test("select asks the state, def holds the tracks and the resistance, draft is empty", () => {
    const { store } = freshStore(game, { at: T0 });
    const s = store.getState();
    expect(front.select.passable(s, "road")).toBe(true);
    expect(front.select.ended(s, "road")).toBe(false);
    expect(front.select.ended(s, "nowhere")).toBe(true);
    expect(front.select.secondsToClear(s, "road")).toBe(2);
    expect(front.def.tracks.map((t) => t.id)).toEqual(["road", "side"]);
    expect(front.def.track("side")?.id).toBe("side");
    expect(front.def.resistance("road", 0).toNumber()).toBe(10);
    expect(front.def.resistance("nowhere", 0).toNumber()).toBe(0);
    expect(front.draft).toEqual({});
  });

  test("`reach` types the callbacks: a reached feature reads, an unreached one does not", () => {
    stages({
      key: "bad",
      reach: [army],
      tracks: [],
      // @ts-expect-error nothing reached a "moon"
      force: (s) => s.moon.phase,
    });
  });
});
