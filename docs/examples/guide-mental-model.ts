/**
 * Chapter 3 of the guide, "The mental model": Simmer's pot and stove again, rebuilt here so the file stands on its
 * own, plus a lid that reaches into the stove. It shows a cross-feature `reach`, step phases, a pinned step order,
 * a step limited to one pass, a guard that returns "stop", and `transient` with `derive`.
 *
 * Run it with `bun docs/examples/guide-mental-model.ts`: it plays a few seconds on a fake clock and prints the
 * order each pass runs its steps in.
 */
import {
  costAt,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  D,
  type Decimal,
  defineGame,
  feature,
  fmt,
  resolvedSteps,
  ZERO,
} from "watchpot/core";

// The pot: the bubbles, the tap, and whether the pot is off the heat.
const pot = feature({
  key: "pot",
  initial: () => ({ bubbles: ZERO, lifted: false }),
  actions: (api) => ({
    tap: () =>
      api.set((s) => {
        s.pot.bubbles = s.pot.bubbles.add(1);
      }),
    lift: () =>
      api.set((s) => {
        s.pot.lifted = !s.pot.lifted;
      }),
  }),
  steps: {
    // A pot off the stove does not boil: stop the pass before any work phase runs.
    guard: { lifted: (s) => (s.pot.lifted ? "stop" : undefined) },
  },
});

/** The price of the next burner, as chapter 2 set it: 10 bubbles, 15% more each, rounded up. */
const burnerPrice = (owned: number): Decimal => costAt({ base: 10, growth: 1.15, round: "ceil" }, owned);
const heatOf = (owned: number): Decimal => D(owned);

/** How much of an absence the stove pays for, and for how long at most. */
const OFFLINE_RATE = 0.5;
const AWAY_CAP_MS = 2 * 60 * 60 * 1000;

// The stove reaches the pot: its draft sees `s.pot` as well as `s.stove`.
const stove = feature({
  key: "stove",
  reach: [pot],
  initial: () => ({ burners: 0, perSecond: ZERO }),
  transient: ["perSecond"],
  derive: (s) => {
    s.stove.perSecond = heatOf(s.stove.burners);
  },
  actions: (api) => ({
    buyBurner: (): boolean => {
      let bought = false;
      api.set((s) => {
        const cost = burnerPrice(s.stove.burners);
        if (s.pot.bubbles.lt(cost)) return;
        s.pot.bubbles = s.pot.bubbles.sub(cost);
        s.stove.burners += 1;
        bought = true;
      });
      return bought;
    },
  }),
  steps: {
    // Both passes: the rate is worked out before anything is paid.
    rates: {
      heat: (s) => {
        s.stove.perSecond = heatOf(s.stove.burners);
      },
    },
    produce: {
      // Live play pays in full.
      boil: {
        pass: "tick",
        run: (s, ctx) => {
          s.pot.bubbles = s.pot.bubbles.add(s.stove.perSecond.mul(ctx.dtMs / 1000));
        },
      },
      // Time away pays half, for two hours at most.
      away: {
        pass: "catchUp",
        run: (s, ctx) => {
          const credited = Math.min(ctx.dtMs, AWAY_CAP_MS) * OFFLINE_RATE;
          s.pot.bubbles = s.pot.bubbles.add(s.stove.perSecond.mul(credited / 1000));
        },
      },
    },
  },
});

// The lid reaches the stove: with the lid on, the stove's rate doubles.
const lid = feature({
  key: "lid",
  reach: [stove],
  initial: () => ({ on: false }),
  derive: (s) => {
    if (s.lid.on) s.stove.perSecond = s.stove.perSecond.mul(2);
  },
  actions: (api) => ({
    toggle: () =>
      api.set((s) => {
        s.lid.on = !s.lid.on;
      }),
  }),
  steps: {
    rates: {
      trap: (s) => {
        if (s.lid.on) s.stove.perSecond = s.stove.perSecond.mul(2);
      },
    },
  },
});

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  features: [pot, stove, lid],
  // The lid's doubling must land after the stove sets the rate. Pinned here, it holds whatever the list order.
  order: { rates: ["stove.rates.heat", "lid.rates.trap"] },
});

if (import.meta.main) {
  let wall = 1_000_000;
  const store = createIdleStore(game, {
    now: () => wall,
    storage: createGameStorage(createMemoryBackend(), { durable: false }),
  });
  const play = store.getState;

  play().catchUp(); // the first catch-up: no gap yet, so nothing is paid
  for (let i = 0; i < 10; i++) play().pot.tap();
  console.log("bought a burner:", play().stove.buyBurner()); // true: 10 bubbles spent
  play().lid.toggle();

  wall += 1000;
  play().tick(1000); // one second live: 1 burner, doubled by the lid
  console.log("after a second:", fmt(play().pot.bubbles).text);

  wall += 60_000;
  play().catchUp(); // a minute away, paid at half rate
  console.log("after a minute away:", fmt(play().pot.bubbles).text);

  console.log("tick:", resolvedSteps(game, "tick").join(", "));
  console.log("catchUp:", resolvedSteps(game, "catchUp").join(", "));
}
