import {
  catchUp,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  D,
  defineGame,
  feature,
  HOUR_MS,
} from "watchpot/core";
import { wallet } from "./add-a-currency";
import { TOY } from "./vocab";

export const generatorCost = (owned: number) => D(10).mul(D(1.15).pow(owned));

/**
 * A generator: owned count, a rate derived each tick, income on a tick and a capped, discounted payout for the
 * time the tab was closed. Phases run in order: `rates` before `produce`.
 */
export const generator = feature({
  key: "generator",
  reach: [wallet], // it touches the wallet's slice, so it names it
  initial: () => ({ owned: 1, perSecond: D(1) }),
  actions: (api) => ({
    buy: (): boolean => {
      let ok = false;
      api.set((s) => {
        const cost = generatorCost(s.generator.owned);
        if (!wallet.debit(s, "gold", cost)) return;
        s.generator.owned += 1;
        ok = true;
      });
      return ok;
    },
  }),
  steps: {
    rates: {
      perSecond: (s) => {
        s.generator.perSecond = D(s.generator.owned);
      },
    },
    produce: {
      income: {
        pass: "tick",
        run: (s, ctx) => wallet.credit(s, "gold", s.generator.perSecond.mul(ctx.dtMs / 1000)),
      },
      offline: {
        pass: "catchUp",
        // Half rate, at most an hour: `catchUp` turns the gap into credited time.
        run: (s, ctx) =>
          wallet.credit(
            s,
            "gold",
            s.generator.perSecond.mul(catchUp(ctx.dtMs, 0.5, HOUR_MS).creditedMs / 1000),
          ),
      },
    },
  },
  // `moves` tells the sim's auto-player what a player could do now (see the persona recipe).
  moves: (s) => [
    {
      id: "buy-generator",
      cost: { currency: "gold", amount: generatorCost(s.generator.owned) },
      value: () => 1,
      apply: (store) => store.getState().generator.buy(),
    },
  ],
});

export const game = defineGame({
  id: "generator",
  save: { key: "generator.save", version: 1 },
  features: [wallet, generator],
  vocab: TOY,
});

if (import.meta.main) {
  let wall = Date.UTC(2026, 0, 1);
  const store = createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
    now: () => wall,
  });
  store.getState().catchUp(wall);
  wall += 60_000;
  store.getState().tick(60_000, wall);
  console.log(
    "after a minute:",
    store.getState().wallet.gold.toString(),
    "gold; buy:",
    store.getState().generator.buy(),
  );
  wall += 3 * HOUR_MS;
  store.getState().catchUp(wall); // away three hours: half rate, one hour's cap
  console.log("after 3h away:", store.getState().wallet.gold.toFixed(0));
}
