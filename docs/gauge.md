# Gauges

A gauge is one number between 0 and a `max` that a rate fills or drains over time. It is the risk meter of a
push-your-luck loop: heat that climbs while you play hard, pressure, strain. Give it a `trip` and reaching the top
trips it: the gauge locks for a while and the level drops, and what a lock means (no income, a shut shop, a flame
out) is your game's to decide. Leave the trip out and it is a plain bounded meter (steam, fill, stamina) that holds
at the top. Both are supported uses.

The level moves on game time in the tick, and over an absence at a separate, gentler rate, so a player who comes back
finds a cool gauge rather than one that blew while they were away.

Example: [`examples/gauge.ts`](examples/gauge.ts) (`bun docs/examples/gauge.ts`). A kettle's pressure climbs while
the flame is lit and blows at the top, a vent lets it out, and a whistle is a meter with no trip:

<!-- example-code: gauge.ts -->

```ts
import {
  type BuffsState,
  buffActive,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineBuffs,
  defineFeature,
  defineGame,
  defineGauge,
  fmt,
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
export const boosts = defineBuffs({
  key: "boosts",
  list: [{ id: "vent", durationMs: 10_000, stack: "refresh" }],
});

/** The pressure: it climbs while the flame is lit and blows at the top, which puts the flame out. */
export const pressure = defineGauge({
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
export const whistle = defineGauge({
  key: "whistle",
  max: 1,
  rate: (s: Reads) => (s.kettle.lit ? 0.1 : -0.2),
});

/** The kettle: a tap that pumps the pressure, and a pour that pays more the higher it is and nothing after it blows. */
export const kettle = defineFeature({
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
```

Run it and the kettle climbs to 80 with ten taps, blows a few seconds later (the flame goes out, the level drops to
25 and the lock holds it there), and cools once the lock is over:

<!-- example-output: gauge.ts -->

```
after 10 taps: pressure 80 | blows in 6.666666666666667 s
10 s later: pressure 25 | trips 1 | locked true | lit false | a tap now trips? false
30 s on: pressure 8.3 | cups 27
relit and vented for 3 s: pressure 0.0 | whistle 0.30
kernel: 95 + 10 → level 25 | tripped true | locked for 30000 ms
```

## The factory

**`defineGauge({ key, reach?, max, rate, trip?, awayRate?, onTrip?, reset? })`** saves a `GaugeState` under `key`:
`{ level, lockedUntil, trips }`. `lockedUntil` is the game time the lock ends (0 when it never tripped), and `trips`
counts every trip since the gauge last started over.

- **`max`**: the top. The level is clamped to 0 and `max` on every move.
- **`rate(state, { now })`**: the level's change per second while the tab is open, read off the whole game state.
  Positive fills, negative drains. The second argument is the callback context (`CallbackContext`, from
  `watchpot/core`): `now` is the game time of the pass, so a rate can ask whether a buff or a lock is running where it
  applies, as the vent does above.
- **`awayRate(state, { now })`**: the same over a catch-up. Leave it out and the gauge drains at `max` per hour, so an
  absence cools it and never trips it. Give one that rises and an absence can trip it.
- **`trip: { lockMs, dropTo?, lockedRate? }`**: what reaching the top does. The gauge locks for `lockMs`, the level
  drops to `dropTo × max` (default 0), and while locked it moves at `lockedRate` a second (default 0: it holds).
  Without a `trip`, the level just parks at `max`.
- **`onTrip(draft, now)`**: runs in the same recipe as the trip, so it can change the rest of the game at that moment
  (put the flame out, start a cooldown buff, write a journal line).
- **`reset`**: a run reset starts the gauge over (level 0, unlocked) unless you say otherwise. A gauge that should
  survive a prestige says `reset: "never"`.
- **`reach`**: the features the callbacks read (`reach: () => [kitchen]`, as on `feature`), so `rate`, `awayRate` and
  `onTrip` see their state without an annotation.

The feature carries `select`, `def` and `draft`, and nothing else:

- **`pressure.def`** is `{ max, trip }`, the fixed bounds, for the kernel and the readers below.
- **`pressure.select`** asks the game state, state first: `locked(state, now)`, `fill(state)` and `secondsToTrip(state, perSecond)`, the three readers below with the feature's own slice and `max` filled in.
- **`pressure.draft.nudge(draft, amount, now)`** is the draft helper: the `nudge` action inside a recipe of yours. It clamps, trips
  and runs `onTrip` exactly as the action does, and returns whether it tripped. This is how a press that warms the
  gauge belongs inside the press's own recipe (a clicker's `onClick`, a buy that costs heat).

## The action

- **`nudge(amount)`** moves the level by `amount` at once, clamped. A rise to the top trips it, the lock starting now.
  It returns whether it tripped. A locked gauge does not move, either way: a nudge on a locked gauge returns false and
  changes nothing.

