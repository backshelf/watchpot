# Migrating a game to watchpot 1.0

1.0 is a clean break from 0.18: no deprecated aliases and no codemods. This page lists every breaking change as
old → new, grouped by what a game touches, so a game can be brought forward by hand (or by an agent) from the list
alone. Work top to bottom: the kernel first, since everything else is typed on it. `bun check` is the to-do list at
every step.

A game whose numbers must not move (a fitted game mid-playthrough) should read **Keeping your numbers** at the end
before changing anything: several defaults changed, and each has an explicit spelling for the old behaviour.

## Packages and imports

| Old | New |
| --- | --- |
| `DevPanel`, `DevPanelProps` from `watchpot/react` | from `watchpot/devtools` |
| `openSoundDesk`, `DeskSwitch`, `SoundDeskOptions` from `watchpot/react` | from `watchpot/devtools` |
| `fetchSampleHost`, `FetchSampleHostOptions` from `watchpot/react` | from `watchpot/devtools` |
| `watchpot/hooks` (any import) | `watchpot/react` (every symbol is there) |
| `"watchpot/env"` in `tsconfig.json` `types` | remove it; `"types": ["bun"]` is enough |

`watchpot/react` no longer reaches a stylesheet. The dev panel's CSS-module declarations come with
`watchpot/devtools` itself.

## The kernel (`watchpot/core`)

### `reach` is lazy, and may name a feature by type

- `reach: [a, b]` still works; `reach: () => [a, b]` may name a feature declared further down the file.
- Two features that read each other: one side reaches by value, the other by state type:
  `reach: reach<{ lid: LidState }>()`, or mixed in a list: `reach: () => [pot, reach<{ lid: LidState }>()]`.
  `defineGame` fails to compile when a key reached by type is missing or its state differs.
- A hand-written whole-game state type, and the `(s: GameDraft) => …` annotations that went with it, are no longer
  needed: delete them and add the reaches.
- `FeatureSpec.reach` is now a function (`f.reach()`), for code that walked it.
- Factories take the same `reach` option; their callbacks' state is then inferred (own slice, the wallet, the reach).

### Derived values: `derived` replaces `derive`

Old: a transient field with a dummy initial value, a `derive` function, and the same function again as a `rates`
step.

```ts
const stove = feature({
  key: "stove",
  initial: () => ({ burners: 0, perSecond: ZERO }),
  transient: ["perSecond"],
  derive: (s) => { s.stove.perSecond = flameOf(s.stove.burners); },
  steps: { rates: { flame: (s) => { s.stove.perSecond = flameOf(s.stove.burners); } } },
});
```

New: one declaration. The field's name is the property name, its type is what the function returns.

```ts
const stove = feature({
  key: "stove",
  initial: () => ({ burners: 0 }),
  derived: { perSecond: (s) => flameOf(s.stove.burners) },
});
```

- Removed: `FeatureDef.derive`, `DeriveContext`, `DeriveReason`.
- A derived value is never saved and cannot be written (a write throws). A feature that used to adjust another
  feature's derived field (a lid doubling the stove's rate in a later step) now either declares its own derived
  value that reads the other (`lid.doubled` reads `stove.perSecond`), or the first reads the second through a type
  reach. The engine orders derived values by who reads whom and throws, naming the loop, when they go round.
- A derived value is current as of the start of the step or recipe that reads it: a step sees what earlier steps
  did, not its own writes. It is recomputed only when a slice it read was taken hold of by a step or recipe since.
- A derived function sees the feature's saved state and its reach, not the feature's own other derived values
  (annotate the parameter if one must read a sibling).
- Write `derived` after `initial` and `reach` and before `actions` and `steps`.
- `feature<…>` called with explicit type arguments has a new fifth parameter (the derived values) before `G`:
  `feature<K, S, A, R, Record<never, never>, G>`.
- `Feature<K, S, A, N, Dv>` has two more type parameters (type reaches needed, derived values); `StateOf` includes
  derived values, `SavedOf` does not, and `DataOf` is state plus derived with no actions.

### Steps

