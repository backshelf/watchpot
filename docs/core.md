# watchpot/core

The kernel reference: features and the store, the vocabularies, gacha, the events framework and saves. The guide's chapters 3, 4 and 9 teach these, the pages for each system have a worked example, and `api/core/` has every signature.

## Core

A game is features. Each `feature` brings its saved state, its actions, its tick steps by phase, its prestige
reset rule and the keys that never save; `defineGame` lists them; `createIdleStore` runs them. The store's type
is read off the tuple, and a feature that touches another names it in `reach`, so nothing is typed by hand:

```ts
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  D,
  defineGame,
  feature,
  localStorageBackend,
  offlineCredit,
  ZERO,
} from "watchpot/core";

const wallet = feature({
  key: "wallet",
  initial: () => ({ gold: D(10), lifetime: ZERO }),
  actions: (api) => ({
    earn: (n: number) =>
      api.set((s) => {
        s.wallet.gold = s.wallet.gold.add(n);
        s.wallet.lifetime = s.wallet.lifetime.add(n);
      }),
  }),
});

const generator = feature({
  key: "generator",
  reach: [wallet],
  initial: () => ({ owned: 1, unlocked: { bronze: true } }),
  reset: { keep: ["unlocked"] },
  steps: {
    produce: {
      income: {
        pass: "tick",
        run: (s, ctx) => void (s.wallet.gold = s.wallet.gold.add((s.generator.owned * ctx.dtMs) / 1000)),
      },
      offline: {
        pass: "catchUp",
        run: (s, ctx) =>
          void (s.wallet.gold = s.wallet.gold.add(offlineCredit(ctx.dtMs, 0.5, 3_600_000).creditedMs / 1000)),
      },
    },
  },
});

const prestige = feature({
  key: "prestige",
  reach: [wallet, generator],
  initial: () => ({ runs: 0, shards: ZERO }),
  reset: "never",
  actions: (api) => ({
    ascend: () =>
      api.set((s) => {
        s.prestige.shards = s.prestige.shards.add(s.wallet.lifetime.div(100).floor());
        api.resetRun(s);
        s.prestige.runs += 1;
      }),
  }),
});

export const toy = defineGame({
  id: "toy",
  save: { key: "toy.save", version: 1 },
  features: [wallet, generator, prestige],
});
export const store = createIdleStore(toy, {
  storage: createGameStorage(localStorageBackend() ?? createMemoryBackend()),
  now: () => Date.now(),
});
```

`test/core/toy.ts` is this game with its tests around it.

- **The tick** runs the phases `guard, sync, rates, produce, automate, settle, commit, after`, each phase's
  steps in feature-list order, moved by any step's own `after` or `before` (a step id or a feature key in the same
  phase), the clock's last; `resolvedSteps(game, pass)` is the list, with ids `<featureKey>.<phase>.<name>`. A step
  returning `"stop"` ends its phase and skips every later phase before `commit`; `commit` (the clock's `lastSeen`)
  and `after` always run. A step is `(s, ctx) => …` or `{ pass, run, after?, before? }`, `pass` being `"tick"`,
  `"catchUp"` or `"both"` (the default); a `produce` step must name its pass. In a catch-up `ctx.dtMs` is the gap
  since `lastSeen`, and the engine's `offlineCredit(elapsed, rate, cap)` turns it into credited time (`catchUp`, its
  old name, is a deprecated alias; `codemods/0.18.0-offline-credit.ts` renames it; the store's `catchUp` action keeps
  its name).
- **Actions.** `actions(api)` returns the feature's actions; `api.set(recipe)` runs one immer recipe over the whole
  state and returns what the recipe returns (`buy: () => api.set((s) => wallet.draft.debit(s, "gold", 10))` reports whether
  it paid), and a recipe that returns a value still changes the state through the draft only. An action called
  inside a recipe (one `api.set` inside another, or an action from a step during `tick`, `catchUp` or a reset)
  throws, saying to call the feature's draft helper instead or to call the action after the recipe: its change would
  otherwise be lost. `defineGame` builds each `actions` once against a probe api, so a builder reads no state or store
  while it is built, and refuses an action named like a key of its feature's `initial` and a game action named like
  a feature's key. An `after` or `before` that names no step of that phase throws, naming the feature.
  `type Draft` is exported from `watchpot/core`.
