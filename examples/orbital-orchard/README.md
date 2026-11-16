# Orbital Orchard

A lone caretaker on a derelict space station grows fruit trees in orbit for a planet that stopped answering. The fruit keeps coming. Somebody should be there to pick it.

The watchpot engine's reference game, made with `/watchpot` and built out on the engine's own source (a workspace of
the engine's repository: `bun install` at its root). Built for short sessions: a handful a day, about ten minutes each.

```sh
bun run dev        # http://localhost:3000
bun run verify     # typecheck, lint, changed tests
bun run sim -- --player=auto --contract
```

The concept is in `.claude/specs/concept.md`; how the code is laid out, in `.claude/CLAUDE.md`.
