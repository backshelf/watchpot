import { describe, expect, test } from "bun:test";
import {
  defineGame,
  feature,
  type GaugeState,
  gauge,
  gaugeFill,
  gaugeLocked,
  secondsToTrip,
  stepGauge,
} from "watchpot/core";
import { freshStore, T0 } from "watchpot/test";

const COLD: GaugeState = { level: 0, lockedUntil: 0, trips: 0 };
const RULES = { max: 100, trip: { lockMs: 60_000, dropTo: 0.5 } };

describe("stepGauge", () => {
  test("rises and drains inside its bounds", () => {
    expect(stepGauge(COLD, 10, 3000, 3000, RULES).state.level).toBeCloseTo(30);
    expect(stepGauge({ ...COLD, level: 5 }, -10, 3000, 3000, RULES).state.level).toBe(0);
  });

  test("trips once at the top: locks from the moment it got there, and drops", () => {
    const step = stepGauge({ ...COLD, level: 90 }, 10, 5000, 5000, RULES);
    expect(step.tripped).toBe(true);
    expect(step.state).toEqual({ level: 50, lockedUntil: 1000 + 60_000, trips: 1 });
    expect(gaugeLocked(step.state, 5000)).toBe(true);
    expect(gaugeLocked(step.state, 61_000)).toBe(false);
  });

  test("holds while locked, then moves for the rest of the step", () => {
    const locked: GaugeState = { level: 50, lockedUntil: 2000, trips: 1 };
    const step = stepGauge(locked, 10, 3000, 3000, RULES); // from 0: 2s locked, 1s free
    expect(step.tripped).toBe(false);
    expect(step.state.level).toBeCloseTo(60);
  });

  test("a locked rate drains during the lock", () => {
    const rules = { max: 100, trip: { lockMs: 10_000, dropTo: 1, lockedRate: -5 } };
    const step = stepGauge({ ...COLD, level: 100 }, 1, 4000, 4000, rules);
    expect(step.tripped).toBe(true);
    expect(step.state.level).toBeCloseTo(80);
  });

  test("without a trip the level parks at the top", () => {
    const step = stepGauge({ ...COLD, level: 99 }, 10, 5000, 5000, { max: 100 });
    expect(step).toEqual({ state: { level: 100, lockedUntil: 0, trips: 0 }, tripped: false });
  });

  test("the readers", () => {
    expect(gaugeFill({ level: 25 }, 100)).toBe(0.25);
    expect(secondsToTrip({ level: 40 }, 20, 100)).toBe(3);
    expect(secondsToTrip({ level: 40 }, -1, 100)).toBeNull();
  });
});

interface Knob {
  knob: { hot: boolean; tripsSeen: number };
}

describe("gauge feature", () => {
  const knob = feature({
    key: "knob",
    initial: () => ({ hot: true, tripsSeen: 0 }),
    actions: (api) => ({
      turn: (hot: boolean) =>
        api.set((s) => {
          s.knob.hot = hot;
        }),
    }),
  });
  const heat = gauge({
    key: "heat",
    max: 100,
    trip: { lockMs: 30_000 },
    rate: (s: Knob) => (s.knob.hot ? 10 : -10),
    onTrip: (d: Knob) => {
      d.knob.tripsSeen += 1;
    },
  });
  const game = defineGame({ id: "g", save: { key: "g.save", version: 1 }, features: [knob, heat] });

  test("fills with the tab open, trips, tells the game, and drains over an absence", () => {
    const { store, clock } = freshStore(game);
    const play = (ms: number) => {
      clock.advance(ms);
      store.getState().tick(ms);
    };
    play(5000);
    expect(store.getState().heat.level).toBeCloseTo(50);
    play(6000);
    expect(store.getState().heat.trips).toBe(1);
    expect(store.getState().knob.tripsSeen).toBe(1);
    expect(gaugeLocked(store.getState().heat, clock.now())).toBe(true);
    expect(clock.now()).toBe(T0 + 11_000);

    play(35_000); // 29s locked, 6s rising
    expect(store.getState().heat.level).toBeCloseTo(60);
    const before = store.getState().heat.level;
    clock.advance(1_800_000);
    store.getState().catchUp();
    expect(store.getState().heat.level).toBeLessThan(before);
  });

  test("a nudge to the top trips", () => {
    const { store } = freshStore(game);
    expect(store.getState().heat.nudge(40)).toBe(false);
    expect(store.getState().heat.nudge(70)).toBe(true);
    expect(store.getState().heat.level).toBe(0);
  });

  test("the draft helper trips inside another recipe and tells the game", () => {
    const draft = { heat: { ...COLD, level: 90 }, knob: { hot: true, tripsSeen: 0 } };
    expect(heat.draft.nudge(draft, 5, T0)).toBe(false);
    expect(draft.heat.level).toBe(95);
    expect(heat.draft.nudge(draft, 50, T0)).toBe(true);
    expect(draft.heat.level).toBe(0);
    expect(draft.knob.tripsSeen).toBe(1);
    expect(gaugeLocked(draft.heat, T0 + 29_999)).toBe(true);
    expect(heat.draft.nudge(draft, 500, T0 + 1000)).toBe(false);
    expect(draft.heat.level).toBe(0);
  });

  test("select reads the state against the fixed bounds in def", () => {
    const state = { heat: { ...COLD, level: 25, lockedUntil: T0 + 5000 } };
    expect(heat.def).toEqual({ max: 100, trip: { lockMs: 30_000 } });
    expect(heat.select.fill(state)).toBe(0.25);
    expect(heat.select.locked(state, T0 + 4999)).toBe(true);
    expect(heat.select.locked(state, T0 + 5000)).toBe(false);
    expect(heat.select.secondsToTrip(state, 5)).toBe(15);
    expect(heat.select.secondsToTrip(state, 0)).toBeNull();
  });

  test("`reach` types the callbacks: a reached feature reads, an unreached one does not", () => {
    const reached = gauge({
      key: "steam",
      reach: () => [knob],
      max: 10,
      rate: (s) => (s.knob.hot ? 1 : 0) + s.steam.level,
      onTrip: (d) => {
        d.knob.tripsSeen += 1;
      },
    });
    gauge({
      key: "bad",
      reach: [knob],
      max: 10,
      // @ts-expect-error nothing reached a "moon"
      rate: (s) => s.moon.phase,
    });
    expect(reached.def.max).toBe(10);
  });
});