- **A `produce` step must name its pass.** `produce: { burn: (s, ctx) => … }` no longer compiles (and throws at
  definition): write `{ pass: "tick" | "catchUp" | "both", run }`. To keep old behaviour exactly, a bare function
  becomes `{ pass: "both", run: fn }`. Steps in every other phase are unchanged (a bare function runs in both).
- `StepDef.pass` accepts `"both"`. New: `PassChoice`, `EarningStepDef`, `EARNING_PHASES`.
- **`defineGame({ order })` is removed**, with the `StepOrder` type. A step states its own order:
  `{ after: "stove.rates.flame", run }` or `before`, naming a step id or a feature key (all of its steps in that
  phase), or an array of them, in the same phase. Old `order: { rates: ["a.rates.x", "b.rates.y"] }` becomes
  `after: "a.rates.x"` on `b.rates.y`. Most uses of `order` existed to sequence derived values and disappear with
  `derived`.
- `StepRef` (from `declaredSteps`) gained `feature`, `after`, `before`; `orderPhase` takes the steps alone.

### `initial`'s clock

- `InitialContext.now` is always game time (it was wall time for a new profile, a profile reset and an import).
- New required field `InitialContext.wallNow`: the wall at the same moment. A feature that stored a real date from
  `now` reads `wallNow`; one that stored a run start keeps `now` and is now right after an import too.

### Moves (the sim's view of a feature)

- `Move.value(state)` is now `Move.worth?(state)`, and optional: see the sim section.
- New `Move.repeat`.

## Prices

- **Cost curves round up by default.** `round` on a `CostCurve` / `GeometricCost` defaults to `"ceil"` (it had no
  rounding). New `round: "none"` keeps fractional prices. Explicit `"floor"`, `"ceil"`, `"nearest"` are unchanged;
  hand-written `(bought) => price` curves are unchanged.
- **A node with more than one rank must state `costGrowth`** (a compile error, and `tree()` throws naming the
  node). `DEFAULT_COST_GROWTH` (1.5) is removed. A flat price is `costGrowth: 1`. A node with `maxLevel: 1` may
  omit it.
- `GraphNode` is a type alias over a union, not an interface: `interface X extends GraphNode<E, C>` becomes
  `type X = GraphNode<E, C> & { … }`.
- `eventNodeRow`: the `costGrowth` argument is required when `maxLevel` is above 1.
- Node prices themselves are unchanged (they floor to whole numbers, as before).

## The factory convention: `select` / `def` / `draft`

Every factory returns the feature plus exactly three namespaces, and nothing else hangs off the feature:
`select` (read-only questions over state), `def` (fixed configuration), `draft` (helpers that take a draft first,
named like the actions). Actions on the state (`s.wallet.credit(c, n)`) are unchanged throughout.

### `currencies`

| Old | New |
| --- | --- |
| `wallet.credit(draft, c, n)` | `wallet.draft.credit(draft, c, n)` |
| `wallet.debit(draft, c, n)` | `wallet.draft.debit(draft, c, n)` |
| `wallet.purse(draft)` | `wallet.draft.purse(draft)` |
| `wallet.balance(state, c)` | `wallet.select.balance(state, c)` |
| `wallet.canAfford(state, c, n)` | `wallet.select.canAfford(state, c, n)` |
| `wallet.currencies` | `wallet.def.currencies` |
| `actions: (api, helpers) => …` with `helpers.credit(s, …)` | `actions: (api, { draft }) => …` with `draft.credit(s, …)` |
| `CurrencyHelpers<K, C>` (the flat helpers) | the bundle `{ select, def, draft }`; the parts are `CurrencySelect`, `CurrencyDef`, `CurrencyDraftHelpers` |

### Every other factory

Two rules hold across all of them:

- A `select` or `draft` helper takes **the game state (or draft) that holds the slice under its key**, never the
  slice: `boosts.select.contributions(s, now)`, not `…(s.boosts, now)`.
- Factories that take callbacks gained a `reach` option, and their type arguments changed to make room for it. A
  call that passed the whole-game state as an explicit type argument (`spawns<"k", State>(…)`,
  `boardFeature<"k", Fx, State>(…)`) drops it and adds `reach: () => [...]`; annotating a callback parameter still
  works too.

