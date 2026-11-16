import { autobuyers, type Decimal, defineGame, generators } from "watchpot/core";
import { wallet } from "./add-a-currency";
import { TOY } from "./vocab";

const stalls = generators({
  key: "stalls",
  wallet,
  list: [{ id: "stall", cost: { base: 10, growth: 1.15 }, pays: "gold", makes: "gold", rate: 1, free: 1 }],
});
type State = { wallet: { gold: Decimal; gems: Decimal }; stalls: { owned: Record<string, number> } };

/** Two autobuyers: one stall every few seconds once ten are owned, and a gem sink every tick. */
export const auto = autobuyers({
  key: "auto",
  list: [
    {
      id: "stall",
      unlocked: (s: State) => (s.stalls.owned.stall ?? 0) >= 10,
      intervalMs: (s) => (s.wallet.gems.gte(5) ? 1000 : 5000), // faster once the game says so
      run: (d) => stalls.buy(d, "stall"), // the generators' draft helper: how many it bought
      priority: 1, // fires before the gem sink in the same tick
    },
    {
      id: "gems",
      unlocked: (s) => s.wallet.gold.gte(1e6),
      intervalMs: () => 0, // every tick
      run: (d) => {
        if (!wallet.debit(d, "gold", 1000)) return 0;
        wallet.credit(d, "gems", 1);
        return 1;
      },
    },
  ],
});

export const game = defineGame({
  id: "auto",
  save: { key: "auto.save", version: 1 },
  features: [wallet, stalls, auto],
  vocab: TOY,
});
// store.getState().auto.toggle("stall") · .setAll(false) · auto.rules.nextInMs(state, "stall", now)
