# A persona

A persona is a player. Two kinds:

- **A sim player.** `autoPlayer(game, { balance })` needs no code: it reads every feature's `moves`, buys the
  best-value affordable one until none is, then takes free moves. Put the game's pacing on a `fixedSchedule` or a
  `SessionSchedule`.
- **A fixture player.** A `Persona` is `(store, clock) => void`, plain calls on a store. `fixtureSave(game, persona)`
  makes the same save string every time (seeded `fixture`), to commit as a permanent fixture.

Example: [`examples/persona.ts`](examples/persona.ts) (`bun docs/examples/persona.ts`).

A move is `{ id, cost?: { currency, amount }, value(state), apply(store) }`; `apply` returns true when it went through.
A factory-made feature (`currencies`, `prestige`) takes moves through `withMoves(feature, moves)`.