Pure kernels and free functions keep their API (`board()`, `fillBoard`, `searchBoard`, `loadout()`, `fillLoadout`,
`buffActive`, `buffLeftMs`, `buffStacks`, `overlapMs`, `startBuff`, `endBuff`, `expireBuffs`, `drawMany`,
`layerModel`, `tree()`, `achievementBoard`).

| Factory | Old | New |
| --- | --- | --- |
| `buffs` | `boosts.list` | `boosts.def.list` |
| | `boosts.contributions(s.boosts, now)` | `boosts.select.contributions(s, now)` |
| | `boosts.start(d, id, now, start?)`, `boosts.end(d, id, now)` | `boosts.draft.start(…)`, `boosts.draft.end(…)` |
| | (new) | `boosts.select.active / leftMs / stacks / overlapMs(s, id, …)` beside the free functions |
| `spawns` | `visitors.kinds` | `visitors.def.kinds` |
| | `visitors.take(d, kind, now)` | `visitors.draft.catch(d, kind, now)` |
| `sweep` | `line.grades` | `line.def.grades` |
| | `line.setup(s)`, `line.cursor(s, now)` | `line.select.setup(s)`, `line.select.cursor(s, now)` |
| | `line.strike(d, now)` | `line.draft.strike(d, now)` |
| `boardFeature` | `garden.board` | `garden.def.board` |
| | `garden.limits(s)`, `garden.contributions(s)` | `garden.select.limits(s)`, `garden.select.contributions(s)` |
| `loadoutFeature` | `kit.loadout` | `kit.def.loadout` |
| | `owns: (s: Reads, item)` with a hand-written `Reads` | `reach: () => [bag]`, then `owns: (s, item)` |
| `gacha` | `summon.openDraft(d, box, count)` | `summon.draft.open(d, box, count)` |
| | (new) | `summon.def` is `{ ladder, boxes, odds, pity }` |
| `layers` | `climb.model` | `climb.def.model` |
| | `climb.balance(s, currency)` | `climb.select.balance(s, currency)` |
| `achievements` | `wall.board` | `wall.def.board` (the kernel: `wall.def.board.rows(earned)` still works for a screen subscribed to `earned` alone) |
| | `wall.board.rows / count / rowsComplete / contributions / power(earned, …)` | `wall.select.rows / count / rowsComplete / contributions / power(state, …)` |
| | `wall.earn(d, id, now)` | `wall.draft.earn(d, id, now)` |
| | `achievements<K, G, E>` | `achievements<K, E, R, G>`; drop the type arguments and use `reach` |
| `missions` | `trips.rules.slots / freeSlots / ready(s, now)` | `trips.select.slots / freeSlots / ready` |
| | `trips.rules.list`, `trips.rules.mission(id)` | `trips.def.list`, `trips.def.mission(id)` |
| `challenges` | `trials.rules.check(s, id)` | `trials.select.check(s, id)` |
| | `trials.rules.maxed(s.trials, id)`, `trials.rules.contributions(s.trials)` | `trials.select.maxed(s, id)`, `trials.select.contributions(s)` |
| | `challengeRule(s.trials, rule)` (removed) | `trials.select.rule(s, rule)` |
| | `trials.rules.list`, `trials.rules.challenge(id)` | `trials.def.list`, `trials.def.challenge(id)` |
| `levels` | `skills.rules.level / progress(s.skills, track)`, `skills.rules.contributions(s.skills)` | `skills.select.level / progress(s, track)`, `skills.select.contributions(s)` |
| | `skills.rules.tracks`, `skills.rules.track(id)` | `skills.def.tracks`, `skills.def.track(id)` |
| | `skills.gain(d, track, amount)` | `skills.draft.gain(d, track, amount)` |
| `stages` | `roads.rules.force / fill / passable / secondsToClear / ended` | `roads.select.*`, same arguments |
| | `roads.rules.resistance(id, stage)`, `roads.rules.tracks`, `roads.rules.track(id)` | `roads.def.*` |
| `streak` | `daily.status(s.daily, now)` | `daily.select.status(s, now)` |
| | (new) | `daily.def.grace`, `daily.def.rewards` |
| `records` | `tally.track` | `tally.def.track` |
| | `tally.add(d, n, v)`, `tally.note(d, n, v)` | `tally.draft.add`, `tally.draft.note` |
| | `tally.value(s.tally, scope, name)` | `tally.select.value(s, scope, name)` |
| `gauge` | `heat.rules` (`{ max, trip }`) | `heat.def` |
| | `heat.nudge(d, amount, now)` | `heat.draft.nudge(d, amount, now)` |
| | (new) | `heat.select.locked(s, now)`, `heat.select.fill(s)`, `heat.select.secondsToTrip(s, perSecond)` |
| `seenOnce`, `settings` | (no members) | carry the three namespaces, empty |