Call the action from a handler. Inside a recipe (an `api.set`, a step, another feature's callback) call
`pressure.draft.nudge(draft, amount, now)` instead: an action called inside a recipe throws, telling you so.

## The step

Its step is `<key>.rates.level`, in the `rates` phase, before `produce`. Every income step therefore already sees this
pass's lock, as `pour` does with `gaugeLocked(d.pressure, ctx.now)`. A pass with no time (`dtMs` 0) moves nothing.

On a live tick the step reads `rate`; on a catch-up it reads `awayRate`. Either way the rate is read **once per step
and held across it**. A live tick steps at most `MAX_STEP_MS` (one second; the clock slices a longer frame), and an
absence is one step. So a rate that depends on the level itself (it climbs faster the hotter it is) is only as fine
as the step: smooth live, one coarse value over an absence.

Inside a step the kernel is exact about time: when the level reaches the top partway through, the lock starts at the
moment it got there, not at the end of the step, and the rest of the step runs locked.

## The kernel and the readers

All pure, for a screen, a test, or a gauge you keep yourself:

- **`stepGauge(state, perSecond, dtMs, now, { max, trip? })`** moves a state over `dtMs` ending at `now`, returning
  `{ state, tripped }`. The part of the step inside an earlier lock moves at `lockedRate`; the rest at `perSecond`.
- **`nudgeGauge(state, amount, now, rules)`** is the nudge: the same clamp and trip, the lock starting at `now`; a
  locked state comes back unchanged.
- **`gaugeFill(state, max)`**: the level as 0 to 1, for a bar or a shader uniform.
- **`gaugeLocked(state, now)`**: whether the lock is still running.
- **`secondsToTrip(state, perSecond, max)`**: how long until the top at that rate, or null when it is not rising. A
  screen shows it as a warning.

## Sim and tuning

A gauge offers the auto-player no moves of its own. What warms it is usually a press, and the press is the clicker's
move, so the sim plays the gauge through whatever feature nudges it.

The sim world ticks in minutes (`SIM_TICK_MS`), so in a sim run a live rate is held for a whole minute. A gauge that
trips within a minute of warming trips at the right moment (the kernel finds it inside the step), but a rate that
reads the level jumps in minute-sized stairs. Pass `tickMs` to `createSimWorld` when that matters.

Tuning numbers to work out on paper before you play:

- From empty, the first trip comes after `max / warming` seconds of steady warming; after a trip, every next one comes
  `(1 - dropTo) × max / warming` seconds after the lock ends. The kettle's pressure: 100 / 3, about 33 s from
  cold, then 25 s.
- The share of time spent locked, under steady warming, is `lockMs / (lockMs + time to trip)`. A lock as long as the
  climb takes half the player's time away.
- `dropTo` is the punishment's depth. 0 is a full reset of the meter; 0.5 makes the next trip come quickly.

## Things that bite

- **Writing the level by hand skips the trip.** `d.pressure.level += 8` inside a recipe clamps nothing and never trips,
  never locks and never runs `onTrip`. Use `pressure.draft.nudge(draft, amount, now)`.
- **`onTrip`'s `now` is the pass's, not the trip's.** The kernel starts the lock at the exact moment the top was
  reached inside the step; `onTrip` is handed the pass's `now`. The moment of the trip is `lockedUntil - lockMs`.
- **One trip per step, and nothing after its lock.** A step trips at most once, and the part of the step after the
  lock would have ended is not stepped. Live, steps are a second long and locks longer, so this never shows; over an
  absence with a rising `awayRate` it means one trip and then a gauge that sits.
- **A locked gauge ignores nudges both ways.** You cannot cool a locked gauge with `nudge(-10)`. Give the trip a
  negative `lockedRate` to cool it while locked, or wait for the lock to end.
- **A test that ticks an hour steps once.** `store.tick(HOUR_MS)` (or `freshStore`'s `play(HOUR_MS)`) is one step,
  so the rate is read once for the hour. Tick in seconds when a test is about a rate that changes.
- **Pass real game times to the kernel.** `nudgeGauge` models a nudge as a one-second step ending at `now`, so at a
  `now` under 1000 it reads its own step as still inside a lock and moves nothing. A store's game time is always far
  past that; a hand-written kernel test that starts at 0 is not.
- **`def` holds only the bounds.** A gauge's `def` is `{ max, trip }`; its readers are `select`
  (state first) and the free functions above, which take the slice.

## Where the guide teaches it

- [Chapter 6, The first page](guide/06-the-first-page.md#the-meter-gauge): the foam on Simmer's pot, raised by
  each stir through `foam.draft.nudge`, and the printhead heat of VOID IF REMOVED.
- [Chapter 11, Look and sound](guide/11-look-and-sound.md): a gauge level as a 0 to 1 number for a shader.
- API: [`api/core/gauge.d.ts`](../api/core/gauge.d.ts).
