# A prestige layer

`prestige({ key, gain })` is a feature factory for a layer above the run. It owns `runs`, `lifetime` (every unit it has
paid while its own state lasts), `runStart` and the run's best reset pace, holds its currency (or pays it into a wallet
with `payInto`), and has one action that pays the gain and calls the store's `resetRun`.

Example: [`examples/prestige-layer.ts`](examples/prestige-layer.ts) (`bun docs/examples/prestige-layer.ts`).

- `gain(draft)` is the payout; the default `canReset` is "the gain is above zero". `beforeReset` and `afterReset`
  bracket the reset; `action` names the reset action (`ascend` here, `reset` by default).
- Each feature decides what a reset does to it with its `reset` rule. The layer's own state is never reset unless its
  `reset` says so.
- **Where it pays.** Without `payInto` the layer holds `currency` on its slice. With
  `payInto: { wallet, currency }` the reset credits that wallet currency (through `wallet.draft.credit`, after the run
  is reset, so the wallet's totals count it) and the slice has no `currency` field: one ledger. The wallet must keep
  that currency through the layer's own reset (`depth: { shards: "never" }`, or deeper than the layer); the factory
  throws otherwise. `layer.select.held(state)` reads what is held, either way.
- **A layer above a layer.** `prestige({ depth: 2 })` resets deeper: it also resets every feature whose rule says
  `{ depth: 2 }` (or `{ depth: 2, rule }`), which an ordinary reset leaves alone. The lower layer itself takes
  `reset: { depth: 2 }` so the higher layer starts its currency and its count over; a function rule reads
  `ctx.depth` to keep less the deeper the reset.
- **The run start.** `runStart` is the game time this layer's run began: its own reset, any deeper one, or the
  profile's start. A step or a select reads run length off it (`layer.select.runSeconds(state, now)`).
- **When to reset.** Every layer keeps its reset pace. `resetPace(gain, kept, seconds, floorS)` is
  `log10(1 + gain / kept) / seconds`: orders of magnitude a second the reset would add to what is `kept`. The layer's
  `settle.pace` step raises `peak` (this run's best) every pass; a run start puts it back to 0. Its slice serves three
  derived values: `pace` (as of the last pass), `peakShare` (the pace as a share of the best, 1 at the peak) and
  `pastPeak` (it pays, and the pace has fallen under `past` of the best). `layer.select.pace(state, now)` is the pace
  at any moment, for a page that redraws between passes. Tune it with
  `pace: { past?, floorS?, kept? }`: `past` defaults to 0.8, `floorS` (the least seconds counted, so nothing peaks in
  a run's first moments) to 1, and `kept` to the layer's `lifetime`. An autobuyer that resets, the sim's player and a
  light on the page all read the same `pastPeak`, so all three agree. While each run is worth many times the last
  (the climb after a deeper reset) it resets early and often; once runs pay about the same it settles on the best
  gain a second. `pastPeak` does not ask `canReset` (which may write); the reset still does.
- **Inside a step.** `layer.draft.<action>(draft, { now, resetRun })` (`layer.draft.ascend` here) is the reset inside
  a recipe (an autobuyer that resets for the player passes its step's `ctx.now` and `ctx.resetRun`): the same checks,
  gain and hooks as the action. `beforeReset(draft, now)` is told the game time.
- **The namespaces.** `select` (`held`, `gain`, `runSeconds`, `pace`), `def` (`action`, `depth`, `pace`, `payInto`)
  and `draft` (the reset). `reach` takes a list, a function returning one, or `reach<{ key: State }>()`.
- Curves: `powerGain(amount, { k, exp, per, mult })` is `floor(k x (amount / per) ^ exp x mult)`;
  `lifetimeMultiplier(lifetime, { k, exp })` is `1 + k x lifetime ^ exp`.
- A tree to spend the currency on is a second feature beside it (see [upgrade tree](upgrade-tree.md)).