Removed types: `MissionRules`, `ChallengeRules`, `LevelRules`, `StageRules`. `LevelHelpers` is now the
`{ select, def, draft }` bundle. Explicit type arguments on these factories no longer line up (a reach parameter
sits before `G`): remove them and use `reach`.

<!-- FACTORIES -->

## Stats

There is one stat system. The plain number bus is gone and the live graph is the model: values may read the
state, everything is a Decimal, a stat's base is declared once.

| Old | New |
| --- | --- |
| `busOf`, `statValue`, `statTotals`, `explainStat`, `StatBus`, `StatTotals`, the bus's `StatBreakdown` | removed; declare a `defineStats(...)` feature and read `s.stats.<id>` |
| `Effect { stat, add?, mult? }` (numbers) | `Effect<S, Q>`: `{ stat, add }` or `{ stat, mul }`, the amount a number or `(q) => number` |
| `{ stat, mult: 2 }` in content tables | `{ stat, mul: 2 }` |
| `LiveEffect { stat, op: "mul", value }` | `{ stat, mul: value }` (and `op: "add"` → `{ stat, add: value }`) |
| `liveIndex(options?)`, `LiveIndex` | `statIndex({ base, caps? })`, `StatIndex`; `base` is required (no default of 1) |
| `LiveSource`, `LiveMeta`, `LiveBreakdown`, `LiveIndexOptions` | `StatSource`, `SourceMeta`, `StatBreakdown`, `StatIndexOptions` |
| `softcapDecimal(value, cap)` and the number `applySoftcap` | `applySoftcap(value: Decimal, cap)` |
| `StatDef { softcap?, hardcap? }` | `StatCaps`; `StatDef` is now `StatCaps & { base }`, what `defineStats()` takes per stat |
| `statValue(bus, id, base)` with the base at each call site (default 0; the live graph's was 1) | the base once, in `defineStats({ stats: { id: { base } } })` |
| `graph/live.ts` | merged into `graph/stats.ts` |

What changed in behaviour:

- `SourceMeta.active` is optional (default: counts). New `SourceMeta.times(q)`: how many times over a source
  counts (ranks held, copies owned). An add counts `times` times its amount, a mul its amount to that power, as
  **one** row of the breakdown; `StatPart` gained `times`.
- A muted group's effects no longer vanish from the breakdown: its rows are listed with `muted` set (the group's
  name, or the reason when `muted` returns a string) and do not count. `StatPart.muted` is `string | null`. A screen
  that listed `parts` should skip or style the muted ones.
- `over(q, { extra })` hands a graph effects for that graph only.

The `stats` feature replaces a game's own fold:

```ts
// Old: a hand-folded bus, a transient slice, a `rates` step, and readers with the base at each call.
export const outputOf = (bus: StatBus) => statValue(bus, "output", 1);

// New: declared once; every stat is a derived value, never saved, current wherever it is read.
export const numbers = defineStats({
  key: "stats",
  vocab: WORDS,                       // stat ids come from vocab({ stats })
  reach: () => [upgrades, boosts],
  stats: { output: { base: 1 }, offline: { base: 0.25, hardcap: 1 }, gain: { base: 1 } },
  contributions: (s) => [...upgrades.select.contributions(s), ...boosts.select.contributions(s, now)],
  sources: [{ label: "Prestige", owner: "prestige", effects: [{ stat: "output", mul: (q) => … }] }],
});
// s.stats.output is a Decimal; stats.select.explain(s, "output") is the breakdown.
```

