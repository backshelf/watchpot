# A prestige layer

`prestige({ key, gain })` is a feature factory for a layer above the run. It owns `runs`, its currency and a lifetime
total (never reset), plus one action that pays the gain and calls the store's `resetRun`.

Example: [`examples/prestige-layer.ts`](examples/prestige-layer.ts) (`bun docs/examples/prestige-layer.ts`).

- `gain(draft)` is the payout; the default `canReset` is "the gain is above zero". `beforeReset` and `afterReset`
  bracket the reset; `action` names the reset action (`ascend` here, `reset` by default).
- Each feature decides what a reset does to it with its `reset` rule. The layer's own state is never reset.
- **A layer above a layer.** `prestige({ depth: 2 })` resets deeper: it also resets every feature whose rule says
  `{ depth: 2 }` (or `{ depth: 2, rule }`), which an ordinary reset leaves alone. The lower layer itself takes
  `reset: { depth: 2 }` so the higher layer starts its currency and its count over; a function rule reads
  `ctx.depth` to keep less the deeper the reset.
- **Inside a step.** `layer.resetDraft(draft, { now, resetRun })` is the reset inside a recipe (an autobuyer that
  resets for the player passes its step's `ctx.now` and `ctx.resetRun`): the same checks, gain and hooks as the action.
  `beforeReset(draft, now)` is told the game time.
- Curves: `powerGain(amount, { k, exp, per, mult })` is `floor(k x (amount / per) ^ exp x mult)`;
  `lifetimeMultiplier(lifetime, { k, exp })` is `1 + k x lifetime ^ exp`.
- **When to reset.** `resetPace(gain, kept, seconds, floorS?)` is `log10(1 + gain / kept) / seconds`: orders of
  magnitude a second the reset would add to what is `kept` (the total the gain pays into since the layer above last
  reset). Note its best in a `settle` step, zeroed when the run starts over, and call the run past its peak when the
  pace falls to a share of the best (0.85 is a fair start). The same rule serves an autobuyer that resets, the
  sim's player and a readout on the page, so all three agree. While each run is worth many times the last (the
  climb after a deeper reset) it resets early and often; once runs pay about the same it settles on the best gain a
  second. `floorS` is the least seconds counted, so a run is never past its peak in its first moments.
- A tree to spend the currency on is a second feature beside it (see [upgrade tree](upgrade-tree.md)).
