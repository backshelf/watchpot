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
- **The reader does.** Slides the base price and the growth; buys burners.
- **They see.** The price list redraw (a small chart of price against owned) and the buy button's price follow the
  sliders.
- **Words.** generator, reach.
- **Teaches.** `simmer/game.ts`: `BURNER_COST`, `burnerPrice`, `stove`.

## 11. A number worked out from the state: a derived value

- **Idea.** Some numbers are not remembered but worked out: declared once beside the state, never saved, always
  current. The plain example has nothing to do with rates: the next burner's price.
- **The reader does.** Buys burners and watches the derived price; toggles "save it as state instead" to see why a
  remembered price goes stale when the growth slider moves.
- **They see.** The derived value follow every change at once; the stored copy fall behind.
- **Words.** derived value.
- **Teaches.** The reworked stove's first derived value, `nextPrice` (`stove > derived`, on `main`).
- **Departs from chapter 3**, which met derived values through the stove's rate; the owner wants them shown plainly
  first.

## 12. One derived value reading another, in a later layer

- **Idea.** `derived` can be a list of layers, and each layer reads the ones before it: a second-layer value
  (`canBuy`) reads a first-layer one (`nextPrice`) with no annotation. A value never reads one in its own layer or a
  later one, so there is no order to get wrong.
- **The reader does.** In the code box, adds a second layer themselves: `canBuy` (the wallet covers `nextPrice`),
  then `secondsToNext` (the shortfall over the rate). Then tries reading a value from the same layer and reads what
  goes wrong, said in the page's words.
- **They see.** Their new value appear in the panel's state readout and drive the buy button's lit state; "affordable
  in 7 s" count down and jump when they tap.
- **Words.** layer (plain).
- **Code box.** The second. Typing a layer is the lesson.
- **Teaches.** The reworked stove's `derived` (on `main` since 80125ec: `stove > derived`, with `nextPrice` in the
  first layer and the small second layer the rework adds).

## 13. One place for every multiplier: the stat

- **Idea.** When several things multiply one number (the lid, an upgrade, a boost), they meet in one place, a stat:
  each is a source, and the stat adds them up.
- **The reader does.** Puts the lid on and off; adds a second source with a slider.
- **They see.** The stat's value and its list of sources, each with what it gives.
- **Words.** stat, effect, source (plain).
- **Teaches.** The rework's `defineStats` feature (expected: `stats`, with the `heat` stat and the lid as a source).

## 14. The rate reads the stat

- **Idea.** The stove's rate is a derived value that reads the stat: the burners' own flame times `heat`. Nothing that
  changes heat needs to know about the stove.
- **The reader does.** Toggles the lid; slides the burners.
- **They see.** The rate follow the stat; the code's `s.stats.heat` marked.
- **Words.** none new.
- **Teaches.** The rework's stove (`stove > derived > perSecond`).

## 15. Money with a name: the wallet

- **Idea.** A game declares its words once (its currencies) and keeps every balance in a wallet, which also keeps
  running totals.
- **The reader does.** Earns, spends, resets the run.
- **They see.** The balance and the `earned` total move apart on a purchase; both go on a reset.
- **Words.** vocabulary, wallet, currency, reset (plain).
- **Teaches.** `simmer/game-wallet.ts`: `WORDS`, `wallet`, `pot` (crediting through `wallet.draft`).

## 16. Buildings from a factory: generators

- **Idea.** The engine writes the generator for you: a list of what you can buy, and it does the prices, buying many,
  milestones and paying while you are away.
- **The reader does.** Picks a buy mode (one, ten, to the next milestone, as many as you can); buys kettles.
- **They see.** Each row's price and count follow the mode; the output double at 10.
- **Words.** factory, milestone.
- **Teaches.** `guide-first-page.ts`: `kettles`, `kettleRow`.

## 17. A shop: the upgrade tree

- **Idea.** Things you buy once that change a number: an upgrade tree with one rank each is a shop, and each upgrade
  is an effect on a stat.
- **The reader does.** Buys salt and a whisk; switches an upgrade's effect between add and multiply.
- **They see.** The stat's sources gain an entry; the stir pay more.
- **Words.** upgrade tree.
- **Teaches.** `guide-first-page.ts`: `kitchen`, `shelf`.

## 18. Your first page

- **Idea.** Everything so far on one page of its own: a button, a generator, an upgrade, a number that formats itself,
  ticking and saving. This is the game you would ship first.
- **The reader does.** Plays it, full width; reloads it; leaves and comes back.
- **They see.** Their game, as a player would.
- **Words.** none new; a list of the words learned, each linked.
- **Teaches.** A new example, `docs/examples/guide-first-game.tsx` (a page over the reworked Simmer with the kettles
  and the kitchen), to be written with this page; it must typecheck and be tied to the docs like the others.

## Where this departs from chapters 1 to 6

- **One idea a page**, where a chapter carried five: chapter 2's single "first game" walk becomes pages 2 to 7.
- **State, then the action, then the clock**, each alone, before any React (chapter 2 wrote them together, page first).
- **Decimals and printing come early and alone** (pages 8 and 9), before money has a name (page 15), rather than
  together in chapter 4.
- **Derived values are their own two pages** (11 and 12) with a plain example first, then a second layer reading the
  first (typed by the reader in a code box), then the stat (13), then the rate that reads it (14): the order the owner
  set for the reworked example.
- **Left for after getting started**: the eight phases in full, `"stop"` and guards, `after`/`before`, game time and
  warps, transient state and profile resets (chapter 3's second half); chapter 5's tour of a real game; and chapter 6's
  clicker, gauge, spawns and buffs. Each is on the reference shelf, and the last page links them.
- **No install and no files on disk** until the end: the pages run in the browser. Page 18 ends with how to make the
  folder (chapter 2's five files) and the template (chapter 13).
