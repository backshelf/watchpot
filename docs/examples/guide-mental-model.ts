/**
 * Chapter 3 of the guide, "The mental model": Simmer from chapter 2 grows a lid. The pot and the burner's price are
 * chapter 2's, imported from `./simmer/game`; the stove changes shape (a rate worked out in `rates`, a switch that
 * stops the pass, live play and time away paid apart), and the lid reaches into it. It shows a cross-feature
 * `reach`, step phases, a pinned step order, a step limited to one pass, a guard that returns "stop", and
 * `transient` with `derive`.
 *
 * Run it with `bun docs/examples/guide-mental-model.ts`: it plays a few seconds on a fake clock and prints the
 * order each pass runs its steps in.
 */
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  D,
  defineGame,
  feature,
  fmt,
  resolvedSteps,
  ZERO,
} from "watchpot/core";
import { BURNER_PER_SECOND, burnerPrice, pot } from "./simmer/game";

/** How much of an absence the stove pays for, and for how long at most. */
export const OFFLINE_RATE = 0.5;
export const AWAY_CAP_MS = 2 * 60 * 60 * 1000;

/** The stove's own rate, in bubbles a second, before anything multiplies it. */
export const flameOf = (burners: number) => D(burners * BURNER_PER_SECOND);

/** The stove: its burners, a switch, and the rate they burn at, worked out on every pass. */
export const stove = feature({
  key: "stove",
  reach: [pot],
  initial: () => ({ burners: 0, off: false, perSecond: ZERO }),
  transient: ["perSecond"],
  derive: (s) => {
    s.stove.perSecond = flameOf(s.stove.burners);
  },
  actions: (api) => ({
    buyBurner: () =>
      api.set((s) => {
        const price = burnerPrice(s.stove.burners);
        if (s.pot.bubbles.lt(price)) return false;
        s.pot.bubbles = s.pot.bubbles.sub(price);
        s.stove.burners += 1;
        return true;
      }),
    toggle: () =>
      api.set((s) => {
        s.stove.off = !s.stove.off;
      }),
  }),
  steps: {
    // A stove that is off heats nothing: stop the pass before any work phase runs.
    guard: { cold: (s) => (s.stove.off ? "stop" : undefined) },
    // Both passes: the rate is worked out before anything is paid.
    rates: {
      flame: (s) => {
        s.stove.perSecond = flameOf(s.stove.burners);
      },
    },
    produce: {
      // Live play pays in full.
      burn: {
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

/** The lid: with it on, the stove works twice as hard. */
export const lid = feature({
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
  order: { rates: ["stove.rates.flame", "lid.rates.trap"] },
});

if (import.meta.main) {
  let wall = 1_000_000;
  const store = createIdleStore(game, {
    now: () => wall,
    storage: createGameStorage(createMemoryBackend()),
  });
  const play = store.getState;

  play().catchUp(); // the first catch-up: no gap yet, so nothing is paid
  for (let i = 0; i < 10; i++) play().pot.tap();
  console.log("bought a burner:", play().stove.buyBurner()); // true: 10 bubbles spent
  play().lid.toggle();

  wall += 1000;
  play().tick(1000); // one second live: the pot's 1, plus 1 burner doubled by the lid
  console.log("after a second:", fmt(play().pot.bubbles).text);

  wall += 60_000;
  play().catchUp(); // a minute away: the pot's simmer in full, the stove at half rate
  console.log("after a minute away:", fmt(play().pot.bubbles).text);

  play().stove.toggle(); // the stove off: the guard stops every pass
  wall += 1000;
  play().tick(1000);
  console.log("a second with the stove off:", fmt(play().pot.bubbles).text);

  console.log("tick:", resolvedSteps(game, "tick").join(", "));
  console.log("catchUp:", resolvedSteps(game, "catchUp").join(", "));
}
