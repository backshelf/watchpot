# The auto-player and fixture plays

There are two ways to play a game without a person, and they do different jobs:

- **The auto-player** is the sim's player. `autoPlayer(game)` needs no code of its own: it reads every feature's
  `moves`, buys the best-value affordable one until none is, then takes free moves. It weighs a move with no `worth`
  by its `objective`, what the player is trying to grow: the objective after the move less the objective before.
  It reads balances from the game's one wallet; pass `balance(state, currency)` only when the game has none, or more
  than one. Judge
  pacing on `activeSchedule(lookEverySec)`, a player at the game the whole time, so every hour of the run is a played
  hour ([a pacing contract](pacing-contract.md)). `playDays` takes `hours` (or `until()`) to stop after the look that
  crosses it.
- **A fixture play** is a test's player. A `FixturePlay` (from `watchpot/test`) is `(store, clock) => void`, plain
  calls on a store. `fixtureSave(game, play)` makes the same save string every time (seeded `fixture`), to commit as a
  permanent fixture ([migrations](migration.md)).

Example: [`examples/persona.ts`](examples/persona.ts) (`bun docs/examples/persona.ts`).

A move is `{ id, cost?: { currency, amount }, worth?(state), repeat?, apply(store) }`; `apply` returns true when it
went through. Leave `worth` out where the objective can see what the move does; state it for an unlock, a cap or a
reset, which move nothing at once (`player.blind()` lists the moves that came to nothing). A feature you write
declares `moves` in its definition; a factory-made feature with no moves of its own takes them through
`withMoves(feature, moves)`, and `definePrestige` takes a `worth`.

An upgrade tree declares its own moves, one per node whose next rank can be bought, with no `worth`: the auto-player
works it out from its objective. Say a `worth(state, node)` in the tree's definition for a node that does not move the
objective at once ([an upgrade tree](upgrade-tree.md)):

```ts
export const mine = defineUpgradeTree({
  key: "mine",
  nodes: NODES,
  wallet,
  worth: (_s, node) => (node.id === "laser" ? 3 : 1),
});
```
