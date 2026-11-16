# Getting started: the outline

The getting-started part of the guide, rebuilt as interactive pages for a reader who programs but has never made a
game and knows none of the words: not the engine's (feature, slice, reach, derived, pass, step), not state
management's (store, draft, selector), not idle games' (prestige, offline progress, soft cap). One idea a page. Each
page runs a real game on the engine beside its text, and most let the reader turn something and watch it change.

It covers what chapters 1 to 6 of the markdown guide cover, re-cut. Chapters 7 to 13 and the reference pages stay as
they are, and they assume this sequence's words.

**This file is read by the build**: each `## N. Title` heading is a page, in order. A page that exists is
`pages/NN-slug.tsx` and its `title` must match its heading here (a test checks it); a heading with no page yet is
drawn in the progress strip as a step still to come. Keep the headings' form.

Each entry says: the one idea; what the reader does; what they see change; the glossary words it introduces (each
gets its popup on first use; a word not introduced yet is not used); and which example it teaches, named by file and
exported symbol (never by line: the examples are edited in place).

The running example is Simmer (`docs/examples/simmer/*` and the `guide-*.ts` files built on it). Note for the
writers of pages 9 to 13: the examples are being reworked (a stats feature with one `heat` stat from the mental-model
step on, the stove's rate a derived value that reads it, the lid a source on the stat). The symbols named below for
those pages are the ones the rework is expected to export; check the files before writing.

## 1. What an idle game is

- **Idea.** An idle game is a number that grows while you watch, and things to spend it on that make it grow faster.
  Under every one is the same machinery, and that machinery is what the engine is: it keeps the numbers, moves time
  forward, saves, and pays for the time you were away.
- **The reader does.** Plays the finished first game (tap the pot, light a burner) in the panel. Switches the clock
  off and on. Sends themselves away for a chosen time (a slider from a minute to a day) and comes back.
- **They see.** The count stop and start with the clock; on coming back, the count jump by what the time away paid,
  and a line saying so. A tick counter and the save's own text, updating.
- **Words.** idle game, tick, save, catch-up.
- **Teaches.** No code to read yet. The panel runs `simmer/game.ts` (`game`) whole; the page links its source.
- **Departs from chapter 1** by leaving out the entry table, the install and the "how to read this guide": those are
  reference, linked at the end. It keeps the one split (the engine has no look) as a single paragraph.

## 2. The state: what the game remembers

- **Idea.** Everything a game knows is plain data, its state. You declare a piece of it as a feature: a name and a
  starting value.
- **The reader does.** Turns a stepper for the pot's starting bubbles; switches between the state as the game holds it
  and the state as it is saved.
- **They see.** `initial` in the code change to the value chosen (the token marked), and the state readout start over
  from it. The engine's own `clock` slice beside the pot's.
- **Words.** state (plain), feature, slice, Decimal (one line: a number that can grow past JavaScript's; page 8 says
  more), game, store.
- **Teaches.** `simmer/game.ts`: `pot > key`, `pot > initial` (the pot with its actions and steps folded away),
  `game`, `store`.
- **Departs from chapter 2** by teaching state on its own before any action or clock: chapter 2 wrote all three at
  once.

## 3. A button: the action

- **Idea.** A player changes the game through actions: functions that edit a draft of the state, which the engine
  turns into the next state.
- **The reader does.** Edits the pot's `actions` in the code box: tap for 5 instead of 1; then deletes `s.pot.bubbles =`
  and watches nothing happen; then adds a second action. Presses the panel's buttons for each.
- **They see.** The button pay what their code says. A mistake explained in plain words, and the last version that
  worked still running.
- **Words.** action, draft.
- **Teaches.** `simmer/game.ts`: `pot > actions` (edited), and the store's `getState().pot.tap()`.
- **Code box.** The first. The lesson is typing it: `s.pot.bubbles = s.pot.bubbles.add(1)` and why the `=` matters.

## 4. Time moves: the tick

- **Idea.** Ten times a second the engine runs every feature's steps for the time that passed. A step that pays
  multiplies its rate by the time, so it pays the same whatever the tick's length.
- **The reader does.** Slides the page clock's tick length (50 ms to 1 s: past a second the engine splits a tick in
  two, which would muddle the strip); switches what each tick pays between the rate times the time and the rate once.
