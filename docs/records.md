# Records

The statistics screen: named running values, each folded by its kind and kept at the scopes it names (this run, the
whole life of the profile), with the best of every finished run and a short list of past runs beside them. A run reset
pushes the ending run onto that list with its length in game time and starts the run scope over; the life scope never
clears. The game notes what it counts where it happens, from a recipe, a step or an action.

<!-- example-code: records.ts -->

```ts
import { defineFeature, defineGame, defineRecords, fmtPlayed, type RecordsState } from "watchpot/core";

export const stats = defineRecords({
  key: "stats",
  track: {
    presses: { kind: "sum", scope: ["run", "life"] },
    gold: { kind: "sum", scope: ["run", "life"], decimal: true },
    richest: { kind: "max", scope: ["run", "life"], decimal: true },
    gemsHeld: { kind: "last", scope: ["life"] },
  },
});
```

Example: [`examples/records.ts`](examples/records.ts).

- **Kinds:** `sum` adds, `max` keeps the highest, `min` the lowest, `last` the latest. A `sum` starts at zero at every
  scope it keeps; the others have no value (undefined) until noted. `decimal: true` keeps a record as a Decimal, else
  a number; the names and their value types are read off `track`.
- **`defineRecords({ key, track, keepRuns? })`** saves `{ values: { run, life, best }, runs, runStart, bestRunMs }`. Actions:
  `add(name, n)` (for a sum; on another kind the same as `note`), `note(name, value)` (folds by the kind at every scope
  the record keeps), `run(name)`, `life(name)`, `best(name)`. The draft helpers `stats.draft.add(draft, name, n)` and
  `stats.draft.note(draft, name, value)` do the same inside a recipe or step, `stats.select.value(state, scope, name)` reads one off the game state and `stats.def.track` holds the tracks.
  No steps.
- **A run reset** pushes `{ endedAt, lengthMs, values }` (the run scope) onto `runs`, oldest first, `keepRuns`
  (default 10) at most; folds each run value into `best` (higher is better, lower for a `min`, or the track's
  `best: "high" | "low"`); keeps the shortest run as `bestRunMs`; then clears the run scope. The life scope stays.