- **The clock** (`createdAt`, `lastSeen`, the offset behind `gameNow()`) is a built-in feature under `clock`, or,
  for a game that already saves the fields, `clock: { feature, lastSeen, createdAt, offset }` names them. Its
  steps: `clock.guard.dt` (a tick with no time skips every phase after `guard` and commits; it runs last in `guard`,
  so the features' own `guard` steps still run on it), `clock.guard.createdAt` (set once, on catch-up),
  `clock.produce.gap` (a catch-up always syncs; with no gap it stops `produce` after the features' `produce` steps,
  which run with `dtMs` 0, so they guard a zero gap themselves), `clock.commit.lastSeen`. The interval clock pays a
  return to the tab after no more than `awayAfterMs` (5 s by default) as live ticks in `maxStepMs` slices, like a
  long frame: an alt-tab is not time away. Only a longer gap goes to `onAway` and the catch-up, at the offline rate.
- **Resets.** `resetRun` follows each feature's `reset`: `"run"` (the default, back to `initial`), `"never"`,
  `{ keep }`, `(before, fresh, ctx) => after`, or `{ depth, rule }`: untouched by a reset shallower than `depth`
  (`resetRun({ depth })`, 1 by default; `definePrestige({ depth: 2 })` is a layer above another, and the lower layer says
  `reset: { depth: 2 }` so the higher one starts it over); the clock's anchors land on now, its offset kept. `resetProfile`
  puts everything back and zeroes the offset. `initial(ctx)` sees `now`, an `rng` (seeded from the store's `seed`)
  and why it is being made (`new`, `reset`, `run`, `import`). A run reset with no `rng` draws `rng("run:<createdAt>")`,
  labelled by the start of the run that ends, which the save holds: a reload between resets draws the same. A new
  profile and an import get the same first draws (the seed's own stream), so a slice a save lacks starts the same
  whether the profile was imported or the run carried on: a seeded replay from a save does not part ways.
- **Saves.** Each feature's state saves under its key, minus `transient` keys, as tagged JSON (Decimals survive).
  On load a missing key takes its default, a plain-object default fills one level down, a Decimal default coerces
  a number, then the feature's `merge(merged, fresh)` runs. An older save comes forward through the migrations,
  or is kept aside and starts a fresh profile; a newer one is copied to `<key>.kept` and the store writes nothing.
  The section Saves below has the rules.
- **Derived values.** `derived: { perSecond: (s) => … }` declares values worked out from the state. Each joins the
  slice under its name, typed by what it returns, and is never saved and never written (a write throws). The engine
  works it out on load and reset, and again whenever a slice it read was changed by a step or a recipe, so it is
  current as of the start of whatever reads it. One may read another; the engine orders them and throws on a loop.
  The function sees the feature's saved state and its reach, and reads no clock and no rng: a value that needs `now`
  is worked out in a `rates` step into a `transient` field instead.
- **Reach.** `reach: [a, b]`, or `reach: () => [a, b]` to name a feature declared further down. Two features that read
  each other name one side by its state type, `reach: reach<{ lid: LidState }>()` (alone or in the list);
  `defineGame` checks the game lists a feature under that key with that state. Every factory takes `reach` too.
- **Helpers over any store:** `flushSave`, `saveBlocked`, `saveBlockedBy` (why: `newer`, `taken`, `unreadable` or
  `cleared`, the first cause winning; null while saving), `saveSetAside` (why the save found at load was kept aside
  for a fresh profile: `old-version` or `migration-failed`; null when none was), `saveStatus`, `watchSave`,
  `clearSave` (blocks writes, then removes the save and its kept copy, so neither a pending write nor the hide flush
  puts it back; a promise on an async backend), `watchOtherTabs` (the two-tab guard; it warns on the console when
  another tab takes the save, and the caller stops its own clock) and `startGameClock(store, options)`, which binds
  the interval clock to `tick` and `catchUp`. The store flushes its own save when the page hides (`pagehide`, and
  `visibilitychange` to hidden), clock or no clock, and adds no listener without a `window` and a `document`;
  `holdHideFlush(store)` turns that off for a caller that flushes on hide itself and returns the release.
- **Moves.** A feature may declare `moves(state)`: what a player can do with it now, as `Move`s (`id`, an optional
  `cost: { currency, amount }`, an optional `worth(state)`, `repeat?` for a free move taken more than once a look,
  `apply(store)`, true when it went through). The store never calls it; the sim's auto-player does, and works out a
  missing worth from its `objective`. The state a move sees carries the feature's own actions. Factories that buy
  (generators, trees, the clicker) declare their own; `definePrestige` takes `worth`; any other feature a factory made
  takes moves through `withMoves(feature, moves)`.
- **One wall read.** `createIdleStore` takes `now` (required) and `entropy`; the engine never reads the wall.
- **Formatting.** `fmt(value, options)` gives `{ text, mantissa, suffix, negative }`: plain digits, then a suffix
  (K to Dc), then `1.23e45`. `notation: "scientific"` skips the suffixes: plain digits below `plainBelow`, then
  `1.23e45`, an exponent of 1,000 or more grouped (`1.50e1,000`). `decimalsBelow` keeps `decimals` to values under
  it. The small printers: `fmtTimes` (`×3.20`), `fmtPlus` (`+0.50`), `fmtRate` (`12.5/s`), `fmtCounted(value, [one,
  many])` (the singular exactly at 1) and `fmtPlayed(ms)` (`4h 25m`, `12m 03s`). `formatter(options)` binds `num`,
  `times`, `plus`, `rate` and `counted` to one set of options, so a game sets its notation once.
- **Stats.** One stat system. An effect is `{ stat, add }` or `{ stat, mul }`, its amount a number or a function of the
  state; one order, `(base + every add) × every mul`, then the softcap, then the hardcap, in Decimals.
  `defineStats({ key, vocab, reach, stats: { id: { base, softcap?, hardcap? } }, flags?, sources?, contributions?, label?,
  muted? })` is a feature that serves every stat as a derived value (`s.stats.output`, a Decimal, never saved, worked
  out again only when a slice it read may have changed): each base declared once (no default), `sources` declared with
  `label`, `owner`, `group`, `active` and `times`, and `contributions(state)` taking what the factories'
  `contributions` hand back (one effect repeated by one source is one breakdown row with `times`). An effect may read
  another stat; two that read each other throw. `select.explain(state, id)` is the breakdown (`parts` with `op`,
  `value`, `times`, `quiet` and `muted`: a muted group's rows stay listed and stop counting, its flags stay raised).
  Underneath, `statIndex({ base, caps }).add(source, meta)` and `.over(q, { muted, extra })` give one graph over one
  state, for a state that never lives in the store (`docs/stat-graph.md`).
- **Time away, in steps.** `offlineSteps(elapsedMs, { capMs, rate, maxSteps, minStepMs })` (formerly `catchUpSteps`, a
  deprecated alias) is `offlineCredit` plus `steps` and `stepMs`, for a game whose growth compounds and must replay its
  own tick rule over an absence (`docs/time-away.md`).
- **The journal.** Rules that run on plain state tell the page what happened by writing lines: `pushLine(log, line,
  keep = 40)` appends to a capped log (it works on an immer draft), and `linesSince(log, last)` is the lines after a
  cursor: all of them for `undefined`, none when the cursor is not in the log (a swapped profile is not news).
  `JournalLine` is `{ at, kind, text }`; `useNews` ([`watchpot/react`](react.md)) is the cursor as a hook.
- **Marking words in text.** `lexicon(entries)` makes a list of `{ id, words }` ready (every spelling of a term, a
  phrase with spaces, hyphens or apostrophes included), and `annotate(lex, text, allow?)` hands `text` back in
  `Segment`s, each plain or `{ text, id }`: whole words only, any case, the longest phrase at a word wins, and each
  entry is marked once, where it first turns up. `allow(id)` leaves an entry out (a term the player has not met).
  The segments joined are the text exactly, so the page draws them in place of the string. `annotator(lex)` is
  `annotate` with a capped memory by `scope` (whatever `allow` depends on, as a string), handing the same array back
  for the same text: for content strings drawn again and again, never a text with a moving figure in it. A glossary
  whose terms carry a tip wherever they turn up is this and `HoverTips` (`docs/ui.md`):

  ```tsx
  const terms = lexicon(GLOSSARY.map((t) => ({ id: t.id, words: [t.name, ...t.alsoSaid] })));
  const mark = annotator(terms);
  const segments = mark(item.line, [...met].join(), (id) => met.has(id));
  segments.map((seg, i) => (seg.id ? <span key={i} data-tip={seg.id}>{seg.text}</span> : seg.text));
  ```
- **Watching changes.** `watchChanges(store, { rules, on, jumped?, settleMs?, startMs?, whileSettling?, now? })`
  runs the game's rules over each change (the state before and after) and sends the events they emit, typed by the
  game, in order. A change `jumped` calls a load settles, and so does an import or a profile reset on an engine
  store (`store.profileSwaps()` counts them): for `settleMs` (and `startMs` at the start) nothing they
  emit goes out, and their bests and streaks are forgotten; rules run meanwhile unless `whileSettling: "skip"` (a
  rule given as `{ rule, whileSettling }` decides for itself). Each rule gets `tools`: `settling`, `spare(kind, ms)`,
  `best(kind, value)` (the best it beat, or undefined; Decimals, so any size), `defineStreak(kind, windowMs)`. A rule that throws is reported, never thrown into the action that changed the
  store. `crossedMark(marks, before, after)` and `newKeys(before, after)` are the usual reads (`docs/feel.md`).
- **Settings.** `defineSettings({ key, initial })` is the feature every game writes: the player's choices under `key`, kept
  through a run reset, with one action, `change(patch)`. `resetProfile` puts them back with everything else.
- **Seen once.** `defineSeenOnce({ key })` is the other one: the saved set of what has been shown the first time (a
  page that introduces itself, a tip, a new tab's mark, a tutorial card), kept through every run reset. The ids are
  the game's; `state[key].seen[id] === true` is the read. `see(id)` marks one and returns whether it was new,
  `seeAll(ids)` marks several in one change, `forget(id)` makes one new again; an action that changes nothing
  writes nothing.

## Vocabularies

A game's words, its currencies, stat ids and rarities, are declared once as const tuples, and every engine type
that names one is read off that declaration; the engine names none of its own.

```ts
import { defineGame, type OddsTable, type PriceOf, type RarityOf, type RewardOf, vocab } from "watchpot/core";

export const TOY = vocab({
  currencies: ["gold", "gems"],
  stats: { speed: "toy.speed" }, // a tuple of ids, or a record whose values are the ids
  rarities: ["common", "rare", "epic"], // lowest first
} as const);

export type Reward = RewardOf<typeof TOY, { kind: "chest"; count: number }>;
export type Price = PriceOf<typeof TOY, { currency: "cents"; amount: number }>;
export const ODDS: OddsTable<RarityOf<typeof TOY>> = { common: 80, rare: 15, epic: 5 };

export const toy = defineGame({ id: "toy", save: { key: "toy.save", version: 1 }, features: [], vocab: TOY });
```

- **`vocab({ currencies, stats, rarities })`** returns a `Vocab<C, S, R>`: `currencies` and `stats` as lists,
  `rarities` as a `Ladder<R>`. A repeated word throws, naming it. `CurrencyOf<V>`, `StatOf<V>` and `RarityOf<V>`
  are the unions. `stats` and `rarities` are optional: left out, they are empty and `rarities` is a ladder of `size`
  0 (`ladder([])` called directly still throws, and `gacha` refuses an empty ladder when it is defined). Lists
  written inline keep their words without `as const`; a list declared on its own line needs it.
- **`Ladder<R>`** (also `ladder(ids)` on its own): `ids` lowest first, `size`, `indexOf`, `at`, `next` (undefined
  at the top), `atLeast(r)` (the rung and every rung above), `isAtLeast(a, b)`, `compare` (a sort comparator,
  lowest first) and `has(string)`, a guard for parsed or saved values.
- **`RewardOf<V, Extra>`** is one `{ kind: <currency>; amount: DecimalSource }` per currency plus the game's own
  kinds. An `Extra` member whose `kind` is a currency replaces that currency's plain member, so one currency's
  reward can carry an extra field. **`PriceOf<V, Extra>`** is `{ currency: CurrencyOf<V>; amount }` plus the game's
  own price shapes. **`OddsTable<R>`** is a weight per rung.
- **Graphs and yields take the words too:** `NodeCost<C>`, `GraphNode<E, C>`, `rankCost`, `checkRank` and
  `NodeFailure<C>` are generic over the currency (default `string`); `Yield<A>` is generic over the game's own
  action union.
- **The game holds it.** `defineGame({ vocab })` carries it as `game.vocab` (`undefined` without one), and
  `GameVocab<typeof game>` types it back. A feature built over a vocabulary records it in `vocab`, and
  `defineGame` refuses that feature unless the game declares the same object. A feature is typed by its words
  through the factory that builds it (`defineCurrencies({ vocab })`); `feature()` takes no vocabulary type parameter.

## Gacha

A rarity draw over the game's ladder, with hard pity floors, soft pity ramps and published odds, and a feature
that owns a set of boxes around it. The kernel names no rarity: a box's guarantees are floors on the ladder.

```ts
import { catalogueRoll, defineGacha, type PityRule } from "watchpot/core";

const RULE: PityRule<"common" | "rare" | "epic"> = [
  { rarity: "rare", within: 10 }, // a rare or better within 10 pulls
  { rarity: "epic", within: 50, softFrom: 40 }, // an epic within 50, its chance ramping up from pull 41
];

export const summon = defineGacha({
  key: "summon",
  ladder: TOY.rarities,
  vocab: TOY,
  odds: { banner: { common: 80, rare: 18, epic: 2 } },
  pity: { banner: RULE },
  roll: catalogueRoll(HEROES), // the post-draw roll: what a pull of that rarity gives
});
```

- **The kernel** (pure; the caller passes its ladder, odds, counters, rule and rng): `drawRarity(ladder, rng, odds,
  pity, rule)` returns `{ rarity, pity, rng, triggered }`. Draw order is fixed, so a saved rng replays the same pull:
  the highest floor due sets the floor, then each soft ramp above it (highest first) takes one float while its extra
  chance is above 0, then the weighted draw, which the floor lifts. A floor applies only where the table can drop
  its rung or above. `triggered` is the floor's rung, `soft-<rung>` or null (`PityTrigger<R>`).
- **Its types.** `PityFloor<R>` `{ rarity, within, softFrom? }`, `PityRule<R>` (a list of floors), `PityState<R>`
  (pulls since each floor's rung last dropped, `freshPity(rule)` at zero).
- **The rest:** `rollRarity` (no pity), `softPityExtra(pull, floor)`, `publishedOdds(ladder, odds)` (highest rung
  first, empty rows dropped), `pullsUntilPity(ladder, pity, rule, odds)` (the countdown per reachable floor),
  `canReach`, and `drawMany(ladder, box, odds, rule, pity, rng, count, roll)`: pulls in sequence, each a rarity then
  the post-draw roll, for a game that keeps its own state.
- **`defineGacha({ key, ladder, odds, pity, roll?, reset?, vocab? })`** is a feature over `GachaState`: `pity`, `rng` (its
  own stream, seeded from the profile's first draws and its key), `opened`, `tokens` and `lastOpen`, per box (the
  odds table's keys). Actions: `open(box, count)` (free: tokens first) and `grant(box, count)`. It charges nothing:
  a game's paying action takes its price and calls `summon.draft.open(draft, box, count)` in the same recipe
  (`summon.def` holds `ladder`, `boxes`, `odds` and `pity`; `summon.select` is empty). A
  prestige reset keeps it whole unless `reset` says otherwise. Without `roll` a pull's item is its rarity;
  `catalogueRoll(entries)` picks evenly among the entries of the drawn rarity.

A game may keep its boxes in its own slices instead (pity fields under its own names, cards carrying much more than
a gacha's state): it maps its named rule and counters onto the kernel, draws through `drawRarity`, and makes a
post-draw roll through `drawMany`.

## Events

Timed events: windows, a runtime per event, the trickle and its caps, a cycle tree and a mastery tree, milestones, a
shop, a pass, the autopilot's share and the band a finished cycle earned. All of it is pure functions over data;
the game's events feature keeps the runtimes and calls them.

Shelf page: [docs/events.md](docs/events.md).

```ts
import { type EventDefinition, eventNodeRow, freshRuntime, regenEventCurrencies } from "watchpot/core";

type Effect = { kind: "speed"; mult: number } | { kind: "keep"; node: string; ranks: number };
type Reward = { kind: "gold"; amount: number };

const stall = eventNodeRow<Effect>("ore"); // a tree's rows, priced in one currency

export const FAIR: EventDefinition<Effect, Reward, "harvest"> = {
  id: "fair",
  name: "The fair",
  tagline: "Roll up.",
  schedule: { kind: "rolling", durationMs: 7 * 86_400_000 },
  currencies: [
    {
      id: "tickets",
      name: "Tickets",
      glyph: "ticket",
      start: 3,
      cap: 5,
      regen: { amount: 1, everyMs: 3_600_000 },
    },
  ],
  upgrades: [stall("stall", "Stall", "Sell faster.", 10, 3, [], [{ kind: "speed", mult: 1.1 }])],
  milestones: [
    { id: "first", name: "First sale", stat: "sold", threshold: 1, rewards: [{ kind: "gold", amount: 5 }] },
  ],
  shop: [],
  stats: ["sold"],
  pass: { name: "Fair pass", line: "", priceCents: 499, stat: "sold", unit: ["sale", "sales"], tiers: [] },
  fuel: [{ on: "harvest", per: 0.2, currency: "tickets" }],
};

const runtime = regenEventCurrencies(FAIR, freshRuntime(FAIR, 0), 10 * 3_600_000); // tickets: 5, the cap
```

- **`EventDefinition<E, R, A>`** is generic over the game's words: `E` what a node does (any `{ kind }` union),
  `R` what a milestone, a shop item or a pass tier pays, `A` the actions that pay fuel (`EventFuel<A>`, a
  `Yield<A>` with a currency). Two effect kinds are the framework's own: `keep` (`KeepEffect`) and `head-start`
  (`HeadStartEffect`), which a mastery tree uses to start each cycle further on.
- **Windows:** `resolveWindow(schedule, now, anchor?)` over a fixed, repeating or rolling `EventSchedule`.
- **Runtimes:** `freshRuntime`, `regenEventCurrencies` (whole periods, parked at the cap), `eventCurrencyCap`,
  `msUntilRegen`; the bag the game builds from its own stats is an `EventBag` (`NO_BAG` the neutral one), and
  `autopilotShare(bag, id)` reads the `AUTOPILOT` stat. `Autoplay` is a definition's pure benched play.
- **Trees, shop, pass:** `eventNodeRow`, `eventNodeCost`, `checkEventNode`, `buyEventNode`, the mastery's
  `checkMasteryNode` and `buyMasteryNode`; `checkEventShopItem`, `buyEventShopItem` (with an `OwnsReward` check);
  `dueMilestones`; `passTiersReached`, `passProgress`, `checkPassClaim`; `cycleBand` (bronze at one milestone,
  silver at half, gold at all). Failures are `EventFailure`s (`isEventFailure`).
- **Boards.** What one event keeps beyond its runtime (a dig's layer, a road's token) is an `EventBoard`:
  `{ id, key, initial, prepare?, createActions }`, saved under `key` inside the game's events feature. A game makes
  one `boardRegistry()`; each event's folder calls `register(board)` as it loads, and the events feature reads them
  back in the game's event order (`list(order)`, which refuses a board for an event the game does not list) and
  composes them (`composeBoards(boards, { keys, actions })`: their initial states under their keys, each event's
  `prepare` for the sync, their actions merged), refusing a repeated key or action or one the feature keeps for
  itself. Read the registry when the store is built, not while modules load: boards and the store's own modules
  usually import each other.

## Saves

The store saves every feature's data under the game's `save.key` with `save.version` beside it, through a
`GameStorage` (`createGameStorage(backend, options)`: tagged JSON, debounced writes, `flush`, `block`, `keep`).

- **Migrations.** A step takes a save from one version to the next and is keyed by the version it produces (`3`
  takes a save at 2 to 3). The game's (`save.migrations`) see the whole saved state; a feature's (`migrations`)
  see only its own data, and their result lands under its key. On load and on import the store runs them from the
  saved version up, one version at a time: at each, the game's step, then the features' in feature order. The
  migrated save is written back at once at the current version. `defineGame` refuses steps that skip a version
  between the oldest declared and `save.version`, or a key past it; `oldestReadable(game)` is the oldest version
  they reach (`save.version` when there are none), and `migrate(state, from, to, game)` is the runner itself. A
  feature's step is not called when the save has no slice for it (the merge gives that slice its defaults), and
  Decimals are revived before any step runs. `savedRecord(saved)` reads a saved shape loosely, without a cast:
  `const old = savedRecord(saved); return { ...old, count: old.owned ?? 0 }`.
- **A save this build will not use.** Older than any step reaches, one a step throws on, or one that cannot be
  read: copied to `<key>.kept` (over an earlier copy), then a fresh profile. A migration that sets a save aside warns
  on the console naming the kept key, and `saveSetAside(store)` says why (`old-version` or `migration-failed`) for a
  page that tells the player; a save that cannot be parsed at all is still set aside with no such note, only
  `onError`. Newer: copied to `<key>.kept` only when no copy is there (the save stays safe under its key), and the
  store writes nothing this session (`saveBlocked`; `saveBlockedBy` is `newer`). An older export no step reaches is
  refused as `old-version`.
- **Loading a slice.** A saved `undefined` counts as missing. Under a Decimal default the loader reads a saved
  Decimal, number or string, and keeps the default for anything else or for NaN.
- **Backends.** A `StorageBackend` answers at once (`localStorageBackend()`, `createMemoryBackend()`): the store
  loads inside `createIdleStore`. An `AsyncStorageBackend` may answer with promises (IndexedDB, a native bridge):
  the store returns holding a new profile and loads after; `await store.hydrated` before play (it settles whatever
  the load found, once any kept copy has landed). Until then the store writes nothing, so play before the load can
  never land over the save. Writes go one at a time: one sent while another is answering waits, and the latest
  state wins. A storage over `createMemoryBackend()` is not durable unless `durable: true` says so, so
  `createGameStorage(localStorageBackend() ?? createMemoryBackend())` reports `saveStatus` "unsaved", not
  "saving", where nothing is kept; the same holds for `freshStore`. `debounceMs` (`SAVE_DEBOUNCE_MS`) is a
  fixed-window throttle, not a trailing debounce: the first change opens the window and its end writes the latest
  state.
- **A deeper fill.** The loader fills a plain-object default one level down. A feature whose state nests deeper calls
  `fillDeep(saved, fresh)` from its own `merge`: it fills a key a newer build added at any depth, keeps a saved key
  `fresh` lacks (an id-keyed record), coerces a saved number or string where `fresh` holds a Decimal, and treats an
  array as a leaf. It returns a new object and mutates neither side.