- **They see.** A strip of the last three seconds with a mark per tick, as tall as what it paid; "paid a second"
  holding at 1.00 at every tick length, and with the multiply off swinging from 20 (50 ms) to 1 (1 s, right by luck).
  The token `(SIMMER_PER_SECOND * ctx.dtMs) / 1000` marked in the code. The last tick's real length (98, 104 ms).
- **Words.** tick, step, phase (one line: `produce` is where income is paid; the others come later).
- **Teaches.** `simmer/game.ts`: `pot > steps`, `SIMMER_PER_SECOND`.

## 5. On a page: React reads the store

- **Idea.** The page is React components that read the store with a hook and call actions on a press. The clock is
  started once, at the top.
- **The reader does.** Taps the pot on Simmer's own page; leaves the `useGameClock` call out and puts it back; swaps
  the pot's selector for `s.pot.bubbles.floor()` (a new Decimal on every call, the classic mistake in its most
  innocent form) and back.
- **They see.** The whole of `main.tsx` (`App`, with `Pot` and `Stove`) drawn in the panel by its own components
  against its own store; the count stop with the hook left out while taps still work; the panel say in plain words
  that React stopped drawing the page, and why.
- **Words.** selector; component and hook (plain).
- **Teaches.** `simmer/main.tsx`: `Pot`, `App`, `mountGame`; the `createRuntimeHooks` line (`useGameState`).

## 6. Saving, without writing any

- **Idea.** The store saves itself: a second after a change at most, and at once when the page hides. A save is the
  state as text, with a version.
- **The reader does.** Plays, then presses "reload" (the panel makes a new store over the same storage); switches the
  save's `key` to another name and back; stops the clock and taps once; "start over" (`clearSave`).
- **They see.** A strip of the last five seconds: a dot for every change to the state (ten a second), a bar for every
  write (one a second, or one a second after a lone tap). The save's text, open, with each Decimal's `{"$d": …}`
  marked, and the clock slice in it. After a reload, the count come back; under another key, a new game, and the old
  one back when the key returns.
- **Words.** save, backend.
- **Teaches.** `simmer/game.ts`: `game` (`save: { key, version }`), `store`; `guide-saving.ts`: `startOver`.

## 7. Time away: the catch-up

- **Idea.** When the page opens, the engine first pays for the time it was closed, in one pass. Each paying step says
  whether it runs then (`pass`).
- **The reader does.** Chooses "away for" (a minute to a week) and comes back; lights burners with what it paid;
  switches the stove's `pass` between `"both"`, `"tick"` and `"catchUp"`; closes the tab for a minute for real.
- **They see.** Simmer's own page in the panel (as on page 5) and its own welcome-back note, `AwayNote`, saying what
  the absence made; the stove paying for it or not; the engine's own list of the steps each pass runs
  (`resolvedSteps`), the burn leaving the catch-up's; the code's `pass` token marked.
- **Words.** catch-up, pass, offline progress (plain).
- **Teaches.** `simmer/game.ts`: `pot > steps > produce > simmer`, `stove > steps > produce > burn`;
  `simmer/main.tsx`: `summarize`, `AwayNote` (`useAwayReport`).

## 8. Numbers too big for JavaScript: Decimal

- **Idea.** Idle numbers grow by multiplying and pass JavaScript's limit (about 1.8e308); a Decimal does not. It never
  changes in place and compares with methods.
- **The reader does.** Slides the zeros from 1 to 1000; switches `covers` between `balance.gte(price)` and
  `balance >= price`.
- **They see.** A plain number turn into `Infinity` past 308 (ruled through, on a scale whose far side is hatched)
  while the Decimal carries on; every balance from 0 to 30 asked whether it covers a price of 10, and with `>=` the
  balances 2 to 9 wrongly saying yes (JavaScript compares the two as text).
- **Words.** Decimal.
- **Teaches.** `guide-words-and-numbers.ts`: `ZEROS`, `tenToThe`, `covers` (pieces written for this page), and
  `decimals` (the habits in one place).

## 9. Printing a number for a player

- **Idea.** A player reads `1.52M`, not `1520000`. `fmt` prints a number for a person, and rounds down so the screen
  never promises money the player lacks.
- **The reader does.** Slides the bubbles across forty orders of magnitude (a slider over powers of ten, so it also
  lands on counts like `1.529e6`); picks a notation.
- **They see.** The printed text with its suffix set smaller, its parts (mantissa, suffix) and every digit
  (`fmtFull`, up to about 9e15); `1.529e6` printed `1.52M` (it rounds down); plain digits under 100,000, a power of
  ten past the last suffix; the same value in each notation, the picked one marked.