- `contributions` takes what the factories' contribution helpers return (`{ source, effect }[]`); the same effect
  object given several times by one source becomes one row counted that many times. Its group is the text before
  `:` in the source id.
- A stat that reads another stat reads it off the state (`q.stats.other`); the engine orders them and throws on a
  loop.
- A contribution may carry `times` (`{ source, effect, times: owned }`) instead of being listed once per copy.
  Folding into one row keys on the effect object: content that builds a fresh effect object per copy gets a row per
  copy unless it says `times`.
- Content tables are typed `Effect<StatId>`; an untyped `Effect` (stat: `string`) is refused by `contributions`.
  Code that read `e.mult` as a number reads `e.mul`, which may be a function: `Number(e.mul ?? 1)` for fixed content.
- `explainStat(…).sources` → `stats.select.explain(s, id).parts`; `statTotals(bus, id)` → `explain(…).add` and
  `.mult`.
- Buffs inside `contributions`: pass `Number.NEGATIVE_INFINITY` as `now` (a derived value cannot read the clock,
  and the buffs' own `sync` step has already ended the expired ones).
- Weighing stats for a state that does not exist (a loadout being auto-filled):
  `statIndex({ base }).over(null, { extra: () => contribs.map((c) => ({ effect: c.effect, meta: { label: c.source, owner } })) })`.
- A feature that reads a stat adds the stats feature to its `reach`.
- Stat ids `flags` and `feed` are reserved.
- A game that folded in log10 with plain numbers will see last-digit differences against Decimal products: compare
  the two folds over a sim replay with a tolerance before deleting the old one.

## Prestige and currency totals

### `currencies`: depth and honest totals

| Old | New |
| --- | --- |
| `earned: { gold: "goldEarned" }` | `earnedThisRun: { … }` (wiped with the currency) or `earnedEver: { … }` (never wiped by a run reset) |
| `spent: { … }` | `spentThisRun: { … }` or `spentEver: { … }` |
| `reset: { keep: ["gems"] }` to keep a balance | `depth: { gems: "never" }` |
| a function `reset` that kept balances by depth | `depth: { cores: 2 }` (the shallowest reset that wipes it; default 1) |
| `reset` over the whole slice | `reset` covers the `extra` fields only; balances and totals follow `depth` |

The old totals were wiped by a run reset: a field a game called "lifetime" and built on `earned` was really a
this-run total. Pick the kind the game meant. `wallet.def.depth` lists the depths; `currencies` takes `reach`.

### `prestige`: the layer keeps the reset pace

Every layer now keeps its own run start and peak pace and serves the pace as derived values. Delete the game's own.

| Old (in the game) | New (in the layer) |
| --- | --- |
| a `startedAt` field set from `initial`'s `now` | `s.<layer>.runStart` (saved; moved by any reset at the layer's depth or deeper) |
| a `peak` field, a `settle` step raising it, `afterReset` zeroing it | `s.<layer>.peak` (saved), kept by the layer |
| `resetPace(gain, held, runSeconds, floor)` called by hand | `s.<layer>.pace` (derived), or `layer.select.pace(s, now)` at any instant |
| `pace < peak * 0.85` | `s.<layer>.pastPeak` (derived), tuned by `pace: { past: 0.85, floorS: 10 }`; `s.<layer>.peakShare` is pace ÷ peak |
| `layer.resetDraft(d, ctx)` | `layer.draft.<action>(d, ctx)` (`layer.draft.reset` with the default action name) |
| `withMoves(prestige(…), …)` for the sim | `worth: (s) => number` in the definition; without it the layer declares no move |

- New option `payInto: { wallet, currency }`: the reset credits that wallet currency and the layer keeps no balance
  of its own (`s.<layer>.currency` does not exist then). Read what is held with `layer.select.held(s)` either way.
  The factory throws unless that currency's `depth` is deeper than the layer's, or the next reset would take the
  payout back.
