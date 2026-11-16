# The engine's systems

Before writing a mechanic, find it here. Each is a feature factory in `watchpot/core`, named `defineX`, with a recipe
page in `node_modules/watchpot/docs/<name>.md` (or `ENGINE/docs/` in a checkout) and a type-checked example beside it;
adding one to a game is a content file, a factory call, a line in `defineGame`, a screen, and a row in the pacing
contract. The engine's `README.md` › Systems is the reference for all of them, `docs/glossary.md` the words, and
`docs/migrating-to-1.0.md` the list of what changed from 0.x if an old game or an old snippet turns up. If the
mechanic you want is not here, see "When the engine lacks it" below.

| The game wants | Use | Recipe page |
| --- | --- | --- |
| Buildings that make a currency a second, prices that climb, buy 1 / 10 / max | `defineGenerators` | `generators.md` |
| Businesses on a timer that you start, then automate; milestones at 25 / 50 / 100 owned | `defineGenerators` with `cycle`, `milestones`, `automated` | `generators.md` |
| A chain where each tier makes the tier below; every ten bought doubles the tier | `defineDimensions` (+ `definePrestige` for the boost above it) | `dimensions.md` |
| A thing to press that pays, crits, combos | `defineClicker` (`clickShare` for "a share of income per press") | `clicker.md` |
| Stacked reset layers, each earned by resetting the ones beneath | `defineLayers` | `layers.md` |
| One reset layer that pays a permanent currency | `definePrestige` (`payInto` a wallet; it keeps the reset pace) | `prestige-layer.md` |
| A wall of achievements that multiply everything | `defineAchievements` (+ `AchievementGrid` in `watchpot/ui`) | `achievements.md` |
| A run under a restriction for a permanent reward | `defineChallenges` | `challenges.md` |
| Things that buy for you on an interval | `defineAutobuyers` | `autobuyers.md` |
| A timed bonus (x7 for 77 seconds) | `defineBuffs` | `buffs.md` |
| Something that appears at random and must be caught | `defineSpawns` (pays a `defineBuffs` buff, a windfall) | `spawns.md` |
| An upgrade tree | `defineUpgradeTree` (+ `TreeGraph`) | `upgrade-tree.md` |
| Pulls from a rarity ladder with pity | `defineGacha` and the gacha kernel | `gacha.md` |
| Workers across jobs; energy across bars that fill and level | `defineAllocation` | `allocation.md` |
| Send something away, collect it later | `defineMissions` | `missions.md` |
| Turn these into those | `defineCrafting` | `recipes.md` |
| Experience and levels, per skill | `defineLevels` | `levels.md` |
| A gauge that fills and trips | `defineGauge` | `gauge.md` |
| A loadout of equipped things | `defineLoadout` | `loadouts.md` |
| Prices that wander, buy low and sell high (give it a `trader`: nobody times trades by hand) | `defineMarket` | `market.md` |
| Pieces on a grid that read their neighbours | `defineBoard` | `board.md` |
| A timing bar with graded strikes | `defineSweep` | `sweep.md` |
| Tracks of walls worn down by a force | `defineStages` | `stages.md` |
| A timed event with a board | the events framework | `timed-event.md`, `events.md` |
| Statistics: this run, lifetime, best, last ten runs | `defineRecords` | `records.md` |
| A daily claim and a streak | `defineStreak` | `streak.md` |
| Every number that effects fold into (output, offline share, a reset's gain) | `defineStats` (the scaffold has one) | `stat-graph.md` |
| Settings and seen-once flags | `defineSettings`, `defineSeenOnce` | `settings.md` |
| Choices that belong to the device (quality, volume) | `prefs` | `prefs.md` |
| Prices, bulk buys, "how many can I afford", milestone ladders | `costAt`, `costOfMany`, `maxAffordable`, `reached` | never hand-write these |
| Big numbers in five notations | `fmt`, `formatter`, `NOTATIONS` | `notations.md` |
| Offline progress, a journal of it | each system's `away` option; `catchUp`, `catchUpSteps` | `time-away.md` |
| A pacing contract and an auto-player | `watchpot/sim` | `pacing-contract.md`, `persona.md` |
| Fitting a big game's prices, snapshots, the proof, a profiler | `watchpot/sim`: `fitTable`, `runFit`, `proveFit`, `profileSim` | `plan-and-fit.md`, `fit-kit.md` |

For the page: `watchpot/ui` (headless: `Dialog`, `Tabs`, `Progress`, `Tooltip`, `TileGrid`, `AchievementGrid`,
`TreeGraph`, `Pressable`, `HoldButton`, `FloatingNumbers`, `Toaster`, `BuyAmount`, `PageShell`; `ui.md`),
`watchpot/shader` (`shader.md`), `watchpot/kit` (effects with no look: reduced motion, shake, flight, confetti, the
ticker, gestures, marks, the director, `Count`; `feel.md`), `watchpot/sound` (`sound-table.md` and the pages after it),
`watchpot/react` (the store hooks, clocks and the runtime hook; `react-runtime.md`), `watchpot/devtools` (the dev
panel and the sound desk; `dev-panel-workflow.md`), `watchpot/test` (the test kit), and for 3D `watchpot/three`
(`three.md`). There is no `watchpot/hooks`: its hooks are in `watchpot/react`.

## How features fit together

What the engine gives the game's own code, so none of it is written by hand (`examples/invention.ts` is one file that
uses all of it, type-checked):

