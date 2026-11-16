# Boards

A grid of cells, pieces placed on it, and what each piece does read from where it sits: the pieces beside it, its row
and column, the edge, how many of a kind are down. A garden bed, a reactor, a sheet of stickers, a beacon grid. The
rules are pure over a cells record; the effect type is the game's own (with the engine's `Effect`, `contributions`
feeds a `stats` feature: the example's `growth`).

Example: [`examples/board.ts`](examples/board.ts).

- **`BoardPiece<E>`** is `{ id, tags?, limit?, effects(view) }`. `effects` gets a `BoardView`: `x`, `y`, `cell`, the
  pieces `beside` (the four sharing a side, in the order up, right, down, left), `around` (all eight), its `row` and
  `column`, `edge` and `corner` (of the open cells), `at(dx, dy)` and `count(idOrTag)`. `limit` caps how many may be
  down at once.
- **`board({ id, width, height, pieces })`** is the rules over `BoardCells` (a piece id per occupied cell, `y × width
  + x`): `check` and `place` (a `BoardFailure`: `unknown-piece`, `closed`, `occupied`, `none-left`, `limit`, or null),
  `lift`, `move` (a swap when the target is taken), `used`, `placed` (each piece with its view and effects),
  `contributions` (sourced `<id>:<piece>@<x>,<y>`) and `settle` (the cells with whatever the limits no longer allow
  taken up). Every call takes `BoardLimits`: `open(x, y)` for which cells are unlocked and `held(piece)` for how many
  the player has.
- **`boardFeature({ key, width, height, pieces, held?, open?, reset? })`** saves `{ cells }` with the actions `place`,
  `lift`, `move`, `clear` and `lay(cells)` (a whole layout at once: a preset, an auto-arrange), and carries the rules
  as `.board`. `held(state, piece)` and `open(state, x, y)` read the whole game state, so the board grows and its
  pieces are earned however the game likes. A piece no longer held, or on a cell no longer open, stops counting but
  stays where it was put. A run reset keeps the layout unless `reset` says otherwise.
- **`fillBoard(board, { score, held?, open?, start?, passes? })`** finds a good layout greedily: the best placement
  that does not lower `score`, again and again, then moves and lifts that score higher. For an auto-arrange button or
  a sim's player; it costs cells × pieces scorings a placement, so call it on a change, never every tick.
- **`searchBoard(board, { score, held?, open?, start?, trials?, random? })`** finds a better one by simulated
  annealing, a slice at a time: `step(count)` runs that many trials (true while any are left), `best()` and
  `bestScore()` read the best so far, `progress()` says how far it is. It climbs out of the local best a greedy fill
  stops at and leaves a piece in hand when the board does better without it. A trial is one scoring: spread the
  default 60 000 over frames (a few thousand a frame) and lay `best()` as it improves, so the player watches the
  board sort itself.
- **Tuning.** A piece that multiplies by what is beside it compounds across the board: keep per-neighbour bonuses
  small or additive, and give the player a reason to lay the board differently for different goals (one stat per
  piece family) rather than one best layout.