- **Words.** notation, formatter.
- **Teaches.** `guide-words-and-numbers.ts`: `BUBBLES`, `NOTATION`, `onScreen`, `everyNotation` (written for this
  page), and `printing` (the formatter and the small printers).

## 10. Something to buy: a burner and its price

- **Idea.** The thing you buy that makes more (a generator) costs more each time: a base price times a growth per one
  owned. One feature can touch another by naming it in `reach`.
- **The reader does.** Slides the first burner's price and the growth; taps and buys burners.
- **They see.** A curve of the first sixteen prices (owned inked, the next lit, the rest ruled) and the buy button's
  price follow the sliders; at growth 1.00 every burner costs the same.
- **Words.** generator, reach.
- **Teaches.** `simmer/game.ts`: `BURNER_COST` (both sliders), `burnerPrice`, `stove` (steps folded).

## 11. Money with a name: the wallet

- **Idea.** A game names its money once, in its words (its currencies), and keeps every balance in a wallet the engine
  writes, which pays in, pays out and keeps running totals.
- **The reader does.** Taps, lights burners, resets the run; switches the currencies between `["bubbles"]` and
  `["bubbles", "steam"]`.
- **They see.** The balance and `earned` move apart on a purchase; both go on a reset; the wallet's slice grows a
  `steam` balance and nothing else changes.
- **Words.** vocabulary, currency, wallet; reset (plain).
- **Teaches.** `simmer/game-wallet.ts`: `WORDS`, `wallet`, `pot` (crediting through `wallet.draft`), `stove > actions >
  buyBurner` (debiting `s.stove.nextPrice`, the hook into the next page).
- **Moved here from 15** while the pages were built: every later step runs `simmer/game-wallet.ts` (the Simmer chapter
  6 builds on), whose stove reads `s.wallet.bubbles`, so the wallet comes before the code that reads it. The kit
  cannot run `guide-mental-model.ts` (see 16), which was the other way to keep the pot's bubbles until 15.

## 12. A number worked out from the state: a derived value

- **Idea.** Some numbers are not remembered but worked out: declared once beside the state, there to read like any
  field, never saved, never written, current the moment what they read changes. The plain example has nothing to do
  with rates: the next burner's price.
