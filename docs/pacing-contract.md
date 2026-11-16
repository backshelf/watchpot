# A pacing contract

Pacing is a table of bands, checked by playing the game headless. A contract is data: metrics read off timeline rows,
and a band (p10 to p90) for each metric on each day.

Example: [`examples/pacing-contract.ts`](examples/pacing-contract.ts) (`bun docs/examples/pacing-contract.ts`).

- `createSimWorld` owns the clock and the store (`simStore` never writes a save). `playDays` runs a `Schedule`
  (`fixedSchedule(8, 23, 15, 0)`: open 08:00 to 23:00, a look every 15 minutes) with a seeded behaviour stream
  (`rngFor(seed, id)`).
- Judge pacing in **played hours** on `activeSchedule(lookEverySec)` (`docs/plan-and-fit.md` › Played hours): a
  session schedule's days include sleep and its player looks every few minutes, far slower than a person playing.
- `sampler({ marks, start, take, at })` builds the timeline; `close` at each day's end.
- `table(axis, metrics, bands)` with `grid([days], [[metric, [[p10, p90], ...]]])`, then `judge(rows, table)` gives a
  `Verdict` per band the run reached. Over several seeds use `runGate` and `tally`/`failing`.
- Run one seed to check direction, not a sweep: an unattended tuning loop needs a stop rule.
