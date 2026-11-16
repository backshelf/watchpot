# Recipes

Crafting: inputs to outputs. A recipe takes amounts of some currencies and gives amounts of others, all or nothing,
as many times over as asked, with a yield multiplier on what it gives. The pure rules work over a `Purse` that can be
credited; `defineCrafting({ key, wallet, list })` is the feature over a currencies feature, with an optional timed queue
that makes one at a time on game time.

<!-- example-code: recipes.ts -->

```ts
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
// store.getState().forge.craft("polish", 5) · .craftMax("set") · forge.select.nextInMs(state, "cast", now)

export const game = defineGame({
  id: "forge",
  save: { key: "forge.save", version: 1 },
  features: [wallet, forge],
  vocab: TOY,
});
// store.getState().forge.craft("polish", 5) · .craftMax("set") · forge.rules.nextInMs(state, "cast", now)
// Pure, over any purse that can be credited: craft(recipe, purse, times, yieldMult) → what was made, or null.
```

- **Pure rules** over a `CraftPurse` (a `Purse` plus `credit`): `canCraft(recipe, purse, times = 1)`,
  `maxCraftable(recipe, purse, limit?)` (the fewest whole crafts any input allows; a recipe that takes nothing is
  bounded by `limit` alone), `craft(recipe, purse, times = 1, yieldMult = 1)` → what was made per currency, or null
  with nothing touched. `payRecipe` and `giveRecipe` are its two halves. Amounts are Decimals; a recipe is
  `{ inputs, outputs }`, each an amount per currency.
- **`defineCrafting({ key, wallet, list, reset?, onCraft? })`** saves `{ made, queue }` under `key`; `made` counts crafts
  given per recipe (Decimals). A run reset clears it unless `reset` says otherwise.
- **`RecipeDef<C, G>`**: `id`, `inputs`, `outputs`, `unlocked?(state)`, `yield?(state)` (read when the outputs are
  given) and `takesMs?` (a number, or `(state) => number`).
- **Timed recipes.** The inputs are paid at once and the crafts join the recipe's one job (another craft extends
  it); `<key>.produce.queue` gives each as its time passes, one at a time (`startedAt + k × takesMs`), so one long
  step gives what many short ones do and a queue finishes during an absence.
- **A queue that speeds up.** `takesMs: (state) => number` is read at each pass, over a tick and a catch-up alike.
  The span since the last pass runs at the time the job was last worked at (saved on the job as `msEach`); then the
  job is re-anchored on this pass's time with its progress kept, so half a craft done stays half done and the rest
  runs at the new pace. A read at or below zero (or not a number) gives what is queued at once. A plain number works
  as it always has.
- **`onCraft(draft, recipe, times, now)`** is called once per batch given, inside the recipe that gives it: an
  instant craft, or what one pass hands off the queue (three crafts finished over an absence are one call with 3).
  Experience for what was made, a counter of the game's own, a cue: one place, whichever way the craft came.
- **Actions:** `craft(id, times = 1)` (all or nothing; false when locked or short) and `craftMax(id)` (returns how
  many). **`draft`** (in a recipe, named like the actions): `forge.draft.craft(draft, id, times?, now?)` and
  `forge.draft.craftMax(draft, id, now?)`, the same craft for a step or a game's own action (an automatic crafter),
  counted and heard like the action's. **`select`** (questions over state): `open`, `craftable(state, id)`,
  `job(state, id)` and `nextInMs(state, id, now)`. **`def`:** `list` and `recipe(id)`. `reach` names the features
  the callbacks (`unlocked`, `yield`, `takesMs`, `onCraft`) read, as on `feature`, so their state is typed with no
  annotation (the wallet is reached already).