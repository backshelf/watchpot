# Allocation

A capped pool split between sinks: workers across jobs, energy across bars. The pool is the game's number and the
player says how much goes where. A sink either counts what is assigned to it (the game reads `assigned` as a rate) or
fills a bar: each assigned unit does `speed` work a second, and a full bar levels the sink up on a cost curve. When
the pool shrinks, the most recently assigned sink gives way first.

<!-- example-code: allocation.ts -->

```ts
import { defineAllocation, defineGame, defineStats, type Effect, feature } from "watchpot/core";
import { TOY } from "./vocab";

const crew = feature({ key: "crew", initial: () => ({ size: 12 }) });

/** Twelve workers across three sinks: one that only counts, two bars that level up as they fill. */
export const jobs = defineAllocation({
  key: "jobs",
  reach: [crew], // what the callbacks read, typed with no annotation
  pool: (s) => s.crew.size, // the game's number; shrink it and the newest assignments give way
  sinks: [
    { id: "haul", cap: () => 5 }, // counts: the game reads s.jobs.assigned.haul as a rate
    {
      id: "forge",
      cost: { base: 10, growth: 1.5 }, // work per level: geometric, so a long absence levels in one step
      speed: () => 1, // work per assigned worker per second
      effects: (level): Effect<"toy.speed">[] => [{ stat: "toy.speed", add: level }],
    },
    { id: "study", cost: (level) => 100 * (level + 1), speed: () => 2, maxLevel: 20 }, // walked
  ],
});

/** What the bars' levels give, on the engine's `stats`: `s.stats["toy.speed"]`, worked out as the levels move. */
export const boosts = defineStats({
  key: "stats",
  vocab: TOY,
  reach: () => [jobs],
  stats: { "toy.speed": { base: 1 } },
  contributions: (s) => jobs.select.contributions(s),
});

export const game = defineGame({
  id: "jobs",
  save: { key: "jobs.save", version: 1 },
  vocab: TOY,
  features: [crew, jobs, boosts],
});
// store.getState().jobs.assign("forge", 4) · .unassign("forge", 1) · .fill("study") · .clear()
// jobs.select.bar(state, "forge") → { level, into, need, share } · jobs.select.free(state)
```

- **Pure rules:** `assignUnits(assigned, id, n, pool, cap?)` moves `n` units in (no more than is free or than the cap leaves
  room for) or, negative, out; `freeUnits(assigned, pool)`; `allocatedUnits(assigned)`; `rebalanceUnits(assigned, pool, order, caps?)`
  trims every sink to its cap, then the total to the pool from the end of `order` (most recent last), deterministic.
  Each returns a new record.
- **`defineAllocation({ key, pool, sinks, away?, reset? })`** saves `{ assigned, order, progress, level }` under `key` (the
  contributions' source prefix too). `<key>.sync.pool` rebalances every pass, so a pool or cap that shrinks takes units
  back; `<key>.produce.fill` fills the bars over a tick and over an absence (`away`, default all of it).
- **`SinkDef<G, E>`**: `id`, `cap?(state)`, `effects?(level)`, and for a bar `cost: CostCurve` (work per level),
  `speed(state)` (work per unit a second) and `maxLevel?`. A long step levels several times at once through
  `maxAffordable`: closed-form for a geometric cost, walked (`WALK_LIMIT` a step) for a function. At `maxLevel` the bar
  stops and holds no progress.
- **Actions** (each returns the units moved): `assign(id, n)`, `unassign(id, n)`, `clear()`, `fill(id)` (everything
  free into one sink). A sink that gains goes to the end of `order`.
- **`select`** (questions over state): `pool`, `free`, `cap`, `perSecond(state, id)` (a bar's work a second),
  `bar(state, id)` → `{ level, into, need, share }`, and `contributions(state)` sourced `<key>:<id>`, which is what
  the stats feature (`defineStats`)'s `contributions` takes.
- **`def`** (what it was given): `sinks`, `sink(id)`, and `contributions(slice)`, the same contributions from the
  saved slice alone (`{ level }`).
- **`draft`** (inside a recipe or a step, named like the actions): `assign(draft, id, n)`, `unassign(draft, id, n)`,
  `clear(draft)` and `fill(draft, id)`, each returning the units moved.
- **`reach`**: the features the callbacks (`pool`, `cap`, `speed`, `away`) read, as on `feature`; their state is then
  typed with no annotation (`pool: (s) => s.crew.size`).
