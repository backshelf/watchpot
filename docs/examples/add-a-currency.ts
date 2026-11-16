import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  currencies,
  D,
  defineGame,
} from "watchpot/core";
import { TOY } from "./vocab";

/** A balance per currency of the vocabulary, with the totals the game wants kept beside them. */
export const wallet = currencies({
  key: "wallet",
  vocab: TOY,
  start: { gold: 30 }, // every other currency starts at zero
  earned: { gold: "lifetimeGold" }, // a field totalling every credit of gold
  spent: { gems: "gemsSpent" }, // a field totalling every debit of gems
  extra: () => ({ dust: D(0) }), // the game's own fields beside the balances
  actions: ({ set }, w) => ({
    // Inside a recipe, use the draft helpers: they change the draft you hold.
    sweepDust: () =>
      set((s) => {
        w.credit(s, "gems", s.wallet.dust);
        s.wallet.dust = D(0);
      }),
  }),
});

export const game = defineGame({
  id: "currency",
  save: { key: "currency.save", version: 1 },
  features: [wallet],
  vocab: TOY,
});

if (import.meta.main) {
  const store = createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
    now: () => Date.UTC(2026, 0, 1),
  });
  const w = store.getState().wallet;
  w.credit("gold", 12);
  console.log("debit 100 gold:", w.debit("gold", 100)); // false: nothing touched
  console.log("debit 40 gold:", w.debit("gold", 40)); // true
  console.log(
    "gold:",
    store.getState().wallet.gold.toString(),
    "lifetime:",
    store.getState().wallet.lifetimeGold.toString(),
  );
}