- **The reader does.** Buys burners; slides the growth (the kind of change a game's update makes).
- **They see.** `nextPrice` follow every change at once, beside a copy the panel writes at each purchase (what a
  stored price would be), which goes stale (ruled through) when the growth moves and catches up only on a buy; the
  stove's slice with each field marked "saved" or "worked out", read off the save itself.
- **Words.** derived value.
- **Teaches.** `simmer/game-wallet.ts`: `stove > initial`, `stove > derived` (whole, `nextPrice` the subject),
  `BURNER_COST`.

## 13. One derived value reading another, in a later layer

- **Idea.** `derived` can be a list of layers, and a value in a later layer reads the ones before it. The layers are
  for TypeScript; the engine follows what each value reads, and refuses only a loop.
- **The reader does.** In the code box: deletes the second layer (`canBuy`) and types it back; adds `shortBy` beside
  it; makes `canBuy` read itself.
- **They see.** The buy button go dashed with `canBuy` gone ("not there" in the panel); their `shortBy` appear in the
  panel and the stove's slice and count down as the pot fills; the loop refused, named, with the last good version
  still running. The words say what TypeScript would say about a same-layer read (the box strips types unchecked, so
  it runs there).
- **Words.** layer (plain).
- **Code box.** The second. Typing a layer is the lesson. Both snippets are run by `site/test/guide-later.test.ts`.
- **Teaches.** `simmer/game-wallet.ts`: `stove > derived`, edited.

## 14. One place for every multiplier: the stat

- **Idea.** When several things change one number, they meet in one place, a stat: each is a source with an effect,
  and the stat adds the adds onto its base, then multiplies by the multipliers.
- **The reader does.** Puts the lid on and off; slides the lid's multiplier; switches a second source in.
- **They see.** Heat, and its breakdown as a parts list: the base, a row per source (the lid ruled through while it
  is off), the total; with the thick base, (1 + 0.5) × 2 = 3.
- **Words.** stat, effect; source (plain).
- **Teaches.** `simmer/game-wallet.ts`: `LID_HEAT`, `stats`, and `THICK_BASE_HEAT` (a second source exported for this
  page and in no game's sources; the switch writes it into `stats`'s list).

## 15. The rate reads the stat

- **Idea.** The stove's rate is a derived value that reads the stat: the burners' own flame times heat. Nothing that
  changes heat needs to know about the stove.
- **The reader does.** Toggles the lid; steps the starting burners; slides the lid's multiplier; switches the rate
  between reading heat and ignoring it.
- **They see.** flame × heat = rate, live; with the rate ignoring heat, the lid still doubles heat and the rate does
  not move.
- **Words.** none new.
- **Teaches.** `simmer/game-wallet.ts`: `stove > derived > perSecond` (the `s.stats.heat` token marked), `flameOf`,
  `stove > initial`, `LID_HEAT`, `stove > steps > produce > burn`.

## 16. Buildings from a factory: generators

- **Idea.** The engine writes the generator for you: a list of what you can buy, and it does the prices, buying many,
  milestones and paying while you are away.
- **The reader does.** Adds bubbles (the wallet's `credit`); picks a buy mode (one, ten, to the next milestone, as
  many as you can); buys kettles and a cauldron.
- **They see.** Each row's count, price, rate and the count to the next milestone follow the mode; the output double
  at 10.
- **Words.** factory, milestone.
- **Teaches.** `guide-first-page.ts`: `kettles` (`mult` folded), `DOUBLINGS`, `kettleRow`.
- **No code controls.** The kit cannot run `guide-first-page.ts` from its source (an `import.meta.main` block), so the
  panel runs it as bundled with the page (`kit/bundled.tsx`) and the buy mode is the panel's own choice. Once the kit
  runs such files, sliders on a kettle's `rate` and the milestone's `mult` are the natural controls.

## 17. A shop: the upgrade tree

- **Idea.** Things you buy once that change a number: an upgrade tree with one rank each is a shop, and each upgrade
  is an effect on a stat.
- **The reader does.** Adds bubbles; finds the whisk held back by the salt; buys the salt and two ranks of whisk;
  stirs.
- **They see.** The stir stat's breakdown gain a row per upgrade (the whisk's ranks counted in one row), (1 + 2) × 2 =
  6; the stir pay more.
- **Words.** upgrade tree.
- **Teaches.** `guide-first-page.ts`: `UPGRADES`, `kitchen`, `statOf`.
- **No code controls,** for the reason on 16. Once the kit can, a switch of salt's effect between `mul: 2` and
  `add: 2` belongs here.

## 18. Your first page

- **Idea.** Everything so far on one page of its own: a button, a generator, an upgrade, a number that formats itself,
  ticking and saving. This is the game you would ship first.
- **The reader does.** Plays it in the panel; reloads it (a new store from the save); leaves for a chosen time and
  comes back; starts over.
- **They see.** Their game as a player would, the example's own React components in the panel, with its own welcome
  back after time away.
- **Words.** none new; a list of the words learned, each a glossary popup, and where each part was taught.
- **Teaches.** `guide-first-game.tsx` (new, typechecked, run headless by the slow examples test and linked from
  chapter 6): `makeStore`, `Count`, `App`, `start`, over chapter 6's game (`guide-first-page.ts`) without the foam
  and the big bubbles.
- **Ends getting started.** Next is chapter 7 of the guide; the page says what the reader has, how to make a real
  game (chapter 2's folder, chapter 13's template, `/watchpot-init`), the deeper chapters and the reference.

## Where this departs from chapters 1 to 6

- **One idea a page**, where a chapter carried five: chapter 2's single "first game" walk becomes pages 2 to 7.
- **State, then the action, then the clock**, each alone, before any React (chapter 2 wrote them together, page first).
- **Decimals and printing come early and alone** (pages 8 and 9), before money has a name (page 11), rather than
  together in chapter 4.
- **Derived values are their own two pages** (12 and 13) with a plain example first, then a second layer reading the
  first (typed by the reader in a code box), then the stat (14), then the rate that reads it (15): the order the owner
  set for the reworked example.
- **Left for after getting started**: the eight phases in full, `"stop"` and guards, `after`/`before`, game time and
  warps, transient state and profile resets (chapter 3's second half); chapter 5's tour of a real game; and chapter 6's
  clicker, gauge, spawns and buffs. Each is on the reference shelf, and the last page links them.
- **No install and no files on disk** until the end: the pages run in the browser. Page 18 ends with how to make the
  folder (chapter 2's five files) and the template (chapter 13).
