# watchpot

## How this was made

Most of the code here was written by an AI model (Anthropic's Claude), working with a person who set the direction,
built games on it, reviewed what came back and decided what stayed. That goes for the tests and the docs too. It is
said here so nobody has to guess: read it, use it and judge it knowing that.

## Install

**Requirements:** Bun 1.4.3 or later (`engines.bun`; every typecheck script runs `bun check`, which older Bun does
not know).

watchpot is a private package installed by git tag, not from a registry. Each release is an annotated tag
`vX.Y.Z` (see `CHANGELOG.md`). In a game's `package.json`:

```json
"watchpot": "git+ssh://github.com/backshelf/watchpot.git#v0.17.0"
```

Bun runs git for a `git+ssh://` URL (HTTPS first, then SSH), so the machine's own git credentials serve the private
repository. `github:backshelf/watchpot#vX.Y.Z` and `git+https://github.com/...` go only to the api.github.com
tarball endpoint and 404 on a private repo (oven-sh/bun#19618), so do not use them. The game installs the peers in
`peerDependencies` itself. Write no user in the URL (`github.com`, not `git@github.com`): Bun's HTTPS try keeps it
as the username, and `gh auth git-credential` answers only for its own login. Once per machine: `gh auth login`,
then `gh auth setup-git`.

`package.json`'s `files` names what a consumer or the scaffold needs (`src/`, `api/`, `docs/`, `templates/`,
`codemods/`, the env declarations, the README and the changelog), and a packed tarball carries only those; Bun's git
install ignores `files` and checks out the whole tree. A game's typecheck needs no engine declarations: `watchpot/devtools`, the one entry with CSS modules, carries its own
references.

A page whose imports reach no CSS module needs no dev script: `bun ./index.html [--port=N]` serves it and hot-reloads
it. `watchpot/devtools` reaches one (the dev panel's), as does any game CSS module, so the template's `dev.ts` serves the
page with HMR off instead, working around Bun's CSS-module reload (oven-sh/bun#18258).

## Guide

New here? Read the guide in [`docs/`](docs/README.md) front to back: thirteen chapters that start at
[what watchpot is](docs/guide/01-what-watchpot-is.md), build [a first game](docs/guide/02-your-first-game.md) from an
empty folder, then show each concept on a real game. After it come the [showcases](docs/showcases.md), the
[glossary](docs/glossary.md) and the reference pages: one per task and one per system (a currency, a generator, an
upgrade tree, a gacha, a timed event with a board, a prestige layer, a migration, a pacing contract, the auto-player, a
theme, a sound table, a reveal, the dev-panel workflow, a live stat graph, time away, plan-and-fit, the fit kit), each with a
complete example in `docs/examples/` that `bun run verify` type-checks. The sections below are the reference. A new
game starts from the template, [`templates/game/`](templates/game/.scaffold/README.md), in one command:
`bun templates/game/.scaffold/new.ts <answers.json> <out> [--engine <tag>] [--no-install]` copies it, writes the game
from an answers file ([`answers.md`](templates/game/.scaffold/answers.md) is the reference,
`fixtures/smallest-clicker.json` the least one says), compiles its tokens, installs the engine (by default at this
engine's own version) and formats it, then prints the next steps; no agent or skill is needed (`/watchpot` is an
interview that writes the answers and runs it). A game has a `generators` or `dimensions` core, or a clicker alone,
and any of a clicker, an upgrade tree, a gacha, a prestige layer, an achievement wall and a visitor (spawns paying a
buff), every one on its engine system; the look is optional (system fonts, a default palette, no backdrop). The
template mounts the dev panel on `#dev`, and its sim judges the pacing contract on played hours.
Its about sheet holds the settings (sound, and "still the motion", saved by a
`settings` feature with no migration) and moves the save as text: "Copy save" puts it on the clipboard and in a box,
"Read save" loads a pasted one and refuses a bad one without changing anything. [`examples/orbital-orchard/`](examples/orbital-orchard/README.md) is the reference game:
scaffolded that way, then built out with every feature (an event with a board, the reveal, a pacing contract). It is
a workspace of this repository, so it runs on the engine's own source and an engine change reaches it at once. Every export carries a TSDoc line; the declarations are in [`api/`](api/).

## Developing the engine and a game together

1. Change the engine; `bun run verify`, commit (an export change regenerates `api/`).
2. Release it: bump `version`, add a `CHANGELOG.md` line, `bun run gates`, `git tag -a vX.Y.Z -m vX.Y.Z`, push the
   branch and the tag.
3. In the game, change the tag in `package.json` and run `bun install`. A breaking release names its codemod in
   `CHANGELOG.md`; run it from the game's root, `bun node_modules/watchpot/codemods/<file>.ts [--write]`
   ([`codemods/README.md`](codemods/README.md)).

To try an unreleased engine change in a game before tagging it, point the dependency at a sibling checkout,
`"watchpot": "file:../watchpot"`, and run `bun install`. Restore the tag before committing the game: a `file:`
dependency builds nowhere else.

`node_modules` links are absolute paths: after moving or renaming the checkout's folder, run `bun install` again, or
`bun check`, Biome and the examples fail on links into the old location.

## What it is

A framework-light idle-game engine, a Bun package in its own repository. Twelve entries: `watchpot/core` (kernel:
Decimals, formatting, rng, time, clock, save codec, stats; the feature store, the vocabularies, the systems and the
events framework below), `watchpot/sim` (the sim lab), `watchpot/test` (the test kit), `watchpot/react` (the store
hooks, the clocks, the runtime, boot, hotkeys, news, prefs, and the page layout; it reaches no stylesheet), `watchpot/devtools` (the
dev panel and the sound desk, the one entry with a stylesheet; a game imports it in its dev build), `watchpot/kit` (effects with
no look and the reveal's mechanism; plus `watchpot/kit/theme`, the token compiler), `watchpot/sound` (the sound
engine on its own; plus `watchpot/sound/pack`, the build-time sample-pack pipeline), `watchpot/ui` (headless primitives), `watchpot/shader` (a container for a game's own fragment
shaders) and `watchpot/three` (3D on three and r3f). The package never imports `src/`; `core` and `sim` never import
React. The engine reads no wall clock for game time: the caller passes `now` (`test/rules/wall-clock.test.ts`), while
duration timers for motion and pacing default to `performance.now()`. Its tests live in `test/<entry>/`.

**The split: mechanism and behaviour from the engine, every look from the game.** The engine owns state, rules,
timing, keyboard, focus, ARIA, `data-*` state, effects' motion and the GPU plumbing; it ships no stylesheet (the dev
panel's self-contained CSS aside) and the kit writes no class name of its own (`test/rules/headless.test.ts` checks
both); by convention it also sets no font, no colour and no English default outside the dev panel. A game's look lives in its own `src/ui/`: thin wrappers over `watchpot/ui` with a CSS
module each, copied in from the template's registry ([`templates/game/src/ui/`](templates/game/src/ui/README.md),
the token contract and every component) and then restyled, rewritten or deleted as the game's own. Its backdrops,
foils and transitions are its own GLSL run by `watchpot/shader`.

A game imports its hooks from `watchpot/react` (the template does). `watchpot/react` holds the store hooks, the clocks, `useGameClock`
(the running clock and the other-tab watch alone: `useGameRuntime` without the motion, scheme and sound), `useBoot`,
`useHotkeys`, `useNews`, `useLayerSwap`, the page layout and the tab title, the same bindings as `watchpot/react`, and
the runtime hooks, on an entry that reaches no stylesheet (`test/rules/react-entry.test.ts`).

`@number-flow/react` (the kit's `Ticker`) and `canvas-confetti` (the kit's `burst`) are optional peers: only
`watchpot/kit` reaches them (`test/rules/peers.test.ts` walks the imports of every other entry and proves it).
Install them when the game imports the kit. The other optional peers serve one entry each: `zzfx` is
`watchpot/sound`'s (loaded on the first sound), `three` and `@react-three/fiber` are `watchpot/three`'s, and
`@testing-library/react` is `watchpot/test`'s `renderWith`.

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
  steps in the game's `order` first and then in feature-list order, the clock's last; `resolvedSteps(game,
  pass)` is the list, with ids `<featureKey>.<phase>.<name>`. A step returning `"stop"` ends its phase and skips
  every later phase before `commit`; `commit` (the clock's `lastSeen`) and `after` always run. A step is for both
  passes unless written `{ pass: "tick", run }` or `{ pass: "catchUp", run }`; in a catch-up `ctx.dtMs` is the gap
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
  a feature's key. An `order` error names the feature and why: no such feature, a step of another phase, or no step
  by that name. `type Draft` is exported from `watchpot/core`.
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
  (`resetRun({ depth })`, 1 by default; `prestige({ depth: 2 })` is a layer above another, and the lower layer says
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
- **Derived transient state.** A feature's `derive(draft, { now, reason })` works out its transient values (stats
  folded from the rest, a rate) and the store runs it, in feature order, wherever the transient state is made fresh:
  a new store, a load, an import, a profile reset and a run reset. So the first pass's `guard` and `sync` steps never
  read an empty value before `rates` refolds it. It must be pure; `docs/stat-graph.md` › The first pass after a load.
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
  `cost: { currency, amount }`, `value(state)`, `apply(store)`, true when it went through). The store never calls it;
  the sim's auto-player does. The state a move sees carries the feature's own actions. A feature a factory made
  (`currencies`, `prestige`) takes them through `withMoves(feature, moves)`.
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
  `JournalLine` is `{ at, kind, text }`; `useNews` (React, below) is the cursor as a hook.
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
  `best(kind, value)` (the best it beat, or undefined; Decimals, so any size), `streak(kind, windowMs)`. A rule that throws is reported, never thrown into the action that changed the
  store. `crossedMark(marks, before, after)` and `newKeys(before, after)` are the usual reads (`docs/feel.md`).
