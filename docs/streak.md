# Streak

The daily return: one claim a local calendar day, and a run of consecutive days that a missed day breaks. Days are the
player's own calendar days, found by the calendar (`dayKey`, `previousDayKey`, `nextLocalMidnight`), so a 23- or
25-hour day across a daylight-saving change is still one day, and a claim just before midnight and one just after are
two days in a row. The kernel is pure over the state and the `now` it is handed.

<!-- example-code: streak.ts -->

```ts
import {
  type Decimal,
  defineCurrencies,
  defineGame,
  defineStreak,
  fmtWait,
  type StreakState,
} from "watchpot/core";
// ...
export const daily = defineStreak({
  key: "daily",
  rewards: (day) => (day % 7 === 0 ? { gold: 0, gems: 5 } : { gold: 100 * (day % 7), gems: 0 }),
  onClaim: (draft: State, reward) => {
    wallet.draft.credit(draft, "gold", reward.gold); // a credit of 0 does nothing
    wallet.draft.credit(draft, "gems", reward.gems);
  },
  grace: 1, // one missed day is forgiven
  keep: (draft, missed) => wallet.draft.debit(draft, "gems", missed * 10), // past that, gems save the run
});
```

Example: [`examples/streak.ts`](examples/streak.ts).

- **`StreakState`** is `{ lastDay, count, best, total }`: the day key last claimed (null before the first), the run,
  the longest run and the claims ever. `NO_STREAK` is a fresh one.
- **`streakStatus(state, now, { grace? })`** → `{ canClaim, count, broken, missed, msUntilNext }`: `missed` is the
  whole days skipped since the last claim (counted to 366), `broken` is `missed > grace` (the shown `count` is then
  0), and `msUntilNext` is the wait to the next local midnight once today is claimed. A last claim dated after today
  (a clock set back) blocks claiming until that day and breaks nothing.
- **`claimStreak(state, now, { grace?, keep? })`** → `{ state, day, kept }`, or null when today is claimed: the run
  goes up by one, or starts again at 1 when broken, unless `keep(missed)` returns true.
- **`defineStreak({ key, reach?, rewards, onClaim?, grace?, keep?, reset? })`** saves `StreakState` and has one action, `claim()`,
  which returns `{ day, reward, kept }` (the reward `rewards(day)` for the day of the run claimed) and runs
  `onClaim(draft, reward, day, now)` in the same recipe; `keep(draft, missed)` may charge in that recipe to save a run.
  `daily.select.status(state, now)` reads the status with the feature's grace; `daily.def` is `{ grace, rewards }`; `draft` is empty. No steps; `reset` defaults to `"never"`.