- **A factory returns the feature plus three namespaces.** `select` (read-only questions over the game state),
  `def` (fixed configuration) and `draft` (helpers that take a draft first, named like the actions):
  `producers.select.price(state, id)`, `wallet.draft.credit(draft, "ash", n)`. A `select` or `draft` helper takes the
  state that holds the slice under its key, never the slice. Actions on the state are unchanged
  (`state.generators.buy(id)`).
- **`reach` is how a feature reads another.** `reach: () => [wallet, stats]` (lazy, so a feature declared further down
  the file may be named). Two features that read each other: one reaches by value, the other by state type:
  `reach<{ lid: LidState }>()`. A callback's state is then inferred from the reach: there is no hand-written
  whole-game state type and no `(s: GameDraft) => …` annotation to keep in step.
- **A computed value is `derived`**, one declaration on the feature: `derived: { perSecond: (s) => … }`. Never saved,
  never written, worked out again only when a slice it read changed, ordered by who reads whom. It replaces a
  transient field, a `derive` function and a `rates` step that repeated it.
- **Effects go through `defineStats`.** Every number the effects fold into is a stat declared once with its base
  (`stats: { output: { base: 1 } }`), read as a Decimal off the state (`s.stats.output`). A feature that raises one
  gives its `contributions` (a tree's ranks, a collection's copies, the running buffs) or a `source` that reads the
  state; an effect is `{ stat, add }` or `{ stat, mul }`, the amount a number or a function of the state. The
  breakdown behind a number for a tooltip is `stats.select.explain(state, "output")`. Never fold effects in a
  function of the game's own.
- **A step names its pass and its order.** Steps run in phases (`guard, sync, rates, produce, automate, settle, commit,
  after`). A `produce` step is `{ pass: "tick" | "catchUp" | "both", run }`, because one that pays in a catch-up pays
  all the time away. A step that has to run in a place says `after: "feature.phase.step"` (or `before`, or a feature
  key for all of its steps in that phase). `defineGame` takes no `order`.
- **A reset layer keeps its own pace.** `definePrestige` holds `runStart`, `peak`, the derived `pace` and `pastPeak`;
  never keep a game's own copy. `payInto: { wallet, currency }` credits a wallet currency instead of the layer holding
  one; that currency's `depth` must be deeper than the layer's (`depth: { cinders: "never" }`). Without a `worth` the
  layer declares no move for the sim.