- **Settings.** `settings({ key, initial })` is the feature every game writes: the player's choices under `key`, kept
  through a run reset, with one action, `change(patch)`. `resetProfile` puts them back with everything else.
- **Seen once.** `seenOnce({ key })` is the other one: the saved set of what has been shown the first time (a
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
  through the factory that builds it (`currencies({ vocab })`); `feature()` takes no vocabulary type parameter.

## Prestige

`prestige({ key, gain, … })` is a feature factory for a layer above the run. It owns `runs`, `lifetime` (every unit
paid while its own state lasts), `runStart`, the run's best reset `peak`, and `currency` unless it pays into a wallet;
and one action that pays the gain and calls the store's `resetRun`. Everything else in the layer (a tree to spend on,
offers, a phase) is the feature's own state and actions beside it:

```ts
import { powerGain, prestige } from "watchpot/core";

const ascension = prestige({
  key: "ascension",
  action: "ascend", // the reset action's name; default "reset"
  reach: [wallet],
  initial: () => ({ lastGain: "0" }), // the layer's own fields
  gain: (s) => powerGain(s.wallet.lifetime, { k: 1, exp: 0.5, per: 1000 }),
  afterReset: (s, { gain }) => void (s.ascension.lastGain = gain.toString()),
});
// store.getState().ascension.ascend() → whether it ran
```

