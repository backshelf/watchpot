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

## Tuning on the sim desk

```sh
bun run desk       # opens the sim desk on the orchard
```

The desk plays one straight 24 h run on the auto-player and draws it as pace graphs. Its knobs are the orchard's tuning
numbers, declared in `src/content/knobs.ts`: price growth and offline rate (Orchard), pull price and drip interval
(Shower), and the prestige bonus per orbit (Prestige). Move one and the run replays from its cache. **Save** writes
`sim.tuning.json`, which the game imports over the knobs' values, so what you set there ships.
