# A gacha: catalogue and roll

A rarity draw over the game's ladder with hard and soft pity, and a feature that owns a set of boxes.

Example: [`examples/gacha.ts`](examples/gacha.ts) (`bun docs/examples/gacha.ts`).

- `gacha({ key, ladder, odds, pity, roll, vocab })`; the keys of `odds` are the boxes. `catalogueRoll(entries)` picks
  evenly among the entries of the drawn rarity, so each entry names its `rarity`.
- A `PityRule` is a list of floors on the ladder: `{ rarity: "rare", within: 10 }` guarantees a rare or better within
  10 pulls; `softFrom` ramps the chance up before the floor.
- `open(box, count)` is free (free tokens first); `grant(box, count)` hands out tokens. The feature charges nothing: a
  paying action takes the price and calls `summon.draft.open(draft, box, count)` in the same recipe. The feature's
  other two namespaces: `summon.def` (`ladder`, `boxes`, `odds`, `pity`, as declared) and `summon.select` (empty:
  its counters are `s.summon.*`).
- A seeded store (`seed` option) replays the same pulls, which is how tests pin them. The stream is seeded from the
  store's seed and the key alone, so a save from before the gacha existed, imported into a store with the same seed,
  pulls what the run that carried on pulls.
- For an odds sheet: `publishedOdds(ladder, odds)` and `pullsUntilPity(ladder, pity, rule, odds)`. Show the pull with
  the [reveal](reveal.md).