- **The reset**, inside one recipe: `canReset(draft)` (default: the gain is above zero; it may settle the draft
  first), `beforeReset(draft)` (end what the gain should count), `gain(draft)` added to `lifetime` (and to
  `currency` when the layer holds it), `resetRun` at `now` (the action's argument, default game time) with the rng
  `runLabel(runs + 1)` (default `run<n>`, read off saved state so a seeded store draws the same runs after a reload),
  the gain credited to the `payInto` wallet, `runs` counted, then `afterReset(draft, { gain, now, run })`. The action
  returns whether it ran.
- **One ledger.** `payInto: { wallet, currency }` credits the reset to a wallet currency (which must outlive the
  layer's own reset: `depth: { shards: "never" }` on the wallet) and leaves no `currency` on the slice;
  `layer.select.held(state)` reads what is held either way.
- **When to reset.** Every layer keeps its reset pace: `resetPace(gain, kept, seconds into the run, floorS)`, how
  fast a reset would grow what it pays into, in orders of magnitude a second (`log10(1 + gain / kept) / seconds`).
  Its `settle.pace` step keeps this run's best in `peak`; a run start (its own reset or a deeper one) zeroes it and
  moves `runStart`. The slice serves `pace`, `peakShare` (the pace over the best) and `pastPeak` as derived values,
  so an autobuyer, a sim's player and a "past its peak" light on the page read one number. `pace: { past, floorS,
  kept }` tunes it (defaults 0.8, 1 and the layer's `lifetime`).
- **`select`, `def`, `draft`.** `layer.select` has `held`, `gain`, `runSeconds(state, now)` and `pace(state, now)`;
  `layer.def` the action's name, depth, pace tuning and `payInto`; `layer.draft.<action>(draft, { now, resetRun })`
  runs the same reset in a recipe the caller already holds (an autobuyer's `run` passes `ctx.now` and
  `ctx.resetRun`). `depth` makes it a layer above another layer and `reset` says what a deeper reset does to this
  one (Core › Resets).
- **The layer's own actions** come from `actions(api, reset)`; `reset` is the reset action, to wrap or call.
  `reach`, `steps`, `transient`, `migrations` and `merge` are `feature`'s.
- **Curves.** `powerGain(amount, { k, exp, per, mult })` is `floor(k × (amount / per) ^ exp × mult)`, never
  negative; `lifetimeMultiplier(lifetime, { k, exp })` is `1 + k × lifetime ^ exp`, exactly 1 with nothing earned.

## Gacha

A rarity draw over the game's ladder, with hard pity floors, soft pity ramps and published odds, and a feature
that owns a set of boxes around it. The kernel names no rarity: a box's guarantees are floors on the ladder.

```ts
import { catalogueRoll, gacha, type PityRule } from "watchpot/core";

const RULE: PityRule<"common" | "rare" | "epic"> = [
  { rarity: "rare", within: 10 }, // a rare or better within 10 pulls
  { rarity: "epic", within: 50, softFrom: 40 }, // an epic within 50, its chance ramping up from pull 41
];

export const summon = gacha({
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
- **`gacha({ key, ladder, odds, pity, roll?, reset?, vocab? })`** is a feature over `GachaState`: `pity`, `rng` (its
  own stream, seeded from the profile's first draws and its key), `opened`, `tokens` and `lastOpen`, per box (the
  odds table's keys). Actions: `open(box, count)` (free: tokens first) and `grant(box, count)`. It charges nothing:
  a game's paying action takes its price and calls `summon.draft.open(draft, box, count)` in the same recipe
  (`summon.def` holds `ladder`, `boxes`, `odds` and `pity`; `summon.select` is empty). A
  prestige reset keeps it whole unless `reset` says otherwise. Without `roll` a pull's item is its rarity;
  `catalogueRoll(entries)` picks evenly among the entries of the drawn rarity.

A game may keep its boxes in its own slices instead (pity fields under its own names, cards carrying much more than
a gacha's state): it maps its named rule and counters onto the kernel, draws through `drawRarity`, and makes a
post-draw roll through `drawMany`.

## Currencies

`currencies({ key, vocab })` is a feature holding a Decimal balance per currency of the vocabulary, at the top of its
state (`s.wallet.gold`), with the totals the game names kept beside them:

```ts
import { currencies } from "watchpot/core";

export const wallet = currencies({
  key: "wallet",
  vocab: TOY,
  start: { gold: 30 }, // every other currency starts at zero
  depth: { gems: "never" }, // gold goes with every reset (depth 1); gems with none
  earnedThisRun: { gold: "goldThisRun" }, // every credit of gold since the gold was last wiped
  earnedEver: { gold: "goldEver" }, // every credit of gold ever: no run reset touches it
  spentEver: { gems: "gemsSpent" }, // every debit of gems ever
  extra: () => ({ dust: D(0) }), // the game's own fields beside the balances
  actions: ({ set }, w) => ({ claim: () => set((s) => w.draft.credit(s, "gems", 5)) }),
});
```

- **Reset depth and totals.** `depth` says per currency how deep a reset must be to wipe it back to `start`
  (default 1; `"never"`); `wallet.def.depth` reads them back. `earnedThisRun` / `spentThisRun` totals go with their
  currency; `earnedEver` / `spentEver` totals stay through every run reset. `reset` covers the `extra` fields only.
  `reach` is `feature`'s, for `actions` that read other features.

- **Actions:** `credit(currency, amount)` and `debit(currency, amount): boolean`, plus the game's own from `actions`.
  Credit ignores an amount of zero or less; debit refuses (false, nothing touched) what the balance cannot cover.
  They sit beside the balances, so `credit`, `debit` and `__proto__` (`RESERVED_CURRENCY_FIELDS`) are no currency's,
  total's, extra's or game action's name: the factory throws naming the clash.
- **`draft`, `select` and `def`** on the feature, for recipes and steps (`actions` receives the same object as its second argument): `wallet.draft.credit(draft, c, n)`, `wallet.draft.debit(draft, c, n)`,
  `wallet.select.balance(draft, c)`, `wallet.select.canAfford(draft, c, n)`, and `wallet.draft.purse(draft)`, a `Purse` (`balance`,
  `debit`) for a tree or a shop to pay from. `wallet.def.currencies` is the list.
- It records its vocabulary, so `defineGame` refuses it unless the game declares the same one. A total for a word the
  vocabulary lacks, or a field name used twice (by a currency, a total, `credit` or `debit`), throws.

## Upgrade trees

Ranks bought one at a time over `GraphNode`s (`rankCost`, `checkRank`), each rank's effects handed to the game's stats.

- **`tree({ id, nodes, milestone? })`** is the rules over a ranks record the game keeps wherever it saves it:
  `node(id)`, `price(node, owned)` (null at the last rank), `check(id, ranks, balance)`, `buy(ranks, id, purse)` (checks,
  debits every currency of the price, raises the rank), `affordable(id, ranks, balance, limit?)` and
  `buyMax(ranks, id, purse, limit?)` (as many ranks as the balances cover, in closed form; `docs/upgrade-tree.md`),
  `buyCheapest(ranks, purse, { open?, limit? })` (one rank at a time across the tree, always the cheapest by the first
  line of its price, ties in node order, until nothing more can be bought; a free node with no last rank is skipped
  unless a `limit` is given) and `contributions(ranks)`, sourced `<id>:<node>`. A
  `milestone: { every, effect }` adds `effect(e)` of each of a node's effects at every `every`th rank. A repeated node
  or a requirement outside the tree throws. `rankContributions(source, nodes, ranks, milestone?)` is that list alone.
- **`BuyResult<C>`** is `{ ok: true, id, level }` or `{ ok: false, code }` with `code` `unknown`, `closed` (the
  tree feature's `open` refuses the node), `maxed`, `requires`
  (and `node`) or `cannot-afford` (and `currency`, `balance`, `price`).
- **`treeMoves(key, nodes, worth)`** is the auto-player's moves over an `upgradeTree`. A tree has no moves of its
  own, so the sim never buys from it until the game wraps it: `withMoves(tree, treeMoves(...))`.
- **`upgradeTree({ key, nodes, wallet, milestone?, open?, reset? })`** is a tree as a feature: it saves `{ ranks }`
  under `key`, buys with `buy(id)`, `buyMax(id, limit?)` and `buyAll(limit?)` (`buyCheapest` through the feature's
  `open`) from a currencies feature, and carries its rules as `.tree` for the game's `stats` feature
  (`contributions: (s) => mine.tree.contributions(s.mine.ranks)`). `open(state, node)` holds a node back until the game offers it
  (a closed one refuses as `closed`); the feature's own readers `open(state, id)`, `check(state, id)` and
  `affordable(state, id, limit?)` read it the way its actions do, so a screen never offers a node `buy` refuses.
  `.tree`'s readers know nothing of `open`. A run reset clears the ranks unless `reset` says otherwise.

## Loadouts

A few slots, the items a player holds, and what the slotted items do together. The rules are pure over a slots record
the game keeps; the effect type is the game's own (with the engine's `Effect`, `contributions` feeds a `stats` feature).

Shelf page: [docs/loadouts.md](docs/loadouts.md).

```ts
import { type Effect, feature, loadoutFeature } from "watchpot/core";

export const bag = feature({ key: "bag", initial: () => ({ held: ["cap", "mitt"] as string[] }) });

export const kit = loadoutFeature({
  key: "kit",
  slots: [{ id: "head", kind: "hat" }, { id: "hand", kind: "tool" }, { id: "spare" }],
  items: [
    { id: "cap", kind: "hat", tags: ["wool"], effects: [{ stat: "speed", add: 1 }] },
    { id: "mitt", kind: "tool", tags: ["wool"], effects: [{ stat: "speed", mul: 2 }] },
  ] satisfies { id: string; kind: string; tags: string[]; effects: Effect<"speed">[] }[],
  sets: [{ id: "woollens", tag: "wool", tiers: [{ count: 2, effects: [{ stat: "speed", add: 10 }] }] }],
  reach: [bag],
  owns: (s, item) => s.bag.held.includes(item),
});
// store.getState().kit.equip("head", "cap") → null, or why not
// a stats feature's contributions: (s) => kit.def.loadout.contributions(s.kit.slotted)
```

- **`loadout({ id, slots, items, sets? })`** is the rules: `fits(slot, item)` (a slot with a `kind` takes only that
  kind; one without takes anything), `check(slot, item, owns)` (a `LoadoutFailure`: `unknown-slot`, `unknown-item`,
  `wrong-kind`, `not-owned`, or null), `equip(slotted, slot, item, owns)` (an item already slotted moves, never
  doubles), `clear(slotted, slot)`, `equipped(slotted)` (in slot order), `standings(slotted)` and
  `contributions(slotted)`. A repeated slot, item or set id throws.
- **Sets.** A `LoadoutSet` counts the slotted items carrying its `tag` and pays the highest tier whose `count` is
  reached, and only that tier. `standings` gives each set's `count`, `tier` (-1 for none) and `next` (the count the
  next tier needs, null at the last) for a screen to print. Sources of its contributions are `<id>:<item>` and
  `<id>:set:<set>`.
- **`loadoutFeature({ key, slots, items, sets?, owns, reach?, reset? })`** saves `{ slotted }` under `key` with the actions
  `equip(slot, item)` and `clear(slot)`, and carries the rules as `def.loadout` (`select` and `draft` are empty). `owns(state, item)` is the game's rule
  for what the player holds, read off its own slice and what `reach` names. A prestige reset keeps the slots unless `reset` says
  otherwise.
- **`fillLoadout(rules, { owns, score, slots?, start?, depth? })`** is an auto-equip: the best exchange of up to
  `depth` slots at once (default 3) for owned, unslotted items, repeated until none scores higher under the game's
  `score(slotted)`. A pair or triple exchange finds a set that pays only once two or three are in, which filling a
  slot at a time never reaches. `slots` keeps it to the open ones. It returns a slots record; equip it slot by slot.
  Milliseconds for tens of items: call it on a press or a change, never every tick.

## Gauges

A bounded level that a rate fills or drains, and that trips at the top: the risk meter of a push-your-luck loop
(heat, pressure, strain). A trip locks the gauge for a while and drops the level; what a lock means is the game's.

```ts
import { gauge, gaugeLocked } from "watchpot/core";

export const boiler = gauge({
  key: "boiler",
  max: 100,
  trip: { lockMs: 60_000, dropTo: 0.25 },
  rate: (s: { engine: { stoked: boolean } }) => (s.engine.stoked ? 2 : -1), // per second, tab open
  onTrip: (draft, now) => void (draft.engine.stoked = false),
});
// in the income step: if (gaugeLocked(s.boiler, ctx.now)) return;
```

- **`stepGauge(state, perSecond, dtMs, now, { max, trip? })`** is the kernel, pure: the part of the step inside a
  lock moves at the trip's `lockedRate` (default 0), the rest at `perSecond`; a level that reaches `max` trips once,
  the lock starting at the moment it got there, and the level drops to `dropTo × max`. Without a `trip` the level
  parks at `max`, a supported bounded meter. It returns `{ state, tripped }`; `GaugeState` is `{ level, lockedUntil,
  trips }`. `nudgeGauge(state, amount, now, rules)` is the press kernel, with the same clamp, trip and lock.
- **Readers:** `gaugeLocked(state, now)`, `gaugeFill(state, max)` (0 to 1) and `secondsToTrip(state, perSecond, max)`
  (null when it is not rising).
- **`gauge({ key, max, trip?, rate, awayRate?, onTrip?, reset? })`** is the feature. Its step is `<key>.rates.level`,
  ahead of `produce`, so an income step already sees a lock. `rate(state, { now })` applies on a tick;
  `awayRate(state, { now })` over a catch-up (default: drains at `max` per hour, so a player comes back to a cool
  gauge and an absence never trips it). `now` is game time (`CallbackContext`), so a buff or a lock can be read
  where the rate applies. A rate is read once per step and held across it: a live tick steps at most `MAX_STEP_MS`,
  and an absence is one step. `onTrip(draft, now)` runs in the same recipe as the trip. One action, `nudge(amount)`,
  moves the level at once (a click that costs heat) and returns whether it tripped; inside another recipe (a press
  that also warms the gauge) the draft helper `boiler.draft.nudge(draft, amount, now)` does the same, trip and `onTrip`
  included. `boiler.select` reads the game state (`locked`, `fill`, `secondsToTrip`) and `boiler.def` is `{ max, trip }`.
  A prestige reset starts it over unless `reset` says otherwise.

The shelf page, with a worked example and the numbers to tune by: [docs/gauge.md](docs/gauge.md).

## Systems

The mechanics idle games are built from, each a feature factory over a pure kernel, each with a recipe page and a
type-checked example in `docs/`. A game picks the ones its design needs and writes content; it does not write the
mechanism. All of them take the game's words as data, keep big numbers in Decimals, run on game time (so they
behave over an absence) and offer the auto-player their moves where a player would act.

| System | What it is | Recipe |
|---|---|---|
| `generators` | The building list: buy N of a thing, each makes a currency a second or pays on a timed cycle; milestones on the owned count; bulk buys | [`docs/generators.md`](docs/generators.md) |
| `dimensions` | A chain where each tier makes the tier below and the lowest makes a currency; every N bought multiplies the tier; exact over any stretch of time | [`docs/dimensions.md`](docs/dimensions.md) |
| `clicker` | A press pays a currency: crits on a saved stream, a combo, a rate cap | [`docs/clicker.md`](docs/clicker.md) |
| `layers` | Stacked reset layers: rows, earn-on-reset and bought-by-the-unit kinds, a reset wiping the rows beneath, upgrades, buyables, milestones, challenges, automation | [`docs/layers.md`](docs/layers.md) |
| `achievements` | A wall of once-earned achievements in rows, a global multiplier from the count and from completed rows, held-for and at-a-moment conditions | [`docs/achievements.md`](docs/achievements.md) |
| `challenges` | A run under a restriction for a permanent reward, with best times | [`docs/challenges.md`](docs/challenges.md) |
| `autobuyers` | Purchases on an interval, by priority, on a schedule that never drifts | [`docs/autobuyers.md`](docs/autobuyers.md) |
| `buffs` | Timed effects with refresh, extend and stack rules, expiring on game time | [`docs/buffs.md`](docs/buffs.md) |
| `spawns` | Random catchable arrivals: a ramped wait, a short life, a weighted outcome | [`docs/spawns.md`](docs/spawns.md) |
| `allocation` | A capped pool split between sinks: workers across jobs, or bars that fill and level | [`docs/allocation.md`](docs/allocation.md) |
| `board` | A grid of cells and pieces placed on it, each piece's effects read from its neighbours, its row and the edge; a greedy auto-arrange and an annealing search | [`docs/board.md`](docs/board.md) |
| `sweep` | A timing bar: a cursor on game time, targets on its track, a strike graded by distance, a streak | [`docs/sweep.md`](docs/sweep.md) |
| `stages` | Tracks of stages with climbing resistance worn down by a force, exact over any stretch; bosses, a time limit that makes a wall | [`docs/stages.md`](docs/stages.md) |
| `missions` | Timed tasks in slots, the reward rolled at the start | [`docs/missions.md`](docs/missions.md) |
| `market` | Tickers whose price is a pure function of game time: positions with a cost basis, a fee, a yield, a chart of any stretch for free | [`docs/market.md`](docs/market.md) |
| `crafting` | Recipes: inputs to outputs, all or nothing, with yield and a timed queue | [`docs/recipes.md`](docs/recipes.md) |
| `levels` | Experience curves with exact inverses, and levelled tracks | [`docs/levels.md`](docs/levels.md) |
| `records` | Statistics at run, lifetime and best scope, with a list of past runs | [`docs/records.md`](docs/records.md) |
| `streak` | A once-a-day claim and a run of consecutive local days | [`docs/streak.md`](docs/streak.md) |
| `prefs` | Choices that belong to the device, outside the save (a quality tier, a volume) | below |

- **Callbacks see game time.** A state callback gets a trailing context, `{ now }` in game time, so a buff or a lock
  can be read where it applies: the clicker's `power` and `crit`, the gauge's `rate` and `awayRate`, spawns' `wait`,
  `lifeMs`, `active`, `worth` and an outcome's `when` (`CallbackContext`), and every generators callback (`mult`,
  `open`, `automated`, `away`, `milestones`; `GeneratorsCallbackContext`). Steps pass the pass's `now`, actions
  `api.now()`; where the auto-player values a move it is the store's `gameNow()`. `drawOutcome` takes it as an
  optional last argument (default `{ now: 0 }`).
- **Generators' readers.** Beside the building list's rules, `row(state, id, mode, now?)` is one buy row,
  `{ count, price, canBuy }` (`GeneratorRow`, `mode` a count, `"max"` or `"next"`, `GeneratorBuyMode`): `count` is at
  least 1 so the row always shows a price, and `canBuy` is false while the generator is closed or `"next"` is past its
  last milestone. `away(state, now?)` is the absence rate the catch-up credits (the definition's `away`, or
  `{ rate: 1 }`). A `milestones(state, def, ctx)` gate turns a generator's own and the global milestones off by the
  game's rule. `RateGeneratorDef` and `CycleGeneratorDef` are the two kinds (`GeneratorDef` their union).
- **A buff without effects** is a timer: `effects` is optional, it adds nothing to `boosts.select.contributions`, and `boosts.select.active`
  and `boosts.select.leftMs` read it (or the pure `buffActive` and `buffLeftMs` over the slice).
- **Cost curves** (`costAt`, `costOfMany`, `maxAffordable`): what the next one costs, what the next N cost and how many
  the balance covers, in closed form for a geometric curve (`{ base, growth, every?, round? }`; `every` holds one
  price for a set, every price is a whole number, rounded up unless `round` says `"floor"`, `"nearest"` or `"none"`) and by walking the game's own function. `stepsOf`, `untilStep`, `reached` and `nextThreshold` read sets and
  milestone ladders. Every system that sells something prices through these.
- **Notations.** `fmt` and `formatter` take `notation`: the suffixes (default), `scientific`, `engineering`,
  `letters` and `logarithm`; `NOTATIONS` is the list for a settings screen ([`docs/notations.md`](docs/notations.md)).
- **Prefs.** `prefs({ key, initial, read?, override? })` is a small store under its own storage key, read before the
  save loads and kept through a fresh profile; `read` cleans a stored value (one that is not JSON arrives as its
  text, for a form an older build kept), `override` lays this load's values over it without saving them (a
  `?quality=low`) until the player sets that key. `usePrefs(store, select?)` reads it in React (`watchpot/react`).
- **The pace clock.** `createPaceClock(realSeconds)` is real time scaled, for slow motion and a held moment: every
  animation reads `now()`, one `setScale(to, seconds)` slows the whole scene, and the ramp is integrated exactly.
  `createRamp(value)` eases one number toward a target. Presentation time only: the economy runs on `gameNow()`.
- **A factory's feature takes save steps** through `withMigrations(feature, { 2: step })`, as it takes auto-player
  moves through `withMoves`: the game does not write that feature's definition, so it adds to it.
- **A step can end a run.** `ctx.resetRun(draft)` is the prestige reset inside a pass's recipe, for a step that
  finishes a run (a challenge whose goal is met).

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

## React

`watchpot/react` binds a store to React. It reads `/core`, the kit's motion and scheme writers and `watchpot/ui`'s
sheet outlet; it draws no page of its own (the page is `watchpot/ui`'s `PageShell` under the game's own look). Its
tests are in `test/react/`.

Shelf page: [docs/react-runtime.md](docs/react-runtime.md).

- **The store.** One context, `IdleStoreContext`, holds the store the composition root built:
  `mountGame(store, <App />)` renders into `#root` under `IdleStoreProvider`. `createRuntimeHooks<GameStore>()`, once in the game, gives the
  typed `useGameStore()`, `useGameState(selector)` and `useGameView()` (the whole state at a slow pace, below); the
  engine's own hooks read it untyped (`useIdleStore`). Without a provider a hook that reads the store throws, naming the
  hook and pointing to `mountGame` or an `IdleStoreProvider`. `RuntimeStore` is the shape they need: `getState` (the
  root actions), `setState` (an immer recipe) and `subscribe`. A selector must hand back the same value for the same
  state: a new object, or Decimal arithmetic, renders without end. Wrap it in `useShallow` (re-exported here and from
  `watchpot/react`, so no game imports zustand; it compares a Decimal by its fields:
  `useGameState(useShallow((s) => ({ a: s.a })))`), or select stored values and compute in the render. In development such a selector gets one warning,
  with the fix, before React's own loop error.
- **The route.** `useHashRoute()` is `[route, go]`: the hash without its `#`, following every `hashchange`, so a
  `#dev` panel opens and closes with the address bar (`route === "dev" && <DevPanel onClose={() => go("")} />`).
- **The clocks.** `useTickNow()` follows the clock's `lastSeen` (a test drives it with `store.tick`); `useClockNow(ms,
  override)` reads `gameNow()` on one timer per store and interval, and at once when the clock's offset moves. Both
  find the clock's fields through the game's `ClockLens` (`clockLens(store)`), wherever the game saves them.
  `warpClock(store, ms, { catchUp })` moves game time forward by the offset, never the wall: the running clock catches
  up over the gap on its next step, as on a return.
- **The runtime.** `useGameRuntime(store, { motion, scheme, sound })` is everything a page starts once: the clock
  (`startGameClock`, in a layout effect so the first catch-up lands before any child reads the store), the watch on
  other tabs (`taken`), `setReducedMotion` and `data-motion` on `<html>`, `applyColorScheme`, and the sound engine's
  unlock and mute. `data-motion` is the resolved motion, `"reduced"` or `"full"` (the OS deciding while the setting is
  `"system"`), so a stylesheet reads that attribute alone and a player who chose `"full"` keeps it. `motion` and
  `scheme` default to `"system"`, and the options may be left out. It returns `{ reduced, taken }`; a clock that gives
  up is thrown from the render, for the game's error boundary. It is two hooks composed, for a shell that shows
  something before the game runs (a title, a splash): `usePageRuntime({ motion, scheme, sound })` is everything but the
  clock (it needs no store, and returns `{ reduced }`), and `useGameClock(store)` is the clock and the watch, mounted
  when the game starts. `useBoot({ initial, next })` is a boot sequence's phase as state, the machine the game's;
  `useLayerSwap({ layers, layer, setLayer, canSwap, cue })` is a switch between a window's layers that commits the
  store's layer only when the transition ends (`select`, `finish`, `swap`). `usePrefs` reads and writes a device
  preference (`prefs()` in `/core`).
- **The page.** `SheetOutlet` and `SheetRegistry` are re-exported from `watchpot/ui` (where `PageShell` lives, see
  UI). The template's `Shell` (`templates/game/src/ui/Shell.tsx`) is the copy-in page a game starts from.
- **The rest.** `usePageLayout`, `PageLayoutProvider` (a value above the page wins, which is how tests pin the width),
  `usePageLayoutObserver`, `WIDE_AT` (900px); `claimTabTitle` and `releaseTabTitle` (the browser tab's title, claimed
  by id, the latest shown); `useAwayTitle(titles, { everyMs? })` shows the game's own words in the tab, in turn, while
  it is hidden, and gives the page's title back on the return.
- **Time away, told.** `watchAway(store, onReturn, { minMs?, settlePasses?, lens? })` hears the catch-up that
  credited an absence and hands `{ before, after, ms }` (`ms` the whole jump in `lastSeen`; the offline cap may have
  credited less); `useAwayReport(summarize)` holds the game's own report of it until `dismiss()`, and hears the
  clock's opening catch-up in either hook order (a child of the component that starts the clock, or after
  `useGameClock`/`useGameRuntime` in the same one), once, StrictMode included; `awayGains(before, after, reads)`
  lists what went up (`docs/time-away.md`).
- **Sampled reads.** `useSampled(store, { sample, initial, everyMs?, fps?, same? })` reads the store every `everyMs`
  (250 by default) into `sample(state, { prev, fps })`'s snapshot and re-renders only when it changes (`sameShallow`:
  entries one level down, arrays entry by entry), for decorative read-outs that must not render on every tick.
  `prev` is the last snapshot, so a trail is carried through it. With `fps: true` a `requestAnimationFrame` loop
  counts frames and `fps` is the rate since the last read (`frameRate`). `createSampler(options)`, once at module
  level, is one shared sampler: `<SampleProvider sampler store?>` reads its `store` (or the store in context) and
  every `useSample(sampler)` under it gets the same snapshot (`initial` outside it).
- **The whole state, paced.** A screen that reads much of the state would render on every tick if it selected all
  of it. `usePacedState(store, { idleMs?, inputMs?, now? })` (`useGameView()` from `createRuntimeHooks`, which takes
  the same options as `{ view }`) is the whole state handed on at once for `inputMs` (500) after a press, a key or a
  click, so the player's own doing is never late; every `idleMs` (200) at most while the game runs by itself; and
  not at all while the tab is hidden (it catches up as it shows). Every reader of a store shares one view
  (`pacedView(store)`: one subscription, one timer, the options of the first call); `createPacedView(store,
  options)` makes one of its own, a `{ get, subscribe }` for `useSyncExternalStore`. A figure that must move every
  tick is read with a narrow `useGameState` selector, and a decorative one with `useSampled`.
- **News and keys.** `useNews(log, onLine)` calls `onLine` for each line a journal gains, in order: nothing is news on
  mount, and a log replaced whole (an import, a fresh profile) calls nothing. `useHotkeys(keys, { enabled })` binds
  one `keydown` listener on `window` and looks the handler up by `event.key.toLowerCase()`. It ignores ctrl, meta
  or alt, and typing in an input, a textarea, a select or content-editable text. A held key repeats the call;
  `event.repeat` is the handler's to read.

## Dev panel

`DevPanel` docks over the running game in a development build: time warp (+1 min to +1 day, through `warpClock`), a
jump to day N (the profile's day counted from its `createdAt`, a warp to the same time that day and a catch-up), each
feature's saved state as JSON (Decimals as strings, read when opened, refreshed on demand), and the save as text:
export, copy, check through the codec and the game's migrations, edit, import. It reads the store in context and
changes it only through its root actions and the clock's offset, so `test/rules/wall-clock.test.ts` holds.

It is a developer's tool, not game UI, and the one stylesheet in the engine: `DevPanel.module.css` is self-contained
(its colours and faces are its own `--dp-*` properties, light and dark), so it reads no game token and needs no global
the game defines (`test/rules/headless.test.ts`).

A game mounts it behind its own route (`useHashRoute`, React above) and a build-time check, written inline so the
bundler folds it; the template mounts it this way on `#dev`:

```tsx
const [route, go] = useHashRoute();
// ...
{process.env.NODE_ENV !== "production" && route === "dev" && <DevPanel onClose={() => go("")} />}
```

The entry exports it through `dev/gate.tsx`, which reaches the panel's module only through `import()` behind the same
check; in a production build that branch is dead, so the panel's script, styles and helpers are absent from the
bundle and its source map. The panel's helpers (`profileDay`, `jumpToDay`, `featureJson`, `checkSave`) are not in the
barrel for the same reason.

## Kit

`watchpot/kit` is effects with no look, and the reveal's mechanism: one barrel (`src/kit/index.ts`, `export *` of `fx`
and `reveal`). It ships no CSS file and no class name of its own (the `kit-lookless` import rule and
`test/rules/headless.test.ts`): an effect's element takes the game's `className` and `style`, carries its state in
`data-*`, and sets inline only what it needs to work (a placement, the pointer, the Web Animations API run). Kit code
reads no store and no game module (`kit-props-only`; `kit-core-narrow`: from `watchpot/core` only `fmt`, `decimal`
and `world` names). Its tests are in `test/kit/`.

- **Reduced motion.** `setReducedMotion("system" | "reduced" | "full")` (the runtime calls it from the game's
  setting), `prefersReducedMotion()` (the setting, else the OS), `useReducedMotion()`, `subscribeReducedMotion`,
  `osPrefersReducedMotion`. Every effect below honours it. `hasWebGL()` probes once; `riseIn(show, delay)` is a
  `motion` entrance object for a game that uses `motion/react`.
