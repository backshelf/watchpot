# Glossary

Every term of art the [guide](guide/01-what-watchpot-is.md) uses, in alphabetical order. Each entry says what the word
means in one or two sentences, links to the chapter that teaches it, and names the reference page to look it up on.
When a definition here and the generated declarations in [`api/`](../api) disagree, `api/` is right.

An entry may open with a line that starts **In short:**: one sentence for a reader who knows none of the jargon.
The site's getting-started pages show it when a word is hovered or tapped (an entry without one shows its first
sentence), so write it in plain words and keep it to one sentence.

## Achievement

Something the player earns once and keeps: a goal checked at the end of every pass, recorded with the game time it
was earned, and by default never wiped by a reset. Because it is a one-way latch, the same factory also opens pages.
Taught in [chapter 7](guide/07-the-first-reset.md#achievements). Reference: [achievements](achievements.md).

## Action

**In short:** Something a player can do, written as a function that changes the state: Simmer's tap.

A function on the store that changes the game, such as Simmer's `tap` or `buyBurner`. It sits beside its feature's
state (`store.getState().pot.tap()`) and changes it through `api.set`. Taught in
[chapter 2](guide/02-your-first-game.md#step-1-a-pot-you-can-tap) and
[chapter 3](guide/03-the-mental-model.md#actions-sit-beside-state). Reference: [start a game](start-a-game.md).

## Answers file

The JSON file that describes a new game to the template's generator: its name, currency, generators, systems, look
and session length. Taught in [chapter 13](guide/13-from-the-template.md#2-write-the-answers-file). Reference:
`templates/game/.scaffold/answers.md`.

## API report

The generated type declarations in [`api/`](../api), one folder per entry, with a doc line on each export. It is the
truth for every name and type the guide uses. Introduced in
[chapter 1](guide/01-what-watchpot-is.md#how-to-read-this-guide).

## Auto-player

The sim lab's stand-in for a person: at each look it buys the best-value move it can afford, again and again, then
takes every free move. It judges value by an [objective](#objective). It is greedy and never bored. In a game with
one wallet it reads the balance by itself; otherwise you pass it a `balance` reader. Taught in
[chapter 12](guide/12-proving-the-pacing.md#teaching-simmer-to-be-played). Reference: [the auto-player](persona.md).

## Autobuyer

An on/off switch the player owns that runs something on a schedule, usually a purchase. The factory does not know what
"buying" is, so a run can be any change. Shown in [the showcases](showcases.md#1-an-autobuyer-that-presses-the-reset).
Reference: [autobuyers](autobuyers.md).

## Backend

**In short:** The place a save's text is kept: in a browser, its local storage.

Where a save's text is kept: anything with `getItem`, `setItem` and `removeItem`. The engine ships
`localStorageBackend` and `createMemoryBackend`; storage over the memory one is not durable, so `saveStatus` reads
"unsaved". Taught in [chapter 9](guide/09-saving-and-time-away.md#where-it-writes).
Reference: `api/core/storage.d.ts`.

## Band

One line of a pacing contract: a floor and a ceiling for one number at one point in the run, such as "35 to 50
burners at a quarter hour". Taught in [chapter 12](guide/12-proving-the-pacing.md#a-pacing-contract). Reference:
[a pacing contract](pacing-contract.md).

## Buff

A timed effect: it starts, runs on game time (through an absence too) and ends, with a rule for what starting it again
does. Its effects are optional; a buff can be a bare named timer. Taught in
[chapter 6](guide/06-the-first-page.md#surprises-and-timed-boosts-spawns-and-buffs) and
[chapter 8](guide/08-effects.md#four-sources-for-one-number). Reference: [buffs](buffs.md).

## Bus (sound)

A channel of the sound mix that a cue plays on. Five exist from the start: `sfx`, `ui`, `music`, `ambience` and
`voice`. Nothing to do with the stats. Taught in [chapter 11](guide/11-look-and-sound.md#sound-the-smallest-correct-form).
Reference: [sound-mix](sound-mix.md).

## Catch-up

**In short:** When a game opens again, the engine pays for the whole time it was closed, in one go.

The pass that pays for time the game was not running: when a page opens, or a hidden tab comes back after more than
five seconds (`AWAY_AFTER_MS`), the engine runs every phase once over the whole gap, with `ctx.dtMs` set to its
length. A shorter gap is paid as live ticks. The store's root action `catchUp()` runs it. Taught in
[chapter 2](guide/02-your-first-game.md#step-5-time-away), [chapter 3](guide/03-the-mental-model.md#two-passes-the-tick-and-the-catch-up)
and [chapter 9](guide/09-saving-and-time-away.md#time-away). Reference: [time away](time-away.md).

## Challenge

A run played under a restriction: entering resets the run, meeting the goal pays something permanent, and its rules
are plain strings other systems can read. Mentioned in [chapter 7](guide/07-the-first-reset.md#beyond-the-first-reset)
and shown in [the showcases](showcases.md#7-a-challenge-rule-that-switches-off-a-group). Reference:
[challenges](challenges.md).

## Clicker

The factory for a button that pays: each press pays `power(state)` into a wallet, may crit, and can be rate-capped.
Taught in [chapter 6](guide/06-the-first-page.md#the-tap-clicker). Reference: [clicker](clicker.md).

## Clock

The engine's own feature, added to every game under the key `clock`, which records when the profile began and when it
last ran. "The clock" also means what `useGameClock` starts: the timer that ticks the store ten times a second. Taught
in [chapter 3](guide/03-the-mental-model.md#the-clock).

## Codemod

A script shipped with a breaking release that rewrites a game's imports and calls to match. It prints what it would
change and applies it only with `--write`. Taught in
[chapter 13](guide/13-from-the-template.md#changing-the-engine-and-a-game-together). Reference: `codemods/README.md`.

## Contribution

An effect together with where it came from: `{ source, effect }`, the source `<feature key>:<id>`. Upgrade trees,
buffs, achievements, loadouts, levels and challenges all hand back contributions, which a stats feature takes in its
`contributions`; one effect given several times by one source is one breakdown row with `times`. Taught in [chapter 8](guide/08-effects.md#stats-and-effects). Reference:
[the stat graph](stat-graph.md).

## Crit

A press that rolls lucky and pays a multiple. A clicker's crit roll uses the feature's own saved random stream, so a
reload cannot reroll it. Taught in [chapter 6](guide/06-the-first-page.md#the-tap-clicker). Reference:
[clicker](clicker.md).

## Cue

A named sound in the game's sound table: what it sounds like (voices, recordings), which bus it plays on, and how the
governor treats it. A screen plays it by name. Taught in
[chapter 11](guide/11-look-and-sound.md#sound-the-smallest-correct-form). Reference: [sound-table](sound-table.md).

## Currency

A kind of money in the game, named once in the vocabulary and held in a wallet. Simmer's is `bubbles`. Taught in
[chapter 4](guide/04-words-and-numbers.md#the-games-words). Reference: [add a currency](add-a-currency.md).

## Decimal

**In short:** The engine's number type: it reaches far past the largest number JavaScript can hold, and never changes in place.

The engine's number type for anything that grows by multiplying (balances, rates, prices), from `break_eternity.js`.
It reaches far past JavaScript's `number`, never changes in place, and compares with methods (`lt`, `gte`), never
with `<`. Taught in [chapter 4](guide/04-words-and-numbers.md#four-habits-with-decimals). Reference:
`api/core/decimal.d.ts`.

## Depth

How far a reset reaches. Every run reset has a depth (1 by default), and a feature whose rule is `{ depth: 2 }` sits
out any shallower reset. It is how a prestige currency survives the reset it pays for. Taught in
[chapter 7](guide/07-the-first-reset.md#depth-what-survives-which-reset). Reference:
[a prestige layer](prestige-layer.md), [layers](layers.md).

## Derived value

A value a feature works out from the state, declared in its `derived` block: `nextPrice: (s) => burnerPrice(s.stove.burners)`. You read it like
any field, but it is never saved and cannot be written. The engine keeps it current, working it out again whenever
something it reads changes. A value that reads another of the same feature goes in a later block of a list,
`derived: [{ nextPrice }, { canBuy }]`. Taught in [chapter 3](guide/03-the-mental-model.md#derived-values).

## Derive

The older engine's way to fill an unsaved field after a load. It is gone; see [derived value](#derived-value).

## Dev panel

`DevPanel` from `watchpot/devtools`: a developer's panel docked over the running game that warps time, shows each
feature's state and edits the save. It renders nothing in a production build. Taught in
[chapter 10](guide/10-the-page.md#the-dev-panel) and [chapter 13](guide/13-from-the-template.md#the-dev-panel).
Reference: [the dev-panel workflow](dev-panel-workflow.md).

## Dimensions

A chain of generators in which each tier makes the one below it, the template's alternative core to a flat generator
list. Mentioned in [chapter 13](guide/13-from-the-template.md#why-a-template-at-all). Reference:
[dimensions](dimensions.md).

## Draft

**In short:** A copy of the state you may change freely inside an action; the engine turns your changes into the next state.

The object a recipe or a step is handed: the whole game state, which you change by assigning to it as if it were plain
data. immer turns the changes into a new state when the recipe returns. Taught in
[chapter 3](guide/03-the-mental-model.md#drafts-and-recipes).

## Draft helper

A function on a feature that takes a draft as its first argument, for use inside a recipe or step where calling an
action is not allowed: `wallet.draft.credit(s, "bubbles", 1)`. Taught in
[chapter 4](guide/04-words-and-numbers.md#the-wallet). Reference: [add a currency](add-a-currency.md).

## Effect

One change to a stat, as data: an amount to add or a factor to multiply by, such as `{ stat: "heat", mul: 1.25 }` or
`{ stat: "heat", add: (q) => q.stove.burners }`; the amount is a number or a function of the state. Upgrades, buffs and
achievements carry effects; the game's `stats` feature folds them. Taught in
[chapter 8](guide/08-effects.md#stats-and-effects). Reference: [the stat graph](stat-graph.md).

## Factory

An engine function that builds a ready-made feature from a description: `defineCurrencies`, `defineGenerators`,
`defineUpgradeTree`, `defineClicker`, `definePrestige`, `defineAchievements` and the rest. Each hands back the feature
with three helper groups: `select` (questions), `def` (its fixed setup) and `draft` (changes inside a recipe). Introduced in
[chapter 5](guide/05-a-real-game.md#2-features-the-content-on-engine-factories); [chapter 6](guide/06-the-first-page.md)
takes five in turn.

## Feature

**In short:** One part of a game (a pot, a shop), declared in one place: its piece of the state and what changes it.

One part of a game, declared in one place: the state it saves (its slice), the actions a player can take on it, and
the steps it runs as time passes. A game is a list of features. Taught in
[chapter 2](guide/02-your-first-game.md#step-1-a-pot-you-can-tap) and
[chapter 3](guide/03-the-mental-model.md#features-and-slices). Reference: [start a game](start-a-game.md).

## Fit table

The one table a game reads its fitted prices from and a fit writes them into: `fitTable<Key>()`. `get(key)` is the
price as a Decimal, shut until the fit has priced it. Taught in
[chapter 12](guide/12-proving-the-pacing.md#what-a-large-game-does-plan-and-fit). Reference: [the fit kit](fit-kit.md).

## Fixture play

The function `fixtureSave` runs to make a save: `(store, clock) => void`, plain calls on a store, typed `FixturePlay`
in `watchpot/test`. Unlike the auto-player it decides nothing; it does exactly what you wrote. Taught in
[chapter 12](guide/12-proving-the-pacing.md#the-test-kit). Reference: [the test kit](test-kit.md).

## Fixture save

A save made by playing a game for a moment in a test (`fixtureSave`), kept as a file so a later build can prove it
still loads. Taught in [chapter 9](guide/09-saving-and-time-away.md#a-worked-migration-renaming-a-field) and
[chapter 12](guide/12-proving-the-pacing.md#the-test-kit). Reference: [a save migration](migration.md).

## Formatter

**In short:** The game's number printers, set up once with the player's choices, so every number on the page reads the same way.

A set of number printers bound to one set of options, such as the player's chosen notation: `formatter({ notation })`
returns `num`, `full`, `rate`, `times`, `plus` and `counted`, each returning a string. `full` prints every digit,
never a suffix, for a headline figure. Taught in
[chapter 4](guide/04-words-and-numbers.md#one-formatter-for-the-whole-game). Reference: [notations](notations.md).

## Fragment shader

A small GPU program that runs once for every pixel of a canvas, every frame, and answers "what colour is this pixel?".
`watchpot/shader` runs fragments you write in GLSL. Taught in
[chapter 11](guide/11-look-and-sound.md#why-a-shader-and-what-one-is). Reference: [shader](shader.md).

## Game

**In short:** The description of a whole game: its features, and where it saves. A store runs it.

What `defineGame` returns: the list of features, the save's key and version, the vocabulary and any step order. It is
a description; a store runs it. Taught in [chapter 3](guide/03-the-mental-model.md#the-game-and-the-store). Reference:
[start a game](start-a-game.md).

## Game time

The time inside the game: the wall clock you hand the store as `now`, plus an offset that only a deliberate warp moves.
Steps read it as `ctx.now`, actions as `api.now()`. Taught in
[chapter 3](guide/03-the-mental-model.md#game-time-and-wall-time). Reference: [time away](time-away.md).

## Gate

In plan and fit, anything with a price or a bar: a purchase, a page that opens at a figure. The fit prices each gate
at the played hour the plan gives it. Taught in
[chapter 12](guide/12-proving-the-pacing.md#what-a-large-game-does-plan-and-fit). Reference:
[plan and fit](plan-and-fit.md).

## Gauge

A bounded level that a rate moves every second, clamped between 0 and a maximum, with an optional trip that locks it at
the top. Taught in [chapter 6](guide/06-the-first-page.md#the-meter-gauge). Reference: [gauge](gauge.md).

## Generator

The building every idle game has: bought with a currency, at a price that grows with each one owned, and making a
currency every second. Simmer's is the burner. Taught by hand in
[chapter 2](guide/02-your-first-game.md#step-6-a-burner-you-can-buy) and on the `defineGenerators` factory in
[chapter 6](guide/06-the-first-page.md#the-generators-generators). Reference: [generators](generators.md),
[add a generator](add-a-generator.md).

## Governor

The part of the sound engine between `play` and the speakers that decides what actually sounds: it turns repeats down,
drops buried sounds, and applies each cue's cooldown and roll. Taught in
[chapter 11](guide/11-look-and-sound.md#the-governor). Reference: [sound-table](sound-table.md).

## Headless

Behaviour without a look. The engine's UI primitives bring focus, keys and ARIA and report their state on `data-*`
attributes, but ship no stylesheet, class name, colour or word. Introduced in
[chapter 1](guide/01-what-watchpot-is.md#the-one-split), taught in [chapter 10](guide/10-the-page.md#the-headless-ui).
Reference: [headless UI](ui.md).

## Idle game

**In short:** A game whose numbers keep growing while you look away, where the choices are what to spend them on to
make them grow faster.

Also called an incremental game. Every one needs the same machinery underneath: numbers too big for JavaScript, a
clock, a save, and pay for the time a player was away. That machinery is what watchpot is. Taught in
[chapter 1](guide/01-what-watchpot-is.md#an-engine-for-idle-games).

## Kernel

The pure functions under a system that do its arithmetic and touch nothing else, such as `costAt` or `stepGauge`. A
factory's feature, a screen and the sim all call the same kernel. Taught in
[chapter 6](guide/06-the-first-page.md#one-pattern-five-times).

## Kept save

The copy of a save the store could not bring forward (too old, a migration that threw, a newer build's, or text that
is not a save), kept untouched under `<save key>.kept` while the player starts fresh. `saveSetAside` says why, for
all but text that is not a save. Taught in
[chapter 9](guide/09-saving-and-time-away.md#a-save-that-cannot-be-brought-forward). Reference:
[a save migration](migration.md).

## Levels

Experience tracks with curves that read both ways (level from experience and back). Shown in
[the showcases](showcases.md#8-levels-that-count-time-on-display). Reference: [levels](levels.md).

## Migration

A function that turns saved data from one version into the next, so a renamed or reshaped field survives an update. It
is keyed by the version it produces. Taught in [chapter 9](guide/09-saving-and-time-away.md#versions-and-migrations).
Reference: [a save migration](migration.md).

## Milestone

An owned count at which a generator's output is multiplied, such as "doubles at 10, 25, 50 and 100". Global
milestones apply to every generator once the lowest count reaches them. Taught in
[chapter 6](guide/06-the-first-page.md#the-generators-generators). Reference: [generators](generators.md).

## Move

Something the sim's auto-player could do right now, as a feature describes it: an `id`, a `cost`, an `apply` that
plays it through the store, and, when the [objective](#objective) cannot see what it does, a `worth`. Taught in
[chapter 12](guide/12-proving-the-pacing.md#teaching-simmer-to-be-played). Reference: [the auto-player](persona.md).

## Notation

**In short:** How a number too long to read is written short: 1.52M, 1.52e6, or one of three other ways a player can pick.

The way numbers read past the plain range: `suffix` (the default), `scientific`, `engineering`, `letters` or
`logarithm`. Taught in [chapter 4](guide/04-words-and-numbers.md#one-formatter-for-the-whole-game). Reference:
[notations](notations.md).

## Offline credit

How much of an absence a game pays for: the time away, cut at a cap and multiplied by a rate. Simmer's stove pays
half, for two hours at most. `offlineCredit(elapsedMs, rate, capMs)` does the arithmetic, and `offlineSteps` adds how
to replay it in slices for growth that compounds. Taught in
[chapter 9](guide/09-saving-and-time-away.md#a-rate-and-a-cap). Reference: [time away](time-away.md).

## Pacing contract

What you meant the pacing to be, written as data the sim checks: bands for numbers at points in the run, plus rules
such as a longest wait. Taught in [chapter 12](guide/12-proving-the-pacing.md#a-pacing-contract). Reference:
[a pacing contract](pacing-contract.md).

## Pack

A set of recorded sounds built at build time from a folder of audio files, evened out and trimmed, that cues can draw
takes from. Taught in [chapter 11](guide/11-look-and-sound.md#where-recordings-come-in). Reference:
[sound-packs](sound-packs.md).

## Pass

**In short:** One run of the game's steps over some time: a tick while the game is open, or the catch-up for time it was closed.

One run of every phase over a stretch of time. There are two kinds: the tick, for live play, and the catch-up, for time
away. A step can be limited to one with `pass: "tick"` or `pass: "catchUp"`. Taught in
[chapter 3](guide/03-the-mental-model.md#two-passes-the-tick-and-the-catch-up).

## Peer

A package the engine imports but leaves for your game to install, so that the game and the engine share one copy:
React, immer, zustand and break_eternity.js. Some are optional, needed only by the entry that uses them: zzfx for
`watchpot/sound`, three and @react-three/fiber for `watchpot/three`. Taught in
[chapter 2](guide/02-your-first-game.md#packagejson).

## Objective

The one number the sim's auto-player tries to grow, usually income a second: `autoPlayer(game, { objective })`. A
move with no `worth` is worth how far it raises the objective. Taught in
[chapter 12](guide/12-proving-the-pacing.md#teaching-simmer-to-be-played). Reference: [the auto-player](persona.md).

## Persona

A player, as the reference shelf's [persona](persona.md) page uses the word: either the sim's auto-player or a fixture
play. The code names each kind on its own (`autoPlayer`, `FixturePlay`). See [auto-player](#auto-player) and
[fixture play](#fixture-play).

## Phase

**In short:** A stage of every tick, run in a fixed order; income is paid in the one called `produce`.

A named stage of a pass. There are eight, always in this order: `guard`, `sync`, `rates`, `produce`, `automate`,
`settle`, `commit`, `after`. Every step in one phase runs before any step in the next. Taught in
[chapter 3](guide/03-the-mental-model.md#the-eight-phases).

## Plain store

The store the sim plays on: the same features, steps and derived values, on plain data, with no save. It is
much faster than the real store. `simStore(game, now, seed)` makes one. Taught in
[chapter 12](guide/12-proving-the-pacing.md#a-run). Reference: [watchpot/sim](sim.md).

## Plan and fit

The large-game way to set prices: write down the played hour each gate should open, let the sim play and price each
gate at what the player holds then, and replay to prove it. Taught in
[chapter 12](guide/12-proving-the-pacing.md#what-a-large-game-does-plan-and-fit). Reference:
[plan and fit](plan-and-fit.md).

## Played hours

Time a person spends at the game, paying attention, as opposed to hours of a tab left in the background. Pacing is
planned and judged in played hours. Taught in [chapter 12](guide/12-proving-the-pacing.md#played-hours). Reference:
[a pacing contract](pacing-contract.md).

## Prestige

A reset that pays: the player gives up the run for a currency that lasts and makes the next run faster.
`definePrestige` pays and resets in one update. Taught in
[chapter 7](guide/07-the-first-reset.md#prestige-a-reset-that-pays). Reference: [a prestige layer](prestige-layer.md).

## Primitive

One of the headless components in `watchpot/ui`, such as `Pressable`, `Dialog` or `Tabs`. Taught in
[chapter 10](guide/10-the-page.md#the-headless-ui). Reference: [headless UI](ui.md).

## Profile reset

`resetProfile()`: every feature back to `initial` whatever its reset rule, as if the player had never played. It is
the "delete my save" button, not a game mechanic. Taught in
[chapter 3](guide/03-the-mental-model.md#two-kinds-of-reset) and
[chapter 7](guide/07-the-first-reset.md#resetprofile-starting-over-for-real).

## Proof

The check that a fitted price table is right: the finished table is played again between the fit's snapshots, and
each stretch must end exactly where the fit's own run stood. Taught in
[chapter 12](guide/12-proving-the-pacing.md#what-a-large-game-does-plan-and-fit). Reference: [the fit kit](fit-kit.md).

## Reach

A feature's list of the other features it touches. It types the draft (`s.pot` exists in the stove's steps) and is
checked when the game is defined. Written as a function, `reach: () => [pot, lid]`, it may name a feature further
down the file. It is not transitive. See also [type reach](#type-reach). Taught in
[chapter 3](guide/03-the-mental-model.md#reach-one-feature-touching-another).

## Recipe

The function you hand `api.set`: it receives a draft and changes it. (The reference shelf's [recipes](recipes.md) page
is something else: the crafting system.) Taught in [chapter 3](guide/03-the-mental-model.md#drafts-and-recipes).

## Reduced motion

The player's wish for less movement, from the operating system or the game's own setting. The runtime hook writes
the motion to use on `<html>` as `data-motion` ("reduced" or "full", the OS deciding when the setting is "system"), so
CSS reads that one attribute; a shader holds one still frame. Taught in
[chapter 10](guide/10-the-page.md#one-primitive-start-to-finish) and
[chapter 11](guide/11-look-and-sound.md#the-backdrop). Reference: [feel](feel.md), [shader](shader.md).

## Registry

The template's styled components, copied into a new game's `src/ui/`: a button, a panel, a sheet and more, each a thin
wrapper over a headless primitive. Once copied they are the game's own. Taught in
[chapter 10](guide/10-the-page.md#the-copy-in-registry). Reference: `templates/game/src/ui/README.md`.

## Reset

Short for a run reset: the run ends, and each feature follows its reset rule. See [run reset](#run-reset). Taught in
[chapter 7](guide/07-the-first-reset.md#what-a-run-is).

## Reset pace

`resetPace(gain, kept, seconds)`: how fast a reset now would grow what the player keeps, in orders of magnitude a
second. It rises, peaks and falls over a run, and "past its peak" is the moment to reset. Every prestige layer keeps its
run's best and serves `pace` and `pastPeak` on its slice. Taught in
[chapter 7](guide/07-the-first-reset.md#is-it-worth-pressing). Reference: [a prestige layer](prestige-layer.md).

## Reset rule

A feature's `reset` option: what a run reset does to its slice. `"run"` (back to `initial`, the default), `"never"`,
`{ keep: [...] }`, a function, or `{ depth, rule }`. Taught in [chapter 7](guide/07-the-first-reset.md#reset-rules).

## Root action

An action the store adds at the top level, beside the features: `tick`, `catchUp`, `gameNow`, `resetRun`,
`resetProfile`, `exportProfile` and `importProfile`. Taught in
[chapter 3](guide/03-the-mental-model.md#actions-sit-beside-state).

## Run

Everything the player builds between two resets: the balance, the generators, the run's upgrades. Taught in
[chapter 7](guide/07-the-first-reset.md#what-a-run-is).

## Run reset

`resetRun()`: ends the run. Each feature follows its reset rule, the clock's run anchors move to now, and transient
state is derived again. Taught in [chapter 3](guide/03-the-mental-model.md#two-kinds-of-reset) and
[chapter 7](guide/07-the-first-reset.md#resetrun-the-reset-itself).

## Runtime hook

`useGameRuntime`, called once at the top of a page: it starts the clock, watches for other tabs, writes the motion and
colour scheme onto `<html>` (following the OS unless told otherwise), and unlocks sound. Taught in
[chapter 10](guide/10-the-page.md#starting-the-page-the-runtime-hook).

## Save

**In short:** The game's state written out as text and kept in the browser, so closing the page loses nothing.

The store's slices written out as text with a version number, kept in a backend and written at most a second after a
change, and at once when the page hides. Functions and transient keys are left out. Taught in [chapter 2](guide/02-your-first-game.md#step-4-the-save)
and [chapter 9](guide/09-saving-and-time-away.md#what-is-saved-and-when). Reference: [a save migration](migration.md).

## Schedule

When the sim's player is at the game: `activeSchedule` (every hour, for played-hour pacing), `fixedSchedule` (a waking
day) or a `SessionSchedule` (a lifelike week). Taught in
[chapter 12](guide/12-proving-the-pacing.md#played-hours). Reference: [a pacing contract](pacing-contract.md).

## Selector

**In short:** A small function that picks the one value a component shows out of the whole state: `(s) => s.pot.bubbles`.

A small function that picks one value out of the whole state for a component: `(s) => s.wallet.bubbles`. A selector
that builds a new object or Decimal every time loops forever (a development build warns first); wrap it in
`useShallow`. Taught in
[chapter 10](guide/10-the-page.md#reading-one-figure-usegamestate).

## Shader

A program that runs on the graphics card. In this guide it means a fragment shader drawn by `ShaderCanvas`. Taught in
[chapter 11](guide/11-look-and-sound.md#why-a-shader-and-what-one-is). Reference: [shader](shader.md).

## Sim lab

`watchpot/sim`: the part of the engine that plays a game headless, on a clock it owns, as fast as the machine allows,
so you can measure pacing. Taught in [chapter 12](guide/12-proving-the-pacing.md#why-you-cannot-just-play-it).
Reference: [the auto-player](persona.md), [a pacing contract](pacing-contract.md).

## Slice

**In short:** The piece of the state one feature holds, under its name: the pot's slice is `{ bubbles }`.

The state one feature holds, under its key: the stove's slice is `{ burners, off, perSecond }` at `s.stove`. Taught in
[chapter 3](guide/03-the-mental-model.md#features-and-slices).

## Snapshot

The whole sim at one moment of play, saved as plain data: the store, the clock and the auto-player's memory. A fit
leaves one every so often, and a later fit can carry on from it instead of starting over. Taught in
[chapter 12](guide/12-proving-the-pacing.md#what-a-large-game-does-plan-and-fit). Reference: [the fit kit](fit-kit.md).

## Softcap

A point past which a stat grows more slowly: above `start`, the value is bent by `power`. A hardcap is a ceiling it
never passes. Taught in [chapter 8](guide/08-effects.md). Reference: [stats](stat-graph.md#effects).

## Spawn

A random arrival the player can catch for a short while, drawn from a table of outcomes on its own saved random stream.
Taught in [chapter 6](guide/06-the-first-page.md#surprises-and-timed-boosts-spawns-and-buffs). Reference:
[spawns](spawns.md).

## Stat

A named number that many things can change, such as Simmer's `heat` (what multiplies the stove's rate) or a game's `print`.
Effects name the stat they change. Introduced in [chapter 3](guide/03-the-mental-model.md#a-first-stat); taught in
[chapter 8](guide/08-effects.md#stats-and-effects). Reference: [the stat graph](stat-graph.md).

## Stat graph

What the stats feature is built on (`statIndex`): sources indexed once, read over one state, each stat worked out in
Decimals on first read, with flags, mute groups, `times` and stats that read other stats. A game uses it directly for
a state that never lives in the store (scoring a loadout being weighed). Reference:
[stats](stat-graph.md#one-graph-by-hand-statindex).

## Stats feature

The one place every effect in the game is folded into named stats: `defineStats({ key, vocab, stats, sources,
contributions })`. Each stat's base is declared once; each stat is a derived value on the state (`s.stats.output`, a
Decimal), never saved, worked out again only when something it read changes. Adds are summed, multipliers multiplied,
then the caps. Introduced in [chapter 3](guide/03-the-mental-model.md#a-first-stat); taught in
[chapter 8](guide/08-effects.md). Reference: [stats](stat-graph.md).

## Step

**In short:** A function a feature runs as time passes, such as the pot's simmer: on every tick it is handed the time that passed.

A function a feature runs on every pass, placed under a phase and given a name: `steps.produce.simmer`. It gets the draft
and a context with `dtMs`, `now` and `pass`. Taught in [chapter 2](guide/02-your-first-game.md#step-3-the-clock) and
[chapter 3](guide/03-the-mental-model.md#the-tick).

## Still

What a shader canvas shows in its place when there is no WebGL2 or the fragment fails to compile: a CSS version of the
same idea. Taught in [chapter 11](guide/11-look-and-sound.md#the-backdrop). Reference: [shader](shader.md).

## Store

**In short:** The object that holds a running game's whole state, beside the actions that change it.

What `createIdleStore` makes from a game: one object holding every feature's slice and actions, plus the root
actions, which loads and writes the save. It is a zustand store. Taught in
[chapter 2](guide/02-your-first-game.md#step-1-a-pot-you-can-tap) and
[chapter 3](guide/03-the-mental-model.md#the-game-and-the-store). Reference: [start a game](start-a-game.md).

## Tag

A released version of the engine, an annotated git tag such as `v0.17.0`. A game installs the engine by its tag.
Taught in [chapter 1](guide/01-what-watchpot-is.md#what-you-need) and
[chapter 13](guide/13-from-the-template.md#1-get-the-template-at-a-tag). Reference: the README's
[Install](../README.md#install) section.

## Template

`templates/game/` in the engine's repository: a complete running game holding every option. One command,
`templates/game/.scaffold/new.ts`, copies it and cuts it down to the systems you chose. Taught in
[chapter 13](guide/13-from-the-template.md#how-the-template-works).

## Tick

**In short:** One small step of time: about ten times a second, the engine moves the game on by the time that passed.

A live pass: the store's `tick(dtMs)` runs every phase for one small slice of time, usually ten times a second. Taught
in [chapter 2](guide/02-your-first-game.md#step-3-the-clock) and [chapter 3](guide/03-the-mental-model.md#the-tick).

## Token

A named design value in CSS, such as `--ui-accent`. A game's palette and type live in `design/tokens.json`, compile to
CSS, and every styled component and shader reads tokens rather than hard-coded colours. Taught in
[chapter 10](guide/10-the-page.md#tokens-and-the-theme-compiler-in-brief) and
[chapter 11](guide/11-look-and-sound.md#the-backdrop). Reference: [a theme](theme.md).

## Transient

A field in a feature's `initial` that is never saved: a sheet that is open, or a rate a step works out from the clock.
After a load it starts from `initial` again. A number worked out from the state alone is a
[derived value](#derived-value) instead. Taught in
[chapter 3](guide/03-the-mental-model.md#state-that-does-not-save-transient) and
[chapter 9](guide/09-saving-and-time-away.md#what-is-saved-and-when).

## Type reach

Naming another feature in `reach` by its state type, `reach<{ stove: { burners: number } }>()`, instead of by the
feature itself. Two features that read each other need it on one side. Taught in
[chapter 3](guide/03-the-mental-model.md#reach-one-feature-touching-another) and [chapter 8](guide/08-effects.md#reading-the-stat-where-it-applies).

## Uniform

A value a shader reads that is the same for every pixel of one frame, set from JavaScript, such as the pot's warmth.
Taught in [chapter 11](guide/11-look-and-sound.md#why-a-shader-and-what-one-is). Reference: [shader](shader.md).

## Upgrade tree

A set of nodes bought one rank at a time, each with a cost, requirements and effects. With one rank and no
requirements it is a shop. Taught in [chapter 6](guide/06-the-first-page.md#the-shop-upgradetree). Reference:
[an upgrade tree](upgrade-tree.md).

## Vocabulary

A game's words, declared once with `vocab`: its currencies, its stat ids and its rarity ladder. Every engine type that
names a currency reads it from there. Taught in [chapter 4](guide/04-words-and-numbers.md#the-games-words). Reference:
[add a currency](add-a-currency.md).

## Wallet

The feature `defineCurrencies` makes: one balance per currency in a vocabulary, with `credit` and `debit` as actions
and as draft helpers (`wallet.draft`), questions under `wallet.select`, and optional running totals. Taught in [chapter 4](guide/04-words-and-numbers.md#the-wallet).
Reference: [add a currency](add-a-currency.md).

## zzfx voice

A synthesised sound described by numbers (a wave, a pitch, an envelope), so a cue can sound with no recording at all.
Taught in [chapter 11](guide/11-look-and-sound.md#sound-the-smallest-correct-form). Reference:
[sound-table](sound-table.md).