- The layer's saved state gained `runStart`, `peak` and `paceAt`. Old saves need no migration (the fields fill from
  `initial`), but a game field named `peak` in the layer's own `initial` now collides with the engine's, and a game
  `settle` step named `pace` on the layer is refused: delete or rename them.
- `pace` is as of the end of the last pass (derived values cannot read the clock).
- Types: `PrestigeFeature` is the feature type; `PrestigeHelpers` is `{ select, def, draft }`; `currency` moved from
  `PrestigeCore` to `PrestigeHeld`.
- Stats that read the layer's balance while the layer's `gain` reads a stat is a cycle: the stats feature reaches
  the layer by type, `reach<{ prestige: { currency: Decimal } }>()`.

## The sim (`watchpot/sim`)

- **The sim runs on plain data.** `simStore(game, now, seed)` now returns a `PlainStore` (`createPlainStore` in
  `watchpot/core`): the same features, steps, actions and derived values with no immer, zustand or save. Its state
  is changed in place, so `getState()` hands back the same live object every time: a sampler that kept a previous
  state to compare against must copy what it keeps (Decimals are safe to keep). A recipe that throws leaves what it
  had written. `exportProfile` / `importProfile` throw. The old behaviour (the real store on storage that never
  writes) is `realSimStore(game, now, seed)`.
- Prove the two agree for your game once, in a test: `expect(plainParity(game, { act })).toBeNull()`
  (`watchpot/test`).
- **One default tick, a second.** `createSimWorld`'s default tick was a minute; it is now a second, the same as
  `playStraight` and `runFit`. `SIM_TICK_MS` is 1,000. To keep a minute, pass `{ tickMs: 60_000 }` or
  `{ quality: "rough" }`. New: `SIM_QUALITY` (`exact` 1 s, `quick` 10 s, `rough` 60 s), `SimQuality`,
  `SimWorld.tickMs`; `playStraight`'s `tickMs` defaults to the world's.
- **A free move is taken once per look** (it was taken until `maxMoves` ran out). A free move that should be
  taken repeatedly says `repeat: true`.
- **Worth.** `Move.value` is `Move.worth` and optional. `autoPlayer(game, { objective })` takes what the player is
  trying to grow (a number read off the state); a move with no `worth` is worth the objective after it less the
  objective before, tried and put back. Without `objective`, a move with no `worth` throws, naming the move. A move
  that does not move the objective at once (an unlock, a cap, a reset) needs a hand-written `worth`;
  `player.blind()` lists the moves whose worked-out worth never came above nothing.
- `autoPlayer` warns once when a feature has an action named `buy…` and declares no moves (`quiet: true` silences
  it). It returns an `AutoPlayer` (`look`, `blind`). New options: `objective`, `worthLooks`, `quiet`.
- `AutoStore` may have `trial(run)`.

<!-- SIM-EXTRA -->

## Tests (`watchpot/test`)

- New: `decimalComparisons({ tsconfig, under? })`, a typed check that fails on Decimals compared with `<`, `===`
  and the rest. The template runs it in `test/decimals.test.ts`; add the same file to an existing game. It needs
  `typescript` 7 (an optional peer).
- New: `plainParity` (above).

## Keeping your numbers

For a game whose fitted numbers and sim replay must come through unchanged, write the old defaults in explicitly:

1. Every cost curve that had no `round`: add `round: "none"`.
2. Every node with more than one rank and no `costGrowth`: add `costGrowth: 1.5`. Every `eventNodeRow` with more
   than one rank that passed no growth: pass `1.5`.
3. Every bare `produce` step: `{ pass: "both", run }`.
4. The sim: build the world with `{ tickMs }` set to what the game's sim stepped at (the old world default was
   60,000; `playStraight` and `runFit` were already 1,000), give every free move that relied on being taken many
   times in one look `repeat: true`, keep each move's hand-written worth (renamed from `value`), and start on
   `realSimStore` so the replay is the old code path; switch to `simStore` once `plainParity` passes.
5. Features that recorded a time from `initial`'s `now` on a new profile, a profile reset or an import now record
   game time. On a profile whose clock offset is 0 that is the same number.

<!-- NUMBERS-EXTRA -->

The pass mark is the game's own contract replay, byte for byte, before any refit.