- **The scheme.** `applyColorScheme(pref)` writes `data-scheme` on `<html>` (live while "system"); `resolveScheme`.
- **Token reads.** `readToken(name, scope?)`, `tokenReader(scope?)`, `readFoil` (the `--foil-1..5` stops),
  `useScopedRead(ref, live, read)` (read again when the element's theme, world or the page's scheme changes),
  `longHex`, `mixHex`, `luminance`: how canvas and WebGL take their colours from the game's tokens.
- **Rarity rungs.** The effects take a rarity as a `RarityTier` (`{ index, count, id, label? }`, `tierOf(ladder,
  id)`), never a name. `tierIntensity` (the rung's height, 0..1), `tierStep(tier, n)` (one of `n` fixed looks),
  `tierRamp(stops, tier)` (a number read off stops), `tierToken` (`--rarity-<id>`), `tierInk` (its `var()`),
  `tierLabel` (its word), `isTopTier`.
- **The ticker.** `Ticker({ mantissa, suffix?, decimals?, animated?, className? })` rolls a live number on
  `@number-flow/react`: throttled to four animations a second (`useThrottledValue`, `throttleDelay`), digits that
  turn faster than the eye set still behind the rolling head (`splitDigits`), keyed by the suffix so a magnitude
  change snaps, still under reduced motion. `Money({ cents })` is real money to the cent. Their face is the game's
  `className`.
- **Shake.** `shake(el, "soft" | "hard")` and `useShake()`: one Web Animations jolt (`shakeKeyframes`, `SHAKE_MS`),
  none under reduced motion.
- **Flash.** `<Flash trigger peak? duration? className? style? />`: a flash over the nearest positioned ancestor each
  time `trigger` changes, its opacity curve run by the Web Animations API (`flashKeyframes`), dimmer and shorter
  under reduced motion; its colour and stacking are the game's class (`[data-flash]`).
- **Flight.** `<FlightHost glyphOf className? glyphClassName? />` once per page and `useFlight()` →
  `fly({ currency, from, count?, glyph? })`: glyphs burst from what was pressed and fall into the currency's
  `[data-pill="<id>"]`, which holds `data-bump` as they land (the bump's keyframes are the game's CSS). The layer is
  `[data-flight-layer]`, each glyph `[data-flight-glyph]` (its size and ink the game's class); reduced motion only
  bumps. `FLIGHT` holds the numbers, `staggerOf` the spacing.
- **Confetti.** `burst(tier, { origin?, canvas?, scope? })`: five presets climbing with the rung (none, a paper puff,
  a burst in the hue, a rain of the hue and `--foil-2`, a storm of the foil stops), colours read from the tokens at
  fire time (`readConfettiColors`, `confettiShots`), nothing under reduced motion; `cents()` is one grey square.
- **Gestures.** `createGestures()` and `useGestures()` tell a person's own press or key from the machine's change in
  the same tick (`active()`, `recent()`), remember where it landed (`point()`, `target()`) and whether something
  answered it (`answer`, `answered`); `pressPoint(e)` and `middleOf(el)`. `docs/feel.md`.
- **The celebration director.** `createDirector<D>(options)`: cues by tier (`micro`, `small`, `medium`, `big`) and
  kind; smalls coalesce by kind into batches (`onBatch`, `useCueBatches`), mediums and bigs take the stage one at a
  time (`stage()`, `useStage`, `done(id)`), a big cuts a medium short, the machine's wins are rationed (and drop a
  tier with `machine.downscale`), `reduced` rides on every cue, and `sample`/`replay`/`log` serve development. `docs/feel.md`.
- **Count-ups.** `<Count to from? ms? delay? format ease? onLand? skip? />` rolls a figure from one Decimal to another
  (log space past a thousand, from 1 when it starts under 1, `countBetween`), writing the element's text with no render per frame, at most
  `countFrameCap(ms)` frames whatever the size; a new `to` rolls on from the figure shown; the end at once under
  reduced motion or `skip`; `[data-counting]` while it rolls. `countUp(node, options)` is the same on any node and
  returns `{ cancel, finish }`. `docs/feel.md`.
- **Marks at a point.** `createMarks({ max?, className?, keyframes?, duration?, lifetime?, reduced?, hidden? })` and
  `<MarkLayer marks />`: `marks.at(x, y, { kind?, step?, text? })` or `marks.on(el)` leaves a short-lived
  `[data-mark]` where a press landed, run by the Web Animations API on transform and opacity only (`compositorOnly`,
  `markKeyframes`), capped, pooled, removed by a timer, a fade in place under reduced motion. `kick(el, name?)`
  restarts a CSS animation by flipping `data-<name>`. `docs/feel.md`.
- The **reveal** (below). The sound is `watchpot/sound`, and `watchpot/kit` exports none of it.

## Theme

`watchpot/kit/theme` (`src/kit/theme/build.ts`) is the design-time token compiler, not in the barrel. A game keeps
its `design/tokens.json` and calls `buildTokens({ tokens, out, fontBase })`: it writes the themes, schemes, worlds,
moments, structural tokens (spacing, grid, radius, type roles) and `@font-face` rules, each `fonts/<file>` url
re-based on `fontBase` as the css file sees it. The template's `design/build-tokens.ts` is the three-line caller,
and its `src/ui/theme.css` maps the compiled tokens onto the registry's `--ui-*` contract.

## Sound

`createSound({ cues, packs?, volume?, voices?, buses?, scenes?, routes?, presence?, seed?, mix? })` is a game's sound: `cues`
every cue by key (`Cue`: zzfx `voices`, recorded `takes` from a pack, a `bus`, and how a play varies, climbs, rolls
and is placed), `packs` the recordings by name, `volume` the master gain (default 0.3), `voices` how many the core
mixes at once (64). It returns a `Sound<K, B>` (`B` names the buses the game declares beside the five defaults):
`play(key, options?)` (a `VoiceHandle`, or null), `unlock()`, `armUnlock(target?)`, `setMuted`, `isMuted`, `setVolume`,
`audioUnlocked`, `mode()`, `context()`, `output()`, `loadPack`, `unloadPack`, `packReady`, `soundInfo(key)`, and the
`mixer`, `mod`, `space`, `transport`, `harmony` and `tap`, with `music`, `sequence`, `grain`, `freeze`, `babble` and
`gen`. A game wraps it in its named cue functions. The recipes are four pages,
[`docs/sound-table.md`](docs/sound-table.md), [`sound-mix`](docs/sound-mix.md), [`sound-music`](docs/sound-music.md)
and [`sound-dsp`](docs/sound-dsp.md), with [`sound-packs`](docs/sound-packs.md) for the build step; the examples are
`docs/examples/sound-*.ts`.

`watchpot/sound` is on an entry of its own, for a game that plays cues and draws its own page: it imports nothing but
its own folder and `zzfx` (the `sound-alone` import rule), so it needs none of the kit's UI peers. `watchpot/sound/pack`
is the build-time entry: `buildPack` turns a folder of downloads into trimmed, loudness-matched, rooted, bar-cut Opus or
FLAC files and a typed manifest through `ffmpeg`, and is never in a game's bundle.

- **The core.** The graph is the engine's own: a dependency-free Rust crate (`dsp/`) built to WebAssembly runs every
  voice, bus, effect, the transport and the sequencer in one AudioWorklet, added from a Blob URL on `unlock()` with no
  asset or server configuration (the build is committed in `src/sound/core.gen.ts`, about 240 KB of wasm before
  compression). Commands go to it as little-endian binary records stamped with the audio clock's frame; a voice starts
  on its frame to the sample. Everything leaves through a lookahead limiter (ceiling -1 dBFS, 5 ms late). `mode()` is
  `"locked"` before the gesture, `"core"` once it runs, `"fallback"` where it cannot (no AudioWorklet or WebAssembly, or
  the boot failed: one `console.warn`): zzfx voices and 0.6 clips through plain Web Audio, and nothing else.
- **The gate.** Browsers start audio suspended. `armUnlock()` wires `unlock()` to pointerdown, pointerup, touchend,
  keydown and click until its cleanup runs: a gesture while audio runs costs one state read, one without activation
  leaves it to the next, and a context the OS suspends resumes on the next. While the context is not running, and while
  muted, `play` is a silent no-op: nothing queues up to blare later. The mixer, the mod matrix, the space, the
  transport and the harmony may be called before `unlock()`: each remembers and sends when the core comes up.
- **Cues.** A cue plays a take (one per play: `shuffle`, `round` or `random` by weight, narrowed by `velocity`), else its
  0.6 `clips` once decoded, else its zzfx `voices`, so nothing is ever silent. `vary` draws cents, dB and a start
  offset, `ladder` turns a `step` into a rate (ratios, or degrees of the harmony clock), `pitched` moves a take onto the
  harmony clock from its root, `quantise` waits for the transport's grid, `placed` is heard where `at` is. A take's
  `level` is dB on top of the pack's own loudness match (`lufs` in the manifest), so swapping a file needs no gain
  re-tune. `soundInfo(key)` says what plays now. `docs/sound-table.md`.
- **The governor** decides what sounds, with no clock of its own: `cooldownMs`; `roll` (a cue asked for more than
  `above` times a second becomes one sustained voice that follows the rate); repetition (each play in the last 4
  seconds turns the next down 1.5 dB, to -9); a loudness window (a play more than 40 dB under the loudest sound ringing
  is skipped); a full pool releases the quietest voice of the lowest `priority`. `mine: true` is the player's own hand:
  never skipped, never rolled.
- **The mix.** Five default buses (`sfx`, `ui`, `music`, `ambience`, `voice`) sum into a master; `buses` declares more
  (15 in all), each with its output, level, up to eight effects (each named by an `id`, or by its place) and its sends. Eleven effects: `filter`, `eq`, `compressor`
  (with a `key` bus: a duck), `saturator`, `delay`, `tape`, `crush`, `stereo`, `reverb` and `convolver` (both start fully wet, for
  a bus others send to) and `freeze`; every setting has a default that applies until it is set, and
  `mixer.bus(name).fx(slot).set(param, value, slewMs)` plays it live. `scenes` are named mixes faded to (`scene(name)`,
  `scene.push(name)`); the `mod` matrix routes 0..1 sources onto a bus level, a send or an effect setting through a
  curve and a slew; `space` places a sound where it happened (pan, distance, occlusion, speakers or headphones);
  `soundPrefs(key, sound)` keeps the player's bus volumes on the device. `docs/sound-mix.md` has every default and
  range, and the latencies (the convolver's 256 frames, the saturator's 42, the tape's 17 ms; none compensated).
- **The mix desk.** `sound.desk` is a mixer over the running game: every level, send and effect setting, an effect's
  on/off, a trim per bus and per source and the game's `tunable` numbers, each in the mix or in any one scene (a scene
  says only what it changes, so a game's tiers differ only where they are told to); the structure (buses made and
  pointed, effects added, moved, re-keyed and removed, a source routed to a bus, a cue split into a strip per bus its
  plays ask for); a cue's takes; a recording staged beside a sample and compared with it; undo. What is moved saves as
  a `MixFile` that `createSound({ mix })` lays over the declared mix, in development and production.
  `openSoundDesk({ desk, onSave, samples, switches })` (`watchpot/devtools`) is its window in a dev build, laid out as a
  mixer; `sampleHost` (`watchpot/sound/pack`) and `fetchSampleHost` (`watchpot/devtools`) run a dropped recording through the pack pipeline
  and write it into a pack. "The mix desk" in `docs/sound-mix.md`, "The sample host" in `docs/sound-packs.md`.
- **Music.** `transport` is the clock (`set({ bpm, beatsPerBar, swing })`, `start`, `stop`, `position()`, `onBeat`);
  `harmony` is the key, scale and chord (`set({ key, scale?, chord? }, when?)`); `music({ pack, stems, sections })` plays
  loops phase-locked to the transport, changing sections on the bar (`section`, `layer`, `take`, `stinger`, `tension`, `stop`), with takes per stem and layers no section moves;
  `sequence({ cue, grid, steps, degrees? })` plays a cue on a step pattern with an `onStep` for a printed playhead.
  `docs/sound-music.md`.
- **The instruments.** `grain(sample, def)` is a cloud of grains whose playhead the game drives; `freeze(bus, amount)`
  holds a bus's spectrum (or stutters the bar's last slice); `babble(def).say(text, { onChar })` speaks syllables of
  shaped buzz and calls back per syllable; `gen(kind, def)` is a pulse motor, shaped noise or a struck modal bank,
  driven by numbers. `tap.read()` is the master as five figures to draw with; `useAudioUniforms` (`watchpot/shader`)
  writes them to a shader canvas; `capture(sound, seconds)` records the output as a WAV in development.
  `docs/sound-dsp.md`.
