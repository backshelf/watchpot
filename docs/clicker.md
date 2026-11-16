## Clicker

A press pays a currency: the usual clicker loop. What one press pays is the game's (`power`, often a base plus a share
of income per second); a press may crit, rolled on the feature's own saved stream so a reload cannot reroll it, and
may ride a combo that grows while presses land close together and falls back to 1 after a pause. A rate cap drops
presses past it, against an auto-clicker. Every time is game time.

```ts
import { clicker, clickShare, currencies, type Decimal } from "watchpot/core";

const wallet = currencies({ key: "wallet", vocab: TOY });

type State = { wallet: { gold: Decimal; gems: Decimal }; mine: { perSecond: Decimal } };

export const tap = clicker({
  key: "tap",
  wallet,
  currency: "gold",
  power: (s: State) => clickShare(1, s.mine.perSecond, 0.05), // 1 gold plus 5% of income a second
  crit: () => ({ chance: 0.02, mult: 10 }),
  combo: { windowMs: 800, step: 0.1, max: 3 },
  maxPerSecond: 20,
});
// store.getState().tap.click() → { amount, crit, combo }, or null past the cap
```

Example: [`examples/clicker.ts`](examples/clicker.ts).

- **`clicker({ key, wallet, currency, power, crit?, combo?, maxPerSecond?, onClick?, reset? })`** saves `{ clicks,
  earned, best, crits, runClicks, runEarned, combo, lastAt, rng, windowAt, windowCount }` and has no steps. One action,
  `click()`, pays `power(state) × combo × (crit ? mult : 1)` into `wallet` and returns `{ amount, crit, combo }`, or
  null when the cap dropped it (a dropped press pays nothing and moves no combo). `onClick(draft, result, now)` runs in
  the same recipe; `.press(draft, now)` is the same press inside a recipe of the game's.
- **`clickShare(base, perSecond, share)`** is `base + perSecond × share`.
- **Crit:** `crit(state)` gives `{ chance, mult }`; the roll is on the feature's own stream (seeded from the profile and
  the key), saved, so a reload replays the same rolls.
- **Combo:** `{ windowMs, step, max }`. A press within `windowMs` of the last paid one pays at the last's multiplier
  plus `step`, up to `max`; a press after a longer pause pays at 1. `comboAt(state, now, combo)` is what the next
  press would pay at and `comboShown(state, now, combo)` what a screen shows; the feature carries the rule as `.combo`.
- **`maxPerSecond`** counts presses in fixed one-second windows of game time and drops the rest.
- **Reset:** a run reset clears `runClicks`, `runEarned` and the combo, and keeps the lifetime totals (`clicks`,
  `earned`, `best`, `crits`) and the stream, unless `reset` says otherwise.
- **Sim:** the move is a free `click` worth `power(state)` that refuses a second press at the same game time, so the
  auto-player presses once per look and the sim's look cadence is the click rate.
