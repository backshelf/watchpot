# Plan and fit

A small game needs none of this. A handful of prices you tune by playing, checked by a [pacing
contract](pacing-contract.md), is enough until there are more gates than you can price by hand. Come back here when
there are dozens, or when every tweak to one price moves all the ones after it.

A pacing contract judges a game after the run. A plan prices it the other way round: write down the minute each gate
should open, let a pilot play with every gate unpayable, and as each minute comes price the gate at what the pilot
holds, rounded to a figure a player can read. The run carries on with that price fixed, so one pass in time order
prices the whole game.

Example: [`examples/plan-and-fit.ts`](examples/plan-and-fit.ts) (`bun docs/examples/plan-and-fit.ts`): a bakery with
six tools and two sales, fitted, then replayed on the fitted table.

## The method

- **The plan** is the game's: a record of gate key to minute, and a key type (`keyof typeof PLAN`). It is pacing as
  intent, for a player who is paying attention.
- **The fit** is a script the game owns. It builds its gates, a pilot and a `holdings` over what gates are paid in,
  calls `runFit`, prints `formatFit`, and, only when `finished` is true, writes `fitTableSource` to a module beside the
  plan. When a gate never opened, it says which and writes nothing.
- **The game** reads every fitted price from one live table, `fitTable(FIT)`, kept where the game's gates read it
  (`prices.get(key)`). A gate the table lacks costs `BLOCKED` and cannot be bought (`isBlocked(price)` tells a screen
  to leave it off the shelf). The fit writes into the same table as it prices each gate, so the run plays every price
  the moment it is set. Never edit the table by hand: change the plan and fit again.
- **The kit** around a long fit (snapshots, carrying a fit on from one, the proof, a draft, the profiler) is its own
  page: [the fit kit](fit-kit.md).
- **The replay** is a test: play the pilot on the fitted table from a fresh start and check it finishes between 0.7 and
  1.25 of the plan's last minute. It guards against a dead end and a fit gone stale.

## Played hours

A plan's minutes are **played** minutes: the time a person spends actively at the game, for a player who no-lifes it.
Nobody starts an idle game and goes idle, so the first three or four hours are played straight whatever session length
the game is built for (that shapes only the days after), unless being idle is the game's gimmick. Fit and measure on
`activeSchedule(lookEverySec, presses)` (a look every few seconds, around the clock, so every hour is a played hour);
a `SessionSchedule` answers a different question (how a checker's week goes) and its hours include sleep.

A long target is filled, not stretched: "a page a day" means a day's worth of things to do on that page, not prices
raised until it takes a day. When a stretch runs short of its target, add content there; slow a number only when it is
out of line with the content around it. The length is what the content makes it: a target is a guess, never a quota, so
a stretch that plays short gets things worth doing or the game is shorter. Never throttle a rate or an automation to
reach it, and never pad with filler.

A gate measured by something a reset wipes (a best run, a balance) is planned before that reset. When a change speeds
the run up, the reset comes earlier: a gate whose minute now falls after it is priced at next to nothing and opens at
once in a replay. Move its minute ahead of the reset and fit again.

## Writing a gate

The engine never writes a definition. A `FitGate` is `{ key, atMs, price() }`:

- The loop shuts the gate in the table (`table.set(key, null)`) before the run, and writes the price `price()` gives
  into it.
- `price()` is asked every step once `atMs` has come, until it returns a string. It checks whatever the gate needs
  (its screen is open, nothing else is running), reads `holdings`, rounds, and returns the price. Text after a space
  is a note: it shows in the report, never in the table. Null means "not yet"; a gate that stays null leaves the fit
  unfinished.

`holdings(refs, read, { window?, from? })` keeps the last `window` samples per ref (90 by default; call `sample()` in
`afterStep`) and the peak ever seen; `remember()` and `from` carry them across a snapshot. `held(ref, last?)` is the most in the window, or in its last `last` samples, so a
price set just after a purchase still reads what was held before it. A share of it (nine tenths, say) is paid within
moments; all of it waits a little. For a gate behind a reset, `ratchet(ref, margin?)` fixes its bar at the peak times
`margin` (1.34) the first time it is checked and holds the price back until `held` reaches it, so the price lands above
anything held before the reset.

`nicePrice(x, steps?)` never rounds up: null below 1 or not finite, whole below 100, two figures off
`1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8` up to a million, and `<step>e<exponent>` from there. A price at or under what
is held is paid within moments, which is the point, but it may also have been payable a little before its minute.

`priceAbove(x)` is the other way: a readable figure strictly above `x` (the next whole number below 100, then two
figures rounded up). Priced above the most ever held (`peak`), or the most held since the gate could first be
reached, a gate cannot be paid before the fit priced it, so a replay on the finished table is the fit's own run
again. That is what [the proof](fit-kit.md#the-proof) checks, and a table priced with `nicePrice` will not pass it.

## The loop

`runFit({ table, gates, … })` shuts every gate in the table and orders them by `atMs`, the plan's order between
equals. Each step it lets the pilot `look()` (every `lookEvery`th step, 3 by default), plays `step(stepMs)`, runs
`afterStep()`, then asks each unopened gate whose minute has come for a price; a string goes into the table and opens
it at `playedMs()`. It stops on `done()` or at `limitMs`, and `finished` is `done()` with every gate open. A gate
opens at or after its minute, never before.

The step is the fit's `quality` (`SIM_QUALITY`: `exact` a second, the default; `quick` ten; `rough` a minute), or
`stepMs` outright. A quick fit is a draft: it reads the plan's curve in a fraction of the time, and its prices are
the ones a coarser pilot held. Fit `exact` before a checkpoint.

## When to refit

Refit after changing a minute in the plan, or anything that changes how fast the pilot earns: a rate, a multiplier, the
pilot's own rules. Then run the replay. A fit is one run for a ballpark, not a sweep: read the report, move a minute or
a rule that lands badly, and fit again.
