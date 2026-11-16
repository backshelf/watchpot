## Autobuyers

Automation as a system: things the game buys for the player on an interval, once unlocked and switched on. The game
writes each purchase (`run`, inside the tick's recipe, returning how many it bought); the feature owns the player's
switches, the schedule on game time and the count, and fires the due ones highest priority first.

```ts
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
```

- **`autobuyers({ key, list, reset? })`** saves `{ on, lastAt, bought }` under `key` and fires in one step,
  `<key>.automate.fire`, after production. An autobuyer fires when `unlocked(state)`, switched on (every one starts
  on) and due; `priority` orders a tick (higher first, ties in list order), so a scarce balance goes where the game
  says. A prestige reset keeps the switches (`{ keep: ["on"] }`) unless `reset` says otherwise.
- **`AutobuyerDef<G>`**: `id`, `unlocked(state)`, `intervalMs(state)` (0 fires every tick), `run(draft, ctx) → number`
  and `priority?`.
- **The schedule never drifts.** `everyMs(lastAt, intervalMs, now)` is the pure rule: the first fire is at once, then
  the new `lastAt` keeps the interval's phase (`lastAt + interval × floor((now - lastAt) / interval)`), so a 2 s
  autobuyer fires at 2, 4, 6 s whether the ticks are 100 ms or 300 ms. A fire that buys nothing (a short balance)
  still waits for the next interval.
- **An absence is not simulated.** A catch-up fires each autobuyer at most once, at its end: the purchases it would
  have made while the tab was closed are not replayed. A game that wants them buys in its away step.
- **Actions:** `toggle(id, on?)` (returns the switch after) and `setAll(on)`. **Rules (`.rules`):** `active(state,
  id)` and `nextInMs(state, id, now)` (0 when due, null when not active) for a countdown.
