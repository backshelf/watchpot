# Sim and fit: the outline

The sim and fit section: interactive pages on `watchpot/sim` for a reader who has made a game and wants its numbers to
hold. One idea a page, on the same terms as getting started: a game played headless, the days it looks at, the pacing
contract as data, a pilot, a plan fitted into prices, and the report that comes out. The example is a small oven of the
section's own, `docs/examples/sim-oven.ts`: burners that earn, three fittings bought once and priced by a plan, an
almanac the pilot unlocks, and a desk over it all, simmed without a page.

**This file is read by the build**: each `## N. Title` heading is a page, in order. A page that exists is
`pages/NN-slug.tsx` and its `title` must match its heading here (a test checks it); a heading with no page yet is
drawn in the progress strip as a step still to come. Keep the headings' form.

Each entry says: the one idea; what the reader does; what they see change; the glossary words it introduces (each
gets its popup on first use; a word not introduced yet is not used); and which example it teaches, named by file and
exported symbol (never by line: the examples are edited in place).

The section's example is `docs/examples/sim-oven.ts`, run whole by each page (`store: false`: no game is made, the
page calls its functions). Its runs are a small plan, a few played minutes at a step a second, and each demo runs on a
press: the build draws every panel to HTML in a process with no clock, so a demo is a still until the reader presses
it, and a press is a few milliseconds, never a worker.

## 1. A plan: the gates and their minute

- **Idea.** A plan is pacing written down: one gate for each thing a player can open, and the played minute it should
  open at. A minute is the unit you can judge without knowing the economy; the price follows from the run.
- **The reader does.** Slides the minute the hood is planned to open at (1 to 6) and presses "Price the plan".
- **They see.** The gates' prices and the minute each actually opened, from a real fit: the moved gate opens at its new
  minute, and the gates after it move the other way: planned earlier they cost more (the pilot earns at a higher rate
  before they are priced), planned later they cost less. The token in `PLAN` marked in the listing as it changes.
- **Words.** sim lab, gate, plan and fit, played hours.
- **Teaches.** `sim-oven.ts`: `PLAN`, `PRICES`, `gatesOf` (a gate: a key, its minute, `price()`), and `fitPlan` run by
  the panel with no snapshots. Departs from `docs/plan-and-fit.md` by showing the plan before the loop: the method's
  "write down the minute" is the whole of this page.

## 2. The pilot: what plays the game

- **Idea.** Every number the sim has comes from someone playing. The auto-player reads each feature's moves, buys the
  best worth per bubble it has, and takes what is free; its worth is the game's objective, or a `worth` the move
  states when the objective cannot see it.
- **The reader does.** Sets the almanac's stated worth (0 to 10) and presses "Let the pilot look". Reads the day table
  under it.
- **They see.** What one look bought, named: the almanac and a burner at a worth of 5, four burners at a worth of 2,
  and the almanac left alone for good at 0. The boundary at 4, where the almanac is worth exactly what a burner is. A
  second table: the same day under three schedules, as played hours against waited ones (24 and 0, 15 and 9, about 1
  and 23).
- **Words.** auto-player, move, objective, schedule.
- **Teaches.** `sim-oven.ts`: `oven > moves` (the burner, the fittings from the fit table, the almanac's `worth`),
  `lookOnce` (one look on a fresh world), `ACTIVE` and `dayOf` (a day of `activeSchedule`, `fixedSchedule` and a
  session schedule, planned by `planDay`).

## 3. The fit: pricing the gate, then proving it

- **Idea.** The fit plays the game with every gate shut and prices each at its planned minute from what the pilot
  holds; the proof replays the finished table between the fit's snapshots and must arrive at each exactly.
- **The reader does.** Presses "Fit the plan" and then "Prove the table". Switches the price's rounding between above
  the peak and nine tenths of what was held, and fits and proves again.
- **They see.** Three gates priced and opened at their minutes, the run finishing a few seconds after the last. The
  proof: five stretches, and the replay is the fit's run. On the second rounding, the same plan and the same minutes
  with smaller prices, and a proof that parts at the first snapshot: the replay has the bellows and the fit's run did
  not.
- **Words.** snapshot, proof.
- **Teaches.** `sim-oven.ts`: `fitPlan` (the loop's options), `abovePeak` and `payNow` (the two roundings, the
  control between them), `ovenRun` (one run builder, fresh or from a snapshot, which is what the proof replays).

## 4. The cache: carry on from a snapshot

- **Idea.** A long fit leaves a snapshot every so often and carries on from the last one that still holds, instead of
  playing the hours before it again. The plan before the snapshot is checked; the rules are not, and cannot be.
- **The reader does.** Picks what changed after the first fit (nothing, the hood moved earlier, the jacket moved later)
  and steps the minute to carry on from (1 to 4), then presses.
- **They see.** Five snapshots taken, and then: the same table a fit from nothing wrote, when nothing moved; the cache
  refused with the reason named, when the hood moved before the snapshot; a fit carried on from 2:00 that prices only
  the jacket, at a dearer figure for its new minute, when the move came after.
- **Words.** none new (snapshot again).
- **Teaches.** `sim-oven.ts`: `cacheStory` (a fit with snapshots, `latestSnapshot`, `fitHolds`, and a fit carried on
  with `{ from }`), `AT_MIN`.

## 5. Reading the report, and the desk

- **Idea.** The report is the run written down: each gate, its planned minute, the minute it opened and its price, and
  the longest wait between two of them. The desk is the command that runs it all for a game.
- **The reader does.** Presses "Fit and read the report" and finds the wall the caption names in the table.
- **They see.** The report as the script prints it (a table of gate, planned, opened, price), the longest wait between
  two gates, the plan's own run judged against a pacing contract, band by band, and the desk's numbers: its currency,
  where a run ends, its seeds and its knobs.
- **Words.** pacing contract, band.
- **Teaches.** `sim-oven.ts`: `readReport` (`formatFit`, `longestWait`, the contract judged on the run replayed, the
  desk's own fields), `longestWait`, `CONTRACT` (bands on a `byMinute` axis, drawn from a real run), `desk`
  (`defineDesk`: words, knobs, currency, source globs, where a run ends, the run builder).

## Where this departs from the reference pages

- **One idea a page**, where `plan-and-fit.md` carries the method, the loop, the roundings, when to refit and the
  replay in one read.
- **The plan before the loop.** The reference opens with the fit and says what a plan is second; a reader who has not
  held a minute in their head cannot follow the loop.
- **The proof in the fit's own page**, beside the rounding that makes it pass, rather than in `fit-kit.md`: the point
  of the page is that the rounding is the proof.
- **The contract and the desk on the last page**, because they are what you read when the numbers are in, not what you
  reach for first.
