# Levels

Experience and levels, as curves with exact inverses. A curve says how much XP each level takes; the readers go
both ways, from a level to the total it needs and from a total back to the level it reaches, and always agree:
`totalXpAt(levelAt(x)) ≤ x < totalXpAt(levelAt(x) + 1)`, at any size a Decimal holds. `levels({ key, tracks })` keeps
the XP of several named tracks (skills) and reports the levels each gain makes.

```ts
import { defineGame, type Effect, levelAt, levelProgress, levels, type XpCurve } from "watchpot/core";
import { wallet } from "./add-a-currency";
import { TOY } from "./vocab";

/** Each level takes a quarter more than the last: 100, 125, 156… */
const steady: XpCurve = { kind: "geometric", base: 100, growth: 1.25 };

/** Two tracks: one on the steady curve, one on a hand-written table that tops out at level 5. */
export const skills = levels({
  key: "skills",
  tracks: [
    { id: "gather", curve: steady },
    { id: "trade", curve: { kind: "table", totals: [50, 150, 400, 1000, 2500] } },
  ],
  maxLevel: 99, // every track stops here unless its own says otherwise
  onLevel: (d: { wallet: object }, _track, from, to) => wallet.draft.credit(d, "gems", to - from), // a gem a level
  effects: (track, level): Effect[] => [
    { stat: "toy.speed", mul: 1 + (track.id === "gather" ? 0.05 : 0.1) * level },
  ],
});

export const game = defineGame({
  id: "skills",
  save: { key: "skills.save", version: 1 },
  features: [wallet, skills],
  vocab: TOY,
});
// store.getState().skills.gain("gather", 500) → levels gained · skills.gain(draft, "trade", 20) inside a recipe
// skills.rules.progress(state.skills, "gather") → { level, into, need, share } · skills.rules.contributions(...) feeds a `stats` feature
export const where = (xp: number) => ({ level: levelAt(steady, xp), bar: levelProgress(steady, xp).share });
```

- **Curves (`XpCurve`)**, level 0 at 0 XP: `{ kind: "geometric", base, growth }` (level `L` to `L + 1` takes
  `base × growth^L`, through `cost.ts`), `{ kind: "polynomial", base, power }` (the total to reach `L` is
  `base × L^power`), `{ kind: "table", totals }` (`totals[i]` reaches level `i + 1`; the last entry is the top), or a
  function giving the total to reach a level (rising, 0 at 0).
- **Readers:** `xpForLevel(curve, level)` (from `level` to the next), `totalXpAt(curve, level)`, `levelAt(curve, xp)`
  (closed form for geometric and polynomial, checked either side; binary search over a table; doubling then
  bisection over a function, up to `LEVEL_LIMIT`) and `levelProgress(curve, xp)` → `{ level, into, need, share }`
  (at a table's top the need is Infinity and the share 1).
- **`levels({ key, tracks, maxLevel?, onLevel?, effects?, reset? })`** saves `{ xp }`, a Decimal total per track,
  under `key` (the contributions' source prefix too); levels are read off the totals, never stored. `TrackDef` is `{ id,
  curve, maxLevel? }`; a track at its max keeps no XP past that level's total.
- **Gaining:** the action `gain(track, amount)` and the draft helper `skills.gain(draft, track, amount)` both return
  the levels gained and run `onLevel(draft, track, from, to)` once in the same recipe when the level rises. A gain
  of zero or less does nothing.
- **Rules (`.rules`):** `level(slice, track)`, `progress(slice, track)` and `contributions(slice)` through
  `effects(track, level)`, sourced `<key>:<track>`. A run reset clears the XP unless `reset` says otherwise.
