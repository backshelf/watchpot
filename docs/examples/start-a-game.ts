import { createIdleStore, D, defineFeature, defineGame, startGameClock } from "watchpot/core";

/** One feature: a wallet with one action. Its state, its actions and its tick steps are all declared here. */
const wallet = defineFeature({
  key: "wallet",
  initial: () => ({ gold: D(10) }),
  actions: (api) => ({
    earn: (amount: number) =>
      api.set((s) => {
        s.wallet.gold = s.wallet.gold.add(amount);
      }),
  }),
  steps: {
    produce: {
      // Runs on every tick and every catch-up: one gold a second.
      income: {
        pass: "both",
        run: (s, ctx) => {
          s.wallet.gold = s.wallet.gold.add(ctx.dtMs / 1000);
        },
      },
    },
  },
});

/** The game lists its features and says where it saves. Bump `version` with a migration when a saved shape changes. */
export const game = defineGame({ id: "start", save: { key: "start.save", version: 1 }, features: [wallet] });

/**
 * The store. `now` is the one wall read the game makes: pass `Date.now` here and nowhere else. With no `storage`,
 * the store saves to localStorage, or to memory (and says it is not keeping anything) where there is none.
 */
export function buildStore(now: () => number = Date.now) {
  return createIdleStore(game, { now });
}

/** Boot: one catch-up for the time away, then a clock ticking on an interval. Returns the clock's stop. */
export function boot(store: ReturnType<typeof buildStore>) {
  return startGameClock(store);
}

if (import.meta.main) {
  let wall = Date.UTC(2026, 0, 1);
  const store = buildStore(() => wall);
  store.getState().catchUp(wall);
  wall += 5_000;
  store.getState().tick(5_000, wall);
  store.getState().wallet.earn(1);
  console.log("gold:", store.getState().wallet.gold.toString());
}
