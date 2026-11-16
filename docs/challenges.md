## Challenges

A run under a restriction, for a permanent reward. Entering a challenge resets the run and switches on its named rule
flags, which the game's own rules read with `challengeRule`; when its goal holds it completes (counted, its best time
kept, the run reset again, the flags off), and what the completions give feeds the stat bus. The feature holds the
record, so it never resets with the run and survives the very reset it triggers.

```ts
import {
  busOf,
  challengeRule,
  challenges,
  type Decimal,
  defineGame,
  type Effect,
  feature,
} from "watchpot/core";
import { wallet } from "./add-a-currency";
import { TOY } from "./vocab";

type State = { wallet: { gold: Decimal }; trials: { active: string | null; rules: string[] } };

/** Two challenges: a run with no gem spending, then a harder one it opens. */
export const trials = challenges({
  key: "trials",
  list: [
    {
      id: "no-gems",
      goal: (s: State) => s.wallet.gold.gte(1e6),
      maxCompletions: 3,
      effects: (n): Effect[] => [{ stat: "toy.speed", mult: 1 + 0.5 * n }], // grows with each completion
      rules: ["noGems"], // the flag the game's own rules read
    },
    { id: "short", unlocked: (s) => s.wallet.gold.gte(1e3), goal: (s) => s.wallet.gold.gte(1e9) },
  ],
  onComplete: (d, _id, n) => wallet.credit(d, "gems", 10 * n), // in the same recipe as the completion
});

/** The game's own rule, reading the flag: gems cannot be spent inside "no-gems". */
export const shop = feature({
  key: "shop",
  reach: [wallet, trials],
  initial: () => ({ boughtWithGems: 0 }),
  actions: (api) => ({
    buyWithGems: () =>
      api.set((s) => {
        if (challengeRule(s.trials, "noGems") || !wallet.debit(s, "gems", 1)) return;
        s.shop.boughtWithGems += 1;
      }),
  }),
});

export const game = defineGame({
  id: "trials",
  save: { key: "trials.save", version: 1 },
  features: [wallet, shop, trials],
  vocab: TOY,
});
// store.getState().trials.enter("no-gems") → null, or "unknown" | "locked" | "maxed" | "busy"
// busOf(trials.rules.contributions(state.trials)) · store.getState().trials.exit()
export const speedBus = (s: { trials: { completions: Record<string, number> } }) =>
  busOf(trials.rules.contributions(s.trials));
```

- **`challenges({ key, list, onComplete? })`** saves `{ active, startedAt, rules, completions, bestMs }` under `key`
  (the stat bus's source prefix too) with `reset: "never"`. A profile reset clears it; a run reset never does.
- **`ChallengeDef<G, E>`**: `id`, `unlocked?(state)`, `goal(state)`, `maxCompletions?` (default 1), `effects?(completions)
  → E[]` (the reward for the completions so far) and `rules?: string[]` (the restriction's flags).
- **`enter(id)`** resets the run (the store's `resetRun`, inside its recipe) and marks the challenge active; it
  returns null, or why not: `unknown`, `busy` (one is already active), `locked`, `maxed`. **`exit()`** resets the
  run and pays nothing. **`<key>.settle.goal`** completes the active challenge when its goal holds: completions + 1,
  the time since entering kept if it is the best, the run reset at the pass's `now`, the flags cleared, then
  `onComplete(draft, id, completions)`. It runs on a catch-up too.
- **Flags:** `challengeRule(state.<key>, "noUpgrades")` is true only while a challenge carrying the flag is active.
- **Rules (`.rules`):** `check(state, id)`, `maxed(slice, id)` and `contributions(slice)`, sourced `<key>:<id>`, for
  `busOf`.