- **A wallet's totals say which kind they are**: `earnedThisRun` (wiped by a reset, what a prestige pays on) or
  `earnedEver` (never wiped), `spentThisRun` / `spentEver`, and `depth` for which reset takes a balance.
- **The sim is plain data.** Features declare `moves`; the auto-player plays them for an `objective` (what the player is
  trying to grow, read off the state: income a second); a move that does not move it at once (an unlock, a cap, a
  reset) states its own `worth`. Prove once, in a test, that the sim's store and the page's agree (`plainParity`).
- **Dev tools are `watchpot/devtools`**: `DevPanel` on a `#dev` route, in development builds only.

Cost curves round up by default (`round: "none"` keeps fractions), and an upgrade-tree node with more than one rank
states its `costGrowth` (a flat price is `costGrowth: 1`); a game whose old numbers must not move says both out loud
(`docs/migrating-to-1.0.md` › Keeping your numbers).

## Shapes

A shape is the core loop plus the systems that make it a genre. Offer three in the interview, picked for the
fiction; these are starting points to combine, not a menu to read out.

| Shape | Core | With | The player's rhythm |
| --- | --- | --- | --- |
| **Clicker** | `defineClicker` + `defineGenerators` | `defineAchievements`, `defineSpawns` + `defineBuffs`, `definePrestige`, an upgrade tree | press, buy, catch the lucky thing, reset |
| **Dimensions** | `defineDimensions` | `definePrestige` as boosts, `defineAutobuyers`, `defineChallenges`, `defineAchievements` | buy tens, watch the chain compound, break through a wall |
| **Layers** | `defineLayers` | its own upgrades, buyables, milestones, challenges | reset upward, each layer changing the ones below |
| **Businesses** | `defineGenerators` with cycles | `defineAutobuyers` as managers, milestones, `definePrestige` | start timers, hire them away, chase 25 / 50 / 100 |
| **Collector** | `defineGenerators` | gacha, an upgrade tree, `defineMissions`, `defineLoadout` | earn, pull, equip, send away |
| **Colony** | `defineAllocation` | `defineCrafting`, `defineGenerators`, `defineLevels`, a `defineGauge` | assign, convert, unblock the next resource |
| **Grinder** | `defineLevels` + `defineMissions` | `defineCrafting`, `defineLoadout`, `defineAchievements` | pick an action, level it, unlock the next |
| **Trader** | `defineMarket` with a `trader` | `defineGenerators`, `defineStats` sources, `definePrestige` | spend, watch the market compound, reset |

The scaffold wires the generators and dimensions cores and the features it knows
(`ENGINE/templates/game/.scaffold/answers.md`). The rest are added in the build by their recipe pages: that is ten to
thirty lines each, and it is where a game stops being the template.

## When the engine lacks it

Every game is expected to invent at least one mechanic. Sort it before writing it:

- **Specific to this game's fiction** (it only makes sense with these nouns): it lives in the game, as a `feature()`
  built on the engine's primitives, with `derived`, `reach`, `defineStats` sources and `moves` as above.
- **Generic** (another game could use it with different words; a rule, a factory, a hook, an effect, a headless
  component, a GLSL chunk): it is built **in the engine**, not the game: named for no game, words as data, with tests,
  a `docs/<name>.md` recipe and example, a README line, a `CHANGELOG.md` line and a refreshed API report (`bun run
  api`), then released and installed in the game. The engine's own `AGENTS.md` and `.claude/CLAUDE.md` hold its rules
  and its release steps; the game's `.claude/CLAUDE.md` says where the engine's checkout is and who releases. The
  game then holds only its content for it.

When unsure, it is generic. The test: strip the game's nouns from the function names; if what is left still reads as a
thing, it belongs in the engine. Before the session ends, sweep the game's `src/` for anything that passes that
test and move it. Never copy engine source into a game, and never edit `node_modules/watchpot`.
