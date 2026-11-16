# watchpot/sim

The sim lab. [pacing-contract](pacing-contract.md), [persona](persona.md), [plan-and-fit](plan-and-fit.md) and [fit-kit](fit-kit.md) have worked examples, and `api/sim/` has every signature.

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
