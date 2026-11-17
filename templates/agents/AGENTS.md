# AGENTS.md

An idle game on the watchpot engine: Bun, TypeScript, React 19.

## Before writing code

- Look in the engine first. Its guide and a recipe per system are in `node_modules/watchpot/README.md` and
  `node_modules/watchpot/docs/`. Don't hand-write what it exports (prices, buy-max, achievements, timers, focus
  traps).
- Never edit `node_modules/watchpot`, and never copy engine source into this game. If the engine lacks something,
  build it in this game.

## Commands

- `bun run dev`: the game at http://localhost:3000. Hot reload is off: refresh after a change. `#dev` opens the
  engine's dev panel.
- `bun run verify`: typecheck and lint. Run before every commit.
- `bun run gates`: verify plus a production build. `bun run gates:full` adds the pacing contract.
- `bun run sim -- --contract`: the pacing sim, judged against `src/content/pacing.ts`. Run it once after changing
  numbers, not in a loop.

## Where things go

- Words and numbers: `src/content/`. Rules: the features in `src/game/`. The page: `src/app/`, `src/screens/`, and
  the components in `src/ui/` (this game's own, restyle freely).

## Engine rules that bite

- Never compare Decimals with `<`, `>` or `===`: use `.lt()`, `.gte()`, `.eq()`.
- Game logic never reads the clock: use `api.now()` or the step's `ctx`. Only the store's `now` reads the wall.
- A store selector never returns a fresh object or Decimal (it re-renders forever): select state, compute in render.
- Changing the shape of saved state bumps `save.version` in `src/game/game.ts` with a migration step.
- `motion/react` owns `transform` and `opacity` on what it animates.
