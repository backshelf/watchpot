# Time away

A game whose growth compounds cannot credit an absence with one multiplication: it has to run its own tick rule over
the gap. `catchUpSteps` turns the gap into steps, a journal keeps what happened so the page can tell the player, and
`fillDeep` keeps an old save loading as the shape grows.

Example: [`examples/time-away.ts`](examples/time-away.ts) (`bun docs/examples/time-away.ts`).

- `catchUpSteps(elapsedMs, { capMs, rate?, maxSteps?, minStepMs? })` is `catchUp` plus `steps` and `stepMs`: `steps` is
  0 when nothing is credited, else `max(1, min(maxSteps, ceil(creditedMs / minStepMs)))` (defaults 240 and 1,000 ms),
  and `stepMs` is the credited time over `steps`. Run the tick rule `steps` times with `stepMs`.
- Keep an away report in a `transient` field, and write it only when the absence passes `AWAY_REPORT_MIN_MS`: a
  shorter one is credited without a sheet.
- `pushLine(log, line, keep?)` appends to a capped log (40 lines by default) and works on an immer draft;
  `linesSince(log, last)` is the lines after a cursor, everything for `undefined`, and nothing when the cursor is not
  in the log (a swapped profile is not news). The cursor is a line, found by identity.
- `fillDeep(saved, fresh)` is for a feature's `merge`: it fills a key a newer build added at any depth, keeps a saved
  key `fresh` lacks (an id-keyed record), coerces a saved number or string where `fresh` holds a Decimal, and treats an
  array as a leaf.
- `settings({ key, initial })` is the feature every game writes by hand: it never resets with a run and has one action,
  `change(patch)`.
- `fmt` takes `notation: "scientific"`, `plainBelow` and `decimalsBelow`; `formatter(options)` binds `num`, `times`,
  `plus`, `rate` and `counted` to one set of them.
- A catch-up is the first pass after a load, and its `guard` and `sync` steps run before `rates`: derived values kept
  in `transient` fields are empty there unless the feature declares `derive` (`docs/stat-graph.md` › The first pass
  after a load).

## Telling the player

The catch-up runs in one pass, so the page sees the absence as one change in which the clock's `lastSeen` jumped.
`watchAway(store, onReturn, { minMs?, settlePasses?, lens? })` (`watchpot/react`, `watchpot/hooks`) hears exactly
that change and hands the game `{ before, after, ms }`: the state before the catch-up, the state after it, and the
time it credited. A gap under `minMs` (`AWAY_REPORT_MIN_MS` by default) is not reported, and neither is a profile's
first catch-up or an import, whose `lastSeen` starts from nothing or lands on now. `settlePasses` waits that many
more changes and reports the state after them, for a game whose tallies settle on the pass after the catch-up.

`useAwayReport(summarize, options?)` is the same as React state: `summarize(away)` turns a return into the game's
own report (null for one not worth telling), and it is held until `dismiss()`. It listens from a layout effect, so it
hears the first catch-up the runtime makes on load. `awayGains(before, after, reads)` lists the figures that went up,
in order, each `{ id, gain }`: a figure that fell (a reset ran while away) is left out.

```tsx
function Away() {
  const { report, dismiss } = useAwayReport<GameState, Gains>(({ before, after, ms }) => {
    const gains = awayGains(before, after, { gold: (s) => s.wallet.gold, gems: (s) => s.wallet.gems });
    return gains.length > 0 ? { ms, gains } : null;
  });
  if (!report) return null;
  return <AwaySheet report={report} onClose={dismiss} />;
}
```
