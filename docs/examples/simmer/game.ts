import { costAt, createIdleStore, D, defineGame, feature, ZERO } from "watchpot/core";

/** Bubbles a second the pot makes on its own, and each burner adds. */
export const SIMMER_PER_SECOND = 1;
export const BURNER_PER_SECOND = 1;

/** What the whole stove makes a second with `burners` lit. */
export function perSecond(burners: number): number {
  return SIMMER_PER_SECOND + burners * BURNER_PER_SECOND;
}

/** The pot: the bubbles you have, the tap that makes one, and the simmer that makes them over time. */
export const pot = feature({
  key: "pot",
  initial: () => ({ bubbles: ZERO }),
  actions: (api) => ({
    tap: () =>
      api.set((s) => {
        s.pot.bubbles = s.pot.bubbles.add(1);
      }),
  }),
  steps: {
    produce: {
      // Runs on every live tick and on the catch-up after time away.
      simmer: (s, ctx) => {
        s.pot.bubbles = s.pot.bubbles.add((SIMMER_PER_SECOND * ctx.dtMs) / 1000);
      },
    },
  },
});

/** The first burner costs 10 bubbles; each one after costs 15% more than the last, rounded up to whole bubbles. */
export const BURNER_COST = { base: 10, growth: 1.15, round: "ceil" } as const;

/** The price of the next burner when `owned` are lit. */
export function burnerPrice(owned: number) {
  return costAt(BURNER_COST, owned);
}

/** The stove: how many burners are lit, buying one, and the bubbles they make. */
export const stove = feature({
  key: "stove",
  reach: [pot],
  initial: () => ({ burners: 0 }),
  actions: (api) => ({
    // `api.set` hands back what the recipe returns, so the action says whether it bought.
    buyBurner: () =>
      api.set((s) => {
        const price = burnerPrice(s.stove.burners);
        if (s.pot.bubbles.lt(price)) return false;
        s.pot.bubbles = s.pot.bubbles.sub(price);
        s.stove.burners += 1;
        return true;
      }),
  }),
  steps: {
    produce: {
      burn: (s, ctx) => {
        const made = D(s.stove.burners * BURNER_PER_SECOND).mul(ctx.dtMs / 1000);
        s.pot.bubbles = s.pot.bubbles.add(made);
      },
    },
  },
});

/** The game: its features, and where and at which version it saves. */
export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  features: [pot, stove],
});

/** The store the page reads. `now` is the one place the game reads the wall clock. */
export const store = createIdleStore(game, { now: Date.now });
