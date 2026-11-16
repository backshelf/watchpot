# A pacing contract

Pacing is a table of bands, checked by playing the game headless. A contract is data: metrics read off timeline rows,
and a band (p10 to p90) for each metric at each played hour.

Example: [`examples/pacing-contract.ts`](examples/pacing-contract.ts) (`bun docs/examples/pacing-contract.ts`).

- Judge pacing in **played hours** on `activeSchedule(lookEverySec)` (`docs/plan-and-fit.md` › Played hours): a
  player at the game the whole time, so every hour of the run is an hour someone played. A session schedule
  (`fixedSchedule`, `SessionSchedule`) has days that include sleep and a player who looks every few minutes, far
  slower than a person starting a game; run it to see a week, but do not judge on it.
- `createSimWorld` owns the clock and the store (`simStore` never writes a save). `playDays` runs a `Schedule` with a
  seeded behaviour stream (`rngFor(seed, id)`); `hours` stops it after the look that crosses that many hours.
- `sampler({ marks, start, take, at })` builds the timeline, a row at each mark.
- `table(byHour(read), metrics, bands)` with `grid([hours], [[metric, [[p10, p90], ...]]])`, then
  `judge(rows, table)` gives a `Verdict` per band the run reached. Over several seeds use `runGate` and
  `tally`/`failing`.
- Draw the bands from a real run, with room either side, not from a guess: the example's comment records the run its
  bands came from.
- Run one seed to check direction, not a sweep: an unattended tuning loop needs a stop rule.
