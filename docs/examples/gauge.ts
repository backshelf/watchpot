import {
  type BuffsState,
  buffActive,
  buffs,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineGame,
  feature,
  fmt,
  gauge,
  gaugeFill,
  gaugeLocked,
  nudgeGauge,
  secondsToTrip,
  ZERO,
} from "watchpot/core";

/** A kettle on a flame, whose pressure can blow. */
export const PRESSURE = { max: 100, perTap: 8, rising: 3, falling: 5, venting: 10 };

/** What the pressure's rate reads: whether the flame is lit, and the vent (a timer buff with no effects). */
type Reads = { kettle: { lit: boolean }; boosts: BuffsState };

/** Opening the vent lets pressure out for ten seconds. No `effects`: it is a timer the pressure's rate reads. */
export const boosts = buffs({ key: "boosts", list: [{ id: "vent", durationMs: 10_000, stack: "refresh" }] });

/** The pressure: it climbs while the flame is lit and blows at the top, which puts the flame out. */
export const pressure = gauge({
  key: "pressure",
  max: PRESSURE.max,
  trip: { lockMs: 30_000, dropTo: 0.25 }, // 30 s to recover, back at a quarter
  rate: (s: Reads, { now }) => {
    if (buffActive(s.boosts, "vent", now)) return -PRESSURE.venting;
    return s.kettle.lit ? PRESSURE.rising : -PRESSURE.falling;
  },
  onTrip: (d) => {
    d.kettle.lit = false;
  },
});

/** A meter with no trip: the whistle's volume, 0 to 1, for the page to draw. It holds at the top. */
export const whistle = gauge({
  key: "whistle",
  max: 1,
  rate: (s: Reads) => (s.kettle.lit ? 0.1 : -0.2),
});

/** The kettle: a tap that pumps the pressure, and a pour that pays more the higher it is and nothing after it blows. */
export const kettle = feature({
  key: "kettle",
  reach: [pressure, boosts],
  initial: () => ({ cups: ZERO, lit: true }),
  actions: (api) => ({
    /** One cup, and the pressure rises. Returns whether this tap blew it. */
    tap: () =>
      api.set((d) => {
        d.kettle.cups = d.kettle.cups.add(1);
        return pressure.draft.nudge(d, PRESSURE.perTap, api.now());
      }),
    light: () =>
      api.set((d) => {
        d.kettle.lit = true;
      }),
  }),
  steps: {
    produce: {
      pour: {
        pass: "both",
        run: (d, ctx) => {
          if (gaugeLocked(d.pressure, ctx.now)) return;
          const perSecond = 1 + gaugeFill(d.pressure, PRESSURE.max); // up to twice at full pressure
          d.kettle.cups = d.kettle.cups.add((perSecond * ctx.dtMs) / 1000);
        },
      },
    },
  },
});

export const game = defineGame({
  id: "kettle",
  save: { key: "kettle.save", version: 1 },
  features: [boosts, pressure, whistle, kettle],
});

/** The kernel alone, pure: a nudge from 95 by 10 trips the pressure at `now`, and the lock runs from then. */
export const kernelTrip = (now: number) =>
  nudgeGauge({ level: 95, lockedUntil: 0, trips: 0 }, 10, now, pressure.def);

if (import.meta.main) {
  let wall = Date.UTC(2026, 0, 1);
  const store = createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
    now: () => wall,
  });
  store.getState().catchUp(wall);
  const second = () => {
    wall += 1000;
    store.getState().tick(1000, wall);
  };

  for (let i = 0; i < 10; i++) store.getState().kettle.tap();
  const s = store.getState();
  console.log(
    "after 10 taps: pressure",
    s.pressure.level,
    "| blows in",
    secondsToTrip(s.pressure, PRESSURE.rising, PRESSURE.max),
    "s",
  );

  for (let i = 0; i < 10; i++) second();
  const after = store.getState();
  console.log(
    "10 s later: pressure",
    after.pressure.level,
    "| trips",
    after.pressure.trips,
    "| locked",
    gaugeLocked(after.pressure, wall),
    "| lit",
    after.kettle.lit,
    "| a tap now trips?",
    after.kettle.tap(),
  );

  for (let i = 0; i < 30; i++) second();
  const cooled = store.getState();
  console.log("30 s on: pressure", cooled.pressure.level.toFixed(1), "| cups", fmt(cooled.kettle.cups).text);

  store.getState().kettle.light();
  store.getState().boosts.start("vent");
  for (let i = 0; i < 3; i++) second();
  const vented = store.getState();
  console.log(
    "relit and vented for 3 s: pressure",
    vented.pressure.level.toFixed(1),
    "| whistle",
    vented.whistle.level.toFixed(2),
  );

  const trip = kernelTrip(wall);
  console.log(
    "kernel: 95 + 10 → level",
    trip.state.level,
    "| tripped",
    trip.tripped,
    "| locked for",
    trip.state.lockedUntil - wall,
    "ms",
  );
}
