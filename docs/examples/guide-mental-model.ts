/**
 * Chapter 3 of the guide, "The mental model": Simmer from chapter 2 grows a lid. The pot and the burner's price are
 * chapter 2's, imported from `./simmer/game`; the stove changes shape (its price and rate worked out from its state, a
 * switch that stops the pass, live play and time away paid apart), and a small stats feature serves the heat its rate
 * reads, which the lid doubles. It shows a lazy cross-feature `reach`, derived values (one reading another), a first stat,
 * step phases, a step limited to one pass and a guard that returns "stop".
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
  defineStats,
  feature,
  fmt,
  resolvedSteps,
  vocab,
} from "watchpot/core";
import { BURNER_PER_SECOND, burnerPrice, pot } from "./simmer/game";

/** How much of an absence the stove pays for, and for how long at most. */
export const OFFLINE_RATE = 0.5;
export const AWAY_CAP_MS = 2 * 60 * 60 * 1000;

/** The stove's own rate, in bubbles a second, before anything multiplies it. */
export const flameOf = (burners: number) => D(burners * BURNER_PER_SECOND);

/** The game's words: chapter 4 is about them. For now they name the one stat, `heat`. */
export const WORDS = vocab({ currencies: ["bubbles"], stats: ["heat"] });

/** The stove: its burners, a switch, the price of the next burner and the rate they burn at. */
export const stove = feature({
  key: "stove",
  // A function, so it may name the stats, which are declared further down.
  reach: () => [pot, stats],
  initial: () => ({ burners: 0, off: false }),
  derived: [
    {
      // The price of the next burner, worked out from how many are lit. Never saved.
      nextPrice: (s) => burnerPrice(s.stove.burners),
      // The burners' flame, times heat: the one number every multiplier on the stove goes into.
      perSecond: (s) => flameOf(s.stove.burners).mul(s.stats.heat),
    },
    // A second layer sees the first: whether the pot holds enough for the next burner.
    { canBuy: (s) => s.pot.bubbles.gte(s.stove.nextPrice) },
  ],
  actions: (api) => ({
    buyBurner: () =>
      api.set((s) => {
        if (!s.stove.canBuy) return false;
        s.pot.bubbles = s.pot.bubbles.sub(s.stove.nextPrice);
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

/** The lid: on or off. It knows nothing of the stove; the heat counts it. */
export const lid = feature({
  key: "lid",
  initial: () => ({ on: false }),
  actions: (api) => ({
    toggle: () =>
      api.set((s) => {
        s.lid.on = !s.lid.on;
      }),
  }),
});

/** The stats: `s.stats.heat`, a base of 1 and every source multiplied in. So far the one source is the lid. */
export const stats = defineStats({
  key: "stats",
  vocab: WORDS,
  reach: [lid],
  stats: { heat: { base: 1 } },
  sources: [{ label: "The lid", owner: "lid", active: (q) => q.lid.on, effects: [{ stat: "heat", mul: 2 }] }],
});

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [pot, stove, lid, stats],
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
  console.log("the next one costs:", fmt(play().stove.nextPrice).text); // 12: worked out from one burner lit
  console.log("can buy it:", play().stove.canBuy); // false: the pot is empty
  play().lid.toggle();
  console.log("heat:", fmt(play().stats.heat).text); // 2: the lid doubles it
  console.log("the stove's rate:", fmt(play().stove.perSecond).text); // 2: one burner at double heat

  wall += 1000;
  play().tick(1000); // one second live: the pot's 1, plus the stove's 2
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
