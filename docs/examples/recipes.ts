import { type Decimal, defineCrafting, defineGame } from "watchpot/core";
import { wallet } from "./add-a-currency";
import { TOY } from "./vocab";

type State = { wallet: { gold: Decimal; gems: Decimal } };

/** Three recipes: an instant one, one that gives more as gems pile up, and a timed one on a queue. */
export const forge = defineCrafting({
  key: "forge",
  wallet,
  list: [
    { id: "polish", inputs: { gold: 100 }, outputs: { gems: 1 } },
    {
      id: "set",
      inputs: { gold: 500, gems: 2 }, // several inputs: all or nothing
      outputs: { gems: 3, gold: 50 }, // several outputs
      yield: (s: State) => (s.wallet.gems.gte(100) ? 1.5 : 1), // scales the outputs
    },
    {
      id: "cast",
      inputs: { gold: 1000 },
      outputs: { gems: 15 },
      takesMs: 60_000, // paid at once, given one a minute on game time, tab open or not
      unlocked: (s) => s.wallet.gems.gte(10),
    },
  ],
});

export const game = defineGame({
  id: "forge",
  save: { key: "forge.save", version: 1 },
  features: [wallet, forge],
  vocab: TOY,
});
// store.getState().forge.craft("polish", 5) · .craftMax("set") · forge.rules.nextInMs(state, "cast", now)
// Pure, over any purse that can be credited: craft(recipe, purse, times, yieldMult) → what was made, or null.