- **Packs.** `packs: { ui: pack }` takes a manifest or a function importing it; `loadPack(name)` fetches, decodes and
  uploads a pack's samples (the browser decodes, and the core keeps 16-bit PCM) and `unloadPack` frees them. A pack that
  fails to decode leaves the game on its zzfx voices. `docs/sound-packs.md`.
- **Voices.** `Voice` names zzfx's positional parameters (`toParams`); `Layer` places one in time; `soundSeconds` is a
  layer list's length by zzfx's own envelope arithmetic. None of them imports zzfx. The 0.6 `clips`, `ClipLayer` and
  `SoundOptions.samples` are still read; a new cue names `takes`.
- **0.9.0 removed** `createStems` and `stemOffset` (a score is `sound.music`), `soundSamples` and `mixLayers`, and
  `watchpot/kit` exports no sound: import it from `watchpot/sound`. `codemods/0.9.0-sound.ts` rewrites the imports and
  lists what is left to hand.

## Scenes

A screen's living backdrop is the game's own fragment shader run by `watchpot/shader` (`ShaderCanvas`, its palette
from the tokens through `useShaderTokens`, a CSS still without WebGL2; see Shader and `docs/shader.md`). The
template's `Backdrop` (`templates/game/src/ui/Backdrop.tsx`) runs one of four original starters from
`templates/game/src/shaders/` (`weather`, `print`, `signal`, `cells`, picked by the answers' `look.surface.base`),
built from the shader chunks, for a game to replace with its own place.

## Reveal

`src/kit/reveal/` is the gacha reveal's mechanism, headless: the sequence, its timing, the ladder's steps and the pity
ladder, and the director as a hook. It knows no rarity name (every step reads a payload's rung on the game's ladder)
and draws nothing: the room, the cards, the words and every effect are the game's. Recipe: `docs/reveal.md`.

- **The steps.** `ROOM_STEPS` (5) and `roomStep(tier)` put a rung on one of five steps from the plainest to the
  loudest; from `BIG_STEP` (3) a face charges before it turns (`chargeMs`: 1000ms, the top step 1500ms).
  `bestOf(ladder, ids)` and `rungAtLeast` are the ladder's comparisons.
- **`useRevealSequence`** `<R, P extends { rarity: R }>({ result, ladder, payloads, gift?, reduced?, charge?,
  onOpening?, onCharge?, onTurn?, onLand?, onSummary? })` and **`<RevealSequence>`** (the same as a render prop):
  the box, the lid, the deal, one face per tap (a tap before the face in the centre has shown is ignored), a big rung
  lifted face down and charging first, Skip, and a new `result` starting over in the same render. It hands back
  `state` (`phase`: `chest`, `opening`, `cards`, `summary`), `stage` (the payload holding the centre), `charging`,
  `tone` (the rung the room should take, never falling back mid-reveal), `lit`, `best`, `remaining`, `reduced`, and
  the moves `tap`, `skip`, `face(i)` and `onKeyDown` (Enter, Space and the right arrow on the stage). `onLand`'s
  `landing` says the rung's `tier`, `step`, `big` and `top`: what the game's burst, flash and shake read. Under
  reduced motion every step is a 600ms fade.
- **The pure sequence.** `initialReveal`, `reduceReveal` (`RevealEvent`), `nextDelay`, `REVEAL_TIMING`,
  `RevealState`, and the poses a renderer may use: `cardRole` (`deck`, `stage`, `shelf`), `cardPose` and `cardLayer`
  (a fan of backs, the stage and the shelf in pixels from the stage's centre, `FAN`), `isTurned`, `printKeyOf`.
- **Pity and the shelf**: the kit computes no guarantee; a game's gacha reports each one's window and opens left
  (`Guarantee`). `pityRungs` is the ladder an odds sheet prints (`PityRung`: `within`, `since`, `left`),
  `nearestGuarantee` the one a pity line names (a tie to the higher rung), `shelfLight(colour, fill, rungs)` how a box
  stands on its shelf (`strength` 0.45 to 1 by `fill`, `charge` 1 when the next open pays).

Tests: `test/kit/reveal/` (the pure sequence; the hook playing three payloads in order, charging the top rung first
and reporting the best). `examples/orbital-orchard/src/ui/Reveal.tsx` is a whole reveal built on it.

## UI

`watchpot/ui` is headless primitives: the behaviour, keyboard, focus, ARIA, structure and state of a control from the
engine, and every pixel and every word from the game. No stylesheet, no class name, no token, no font, no English:
each part takes `className`, `style`, `ref` and its native attributes, says its state in `data-*` attributes
(`data-state="open"`, `data-current`, `data-armed`, `data-earned`), and takes `asChild` where a game brings its own
element (a `motion.div`, a link). Peers: `react` and `react-dom` only. The whole page, with an example per primitive
and the styling recipe (a CSS module beside a thin wrapper in the game's own `src/ui/`), is
[`docs/ui.md`](docs/ui.md); a type-checked example is [`docs/examples/ui.tsx`](docs/examples/ui.tsx).

| Primitive | What it carries |
|---|---|
| `Dialog` (Root, Trigger, Scrim, Panel, Title, Description, Close) | A modal or a side panel: focus trap, Escape by layer, focus back to the opener, the page made inert |
| `ConfirmPress` | A button that arms on the first press and fires on the second |
| `Tabs`, `NavTabs` | A tablist with roving focus; page navigation with `aria-current`, locks and spoken counts |
| `Progress`, `Meter` | Exact ARIA values, `--value` for the game's CSS, optional whole steps |
| `Countdown` | A `<time>` from `secondsLeft`, `onEnd` once, `data-warn` under a threshold |
| `Tooltip`, `Popover` | Hover, focus and touch; placed inside the viewport with no dependency |
| `HoverTips`, `useTipSlot` | One tooltip for a whole page by event delegation: whatever carries `data-tip` has a tip, hover, keyboard focus (a `data-tip-scope` row at once) and touch, nothing mounted until it is asked for |
| `TileGrid`, `AchievementGrid` | A two-dimensional roving grid; the achievement wall in one component, tiles earned, locked or hidden, one detail tooltip |
| `TreeGraph` | Nodes by column and row, edge geometry, arrow keys between nodes, a detail region |
| `Pressable`, `HoldButton` | A click target that counts one activation per press across pointer, touch and keys, with its position; an action repeated while held |
| `FloatingNumbers` | Short-lived elements spawned at a point, removed when the game's keyframes end |
| `Toaster`, `createToasts` | A live region with timed dismissal that pauses under the pointer |
| `Barcode`, `Ruler`, `LevelBars`, `Sparkline`, `Checker`, `SplitFlap` | Printed figures in `currentColor`: a Code 128 that scans, a tick ruler with a caret, a level strip, a series over named zones and rules, a bit track, text on split flaps |
| `useClearUnder`, `coveredBy` | Decorative marks marked `data-covered` where a solid panel sits over them, measured without layout thrash |
| `Near`, `useNear`, `Marquee` | How near a goal is, as a named band on `data-near` (with hysteresis) and `--near`; a ring of bulbs that fills like a meter |
| `BuyAmount`, `buyCount` | The buy-mode switch (1, 10, max, to the next set) and the count it means |
| `Toggle`, `Switch`, `Slider`, `Disclosure` | The small controls |
| `PageShell`, `SheetOutlet` | The game page: header, the open tab's screen, a page over it with a way back, sheets, overlays |
| `CrashBoundary` | What the page shows when a render or the clock gives up: the game's own fallback, with the error and a retry |

Each has its hook beside it (`useDialog`, `useTabs`, `usePress`, `useHoldRepeat`, `useToasts`) for a game that wants
its own markup, and the small hooks they are built from are exported too (`useRovingFocus`, `useFocusTrap`,
`useEscape`, `useControllable`, `usePlacement`), with two that read what the page already says,
`useClosestAttribute(ref, name)` (an attribute off the nearest ancestor that carries it, kept current) and
`useMediaQuery(query)`, and `useArrived(shown, ms)`: true briefly after something turns up on a mounted page, set
before paint, and never for what was there at the mount.

## Shader

`watchpot/shader` runs a game's own fragment shaders well, in 2D: a backdrop that reacts to the run, a foil on every
card, a button that glows while a buy is affordable, a transition. It imports React and nothing else. The look is
the game's GLSL; the engine ships the container and a library of chunks to build from. The whole page, with complete
fragments, is [`docs/shader.md`](docs/shader.md); the example is [`docs/examples/shader.tsx`](docs/examples/shader.tsx).

- **`ShaderCanvas`** draws a GLSL ES 3.00 fragment over its box (WebGL2, one triangle). `uniforms` is a plain record
  (numbers, vectors, booleans, colours as hex) pushed when a value changes, or through the `ref` handle's
  `setUniforms` with no React render. It draws only while on screen and the tab is showing, sizes itself under
  `dpr` and `maxPixels`, holds one frame under `reduced`, rebuilds after a lost context, and on a failed compile or
  no WebGL2 shows the `still` the game passes and hands `onError` the driver's log at the fragment's own lines. For
  development, the handle's `pin(seconds)` and `pinShaderClock(seconds)` (every canvas) hold `u_time` at one instant
  (`shaderClockPin()` reads the page's pin, for a surface with a clock of its own). `fps` caps its draws.
- **`useSteppedFrame(handle, frame, { fps, ready, running, at, pin })`** is a frame loop below the display's rate
  for a held (`paused`) canvas: `frame(seconds, dt)` is called at most `fps` times a second and its uniforms pushed
  through the handle, one draw each and no React render. It stops on a chosen frame (`running: false`, `at`) for
  reduced motion, and holds the page's pin.
- **`ShaderPool` and `ShaderTile`** draw many small shaders on one context (browsers cap contexts): the newest
  `maxLive` animate and the rest hold a true frame.
- **`createPulse(decayMs, now)` and `usePulseUniform(handle, pulse)`**: an envelope that jumps on an event and decays,
  fed to a canvas as `u_pulse` through its handle (a flash on a purchase, a ring on a catch).
- **`useShaderTokens(ref, names)`** reads the game's colour tokens for uniforms and re-reads on a theme change, so a
  shader's palette is the game's.
- **Chunks** (`compose(...chunks, code)` orders and de-duplicates them): hashes, value, gradient and simplex noise,
  `FBM`, `DOMAIN_WARP`, `VORONOI`, Bayer and interleaved-gradient dither, SDF shapes and ops, cosine palettes and
  OKLab mixing, grain, vignette, scanlines, halftone, a CRT curve, chromatic offset, glow, polar and tiling helpers,
  and a one-bit raster (`MOSAIC`, `DOT_SCREENS`, `RASTER_FAULTS`: coarse cells, a screen per tone, dead columns and
  slipped rows).
  `uniformDecls` writes the declarations.

## Three

`watchpot/three` is everything a 3D game needs around its scene that is not the scene: a game writes its meshes,
materials and content and takes the rest from here. The stack is three r187's `WebGPURenderer` (WebGL2 where WebGPU
is missing) with TSL node materials and TSL post-processing, through `@react-three/fiber` 9; `three` and
`@react-three/fiber` are optional peers that only this entry reaches. The whole page is [`docs/three.md`](docs/three.md),
with a type-checked scene in [`docs/examples/three-stage.tsx`](docs/examples/three-stage.tsx).

- **`Stage`** mounts the canvas and owns the frame loop: the frame cap, the game's `prePasses`, the post stack, a
  quality change swapped in without a blank frame, a hidden tab held still, a lost device reported (`onLost`) rather
  than a dead canvas. `useStage()` is the handle a scene drives: the pace clock, a clamped `dt()`, `reduced`, focus,
  depth of field, exposure, `compile`, `capture`.
- **`buildPost`** is the post stack (bounce light, god rays from a light the game names, temporal or SMAA
  anti-aliasing, depth of field, bloom, AgX, vignette, grain), every tuned number an option.
- **`StageBoot`** holds the first frame until every shader the scene will need has compiled, so nothing hitches on
  first sight; the boot cue is the game's own DOM, driven by `useStageStatus().boot`.
- **Prefs** on `prefs()`: `createQuality` (tiers generic over the game's preset, `DEFAULT_TIERS`, a `?quality=`
  override), `createFrameRate` (the cap and a measured-fps meter), `viewPrefs` (brightness, grain, depth of field,
  sway, and the game's own fields).
- **Camera**: `framePose`, `lookFrom`, `lensFor` and aspect bands; `Glide` (a capped Hermite glide that retargets
  mid-flight); `samplePath` for keyed camera paths; `useCameraRig` with pointer lean, sway and a camera loan;
  `usePickFilter` to gate what the pointer can hit.
- **Over the canvas**: `pinLabel` and `LabelProjector` pin DOM to world points; `FpsCounter` is unstyled.
- **Helpers**: `CausticsPass`, `SpritePool` (GPU point sprites), `Turntable` (lift, turn and flick an object),
  `clipMesh`, `runIdle` (build geometry in idle time), `createRefCache`, `stepSpring`, `planOf`, `textTexture`, a perf
  harness (`?perf=WxH`), and a TSL chunk library (`triplanar`, `boxProjection`, `bumpNormal`, `fresnel`, `bayer4`).

Nothing in it has a look: no CSS, no class names, no material or mesh of any game. For 2D, see Shader.

## API report

`api/` holds the declarations of the twelve entries (`tsc --declaration --emitDeclarationOnly`,
sorted, no source maps), so an export that appears, vanishes or changes signature shows in review. `bun run
api:check` regenerates to a temp folder and fails naming each changed file; it runs inside `gates`. After a
deliberate API change run `bun run api` and commit the folder with the change.

## Sim

`watchpot/sim` plays a game headless: a store on a clock the sim owns, days of looks on a schedule, a timeline of
rows, a pacing contract as data, a gate over many seeded runs, and an auto-player that needs no player code at all.

```ts
import {
  autoPlayer,
  byDay,
  createSimWorld,
  fixedSchedule,
  grid,
  judge,
  playDays,
  rngFor,
  sampler,
  simStore,
  table,
} from "watchpot/sim";

const world = createSimWorld((now) => simStore(toy, now, "seed"), START); // one catch-up at START
const player = autoPlayer(toy, { balance: (s, currency) => s.wallet[currency] });
const rows = sampler({
  marks: [HOUR, 4 * HOUR],
  start: START,
  take: () => readRow(world),
  at: (r) => r.hours,
});
playDays({
  world,
  schedule: fixedSchedule(8, 23, 15, 0), // the tab open 08:00 to 23:00, a look every 15 minutes
  days: 3,
  start: START,
  rng: rngFor("seed", "auto"),
  look: () => player.look(world.store),
  afterLook: () => rows.look(world.now()),
  dayEnd: (day) => rows.close({ ...readRow(world), day }),
});

const CONTRACT = table(
  byDay((r: Row) => r.hours),
  { gold: { name: "Gold", read: (r: Row) => r.gold } },
  grid(
    [1, 3],
    [
      [
        "gold",
        [
          [50, 90],
          [400, 700],
        ],
      ],
    ],
  ), // gold by the end of days 1 and 3
);
judge(rows.rows, CONTRACT); // a verdict per band the run reached
```

- **The harness.** `createSimWorld(build, start, { quality, tickMs })` hands `build` the sim's clock (the store's
  `now`) and returns `{ store, now, gameNow, play(ms), away(ms), snapshot() }`: `play` ticks with the tab open (a
  tick at most the quality's, `SIM_QUALITY`: a second by default), `away` is a closed tab and one catch-up.
  `simStore(game, now, seed)` is the game on plain data, saving nothing. `world.snapshot()` is the clock and the
  store's data; `resumeSimWorld(build, snapshot)` picks a fresh store up there with no opening catch-up.
- **Schedules.** `planDay(rng, schedule, day, weekday, dayStart)` turns a `Schedule` into sessions: `fixedSchedule`
  (one session, a look every N minutes) or a `SessionSchedule` (sessions a day, their lengths, cadence, keypress bursts,
  skipped days, decay). `rngFor(seed, id)` is the seeded behaviour stream; `drawRange` and `drawLogNormal` its draws.
  `playDays` plays the sessions, a closed tab or background play between them. Its `until()` and `hours` stop a run
  early: checked after each look, so the run ends after the look that crosses it, and a day cut short gets no
  `dayEnd`. (The sim world, `playStraight` and `runFit` all step a second by default, `SIM_TICK_MS`.)
- **The timeline.** `sampler({ marks, start, take, at })`: a row as the time since the run's start passes each mark
  (marks passed together are one row), `push` for a milestone, `close` at a day's end (replacing a row taken at the
  same moment), `restart(at)` for a new run. `markdownTable(heads, rows)` prints it.
- **The contract DSL.** A `Table` is bands on an `Axis` over `Metric`s (`{ name, read(row) }`): `band(metric, { at,
  p10, p90, todo? })`, or `grid(columns, [[metric, [[p10, p90], …]], …])`; axes `byHour(hoursOf)` and `byDay(hoursOf)`
  (a band reads the latest row by the end of its day, once the run got into it). `judge(rows, table, { ceiling })`
  gives a `Verdict` per band reached (rows in time order; `ceiling` holds the top alone). The other checks are built
  from `check(name, value, target, ok)`, `atLeast`, `atMost` and the combinators `at(rows, axis, n)` (a day-N
  reading), `pairs(rows, each)` (day over day) and `perRun(rows, runOf, each)`. `tally` reads the same checks
  over several seeds and `failing` keeps those out on a majority (a `todo` check never fails); `p10p90` is how a band
  is written from seeds; `formatVerdicts` prints them.
- **The gate.** `runGate(checks, { key, run })` runs every job the checks name once, all at once, and tallies each
  check; `spawnJob(script, args)` runs one in its own Bun process and parses its JSON; `formatGate` prints the result.
- **The auto-player.** `autoPlayer(game, { balance?, maxMoves? })` reads every feature's `moves` (`movesOf`).
  Without `balance` it reads the game's one `currencies` feature (`state[key][currency]`, zero for a currency it
  lacks), and throws asking for `balance` when the game has none or more than one. A free move that keeps going
  through is taken again up to `maxMoves`, so a free move should refuse once taken. A look
  buys the affordable move of the best `value` per share of its currency held (`amount / balance`), again until none
  is affordable, then takes every free move (no cost) best first, and goes round again while either did anything. A
  move that refuses is not tried again in the look; one worth 0 or less is never taken; nothing is bought that the
  balance does not cover. `look(store)` returns `{ bought, free }`.
- **Bare rules.** A game whose rules are pure functions over plain state needs no store: `bareSimStore(now, { tick,
  away })` is a `SimStore` for `createSimWorld` that calls them (the world's opening catch-up credits nothing).
  `playStraight({ world, ms, lookEveryMs, look, afterLook, until, tickMs })` is one unbroken sitting with the tab
  open, a look every `lookEveryMs`, the last stretch the remainder.
- **A script's small parts.** `simArgs(argv?)` reads `--k=v` and `--k` (as `"true"`), the last repeat winning;
  `fmtClock(ms)` prints `h:mm`; `shortDecimal(d)` prints a whole number below a million, then `e12.3`. The template's
  `sim/run.ts` uses them: `bun run sim -- --straight=<hours>` plays one sitting and prints the usual table.
- **Plan and fit.** Price a game from a plan instead of judging it after the run. Write the minute each gate should
  open and give each gate a `price()` (the game's code: the engine never writes a definition). The game reads every
  gate's price from a live `fitTable(FIT)` (`get(key)`, `BLOCKED` for a gate it lacks; `isBlocked`). `runFit({
  table, gates, … })` shuts every gate in it and plays the pilot; as each minute comes it asks the gate for a price,
  which the gate works out from `holdings` (the most held lately; `ratchet` for a gate behind a reset) and rounds
  with `nicePrice` (down) or `priceAbove` (strictly up), and the fit writes it into the table, payable at once.
  `quality` sets the step (`SIM_QUALITY`). `formatFit` prints the report, `fitTableSource(table, { …, draft })` is the
  text of the table module (write it only when the run finished). A replay on the fitted table should finish within
  0.7 to 1.25 of the plan's last minute. The pilot must hold some of what it earns, or prices are pinned to an empty
  balance. A fit is one run for a ballpark, not a sweep (`docs/plan-and-fit.md`).
- **The fit kit.** With `capture` a fit leaves a `SimSnapshot` every `snapshotEveryMs` of play and one at its end:
  the world, the auto-player's memory (`remember()`, `memory`), the fit's progress and the game's own `extra`, exact
  as text (`encodeSnapshot` / `decodeSnapshot`; the caller picks the file). `runFit({ from })` carries a fit on from
  one (`fitHolds` says when the plan moved under it; `latestSnapshot` picks one). `proveFit` replays the finished
  table between the snapshots and must arrive at each exactly; a draft skips it, and `proveFitParallel` runs it on
  Bun workers from a module the game names. `profileSim` and `timeSteps` time a stretch by look, step and step id;
  `formatProfile` prints it (`docs/fit-kit.md`).

A game keeps its own personas, sample rows, tables and gate checks in its `sim/` on top of these.

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

## Testing

`watchpot/test` is the test kit; the core's own tests use it (`test/test/kit.test.ts`). The shelf page, with an
example and the traps, is [docs/test-kit.md](docs/test-kit.md).

- `freshStore(game, { at, now, backend, save, name, seed, catchUp })` returns `{ store, backend, clock, play }`: an
  isolated store on a memory backend (or the one given, which must answer at once) that writes straight through,
  its wall a test clock frozen at `at` (default `T0`, local noon on a fixed day) or following `now`, caught up
  unless `catchUp: false`. `save` puts a save (an export or a raw backend string) under the key first. `play(ms)`
  moves the clock and ticks the store over `ms` at the new now, in one call. Over its default memory backend
  `saveStatus` reads "unsaved" (a memory backend is not durable).
- `testClock(start)`: `now()`, `set(at)`, `advance(ms)`, frozen at a number or following a function.
- `fixtureSave(game, play, options)`: the export a `FixturePlay` (`(store, clock) => void`, a fixture's author playing
  by hand; `Persona` is its deprecated old name) makes on a store seeded `fixture`, the same string every time. Its
  envelope is compatible with what a backend holds, not identical to it. Commit it as a fixture (one per save version,
  permanent) and load it with `freshStore(game, { save })`; `test/core/toy-save-v1.json` is the toy's, which the
  migration tests bring forward to version 3.
- `createAsyncMemoryBackend(entries)`: every call answers a turn later; `peek(name)` reads at once and `idle()`
  settles once every call, and any write it led to, has answered. For the async load and write paths.
- `renderWith(store, ui)`: Testing Library's `render` under `watchpot/react`'s provider, kept across `rerender` (needs
  happy-dom and `@testing-library/react`). A game's test helpers can re-export it beside a `freshStore` bound to the game.
- `await decimalComparisons({ tsconfig, under })`: every place the project compares two Decimals with an operator
  (`<`, `<=`, `>`, `>=`, `==`, `!=`, `===`, `!==`), as `{ file, line, column, operator, text }`. `D(3) < D(20)`
  compiles and is false; use `.lt()`, `.gte()`, `.eq()`. It asks TypeScript 7's checker (`typescript/unstable/sync`,
  so `typescript` 7 must be installed) for each operand's type and flags a comparison only when both sides can be a
  Decimal (`DecimalSource` and `Decimal | null` count; `d === null`, number comparisons and method calls pass).
  `under` lists the folders to check (default: every program file outside `node_modules`). Under a second here; the
  first run on a machine is slower while the native checker loads. A scaffolded game runs it in `test/decimals.test.ts`
  (and its `verify`): `expect(await decimalComparisons({ tsconfig, under: ["src", "sim"] })).toEqual([])`.
