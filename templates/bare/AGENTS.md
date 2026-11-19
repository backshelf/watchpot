# AGENTS.md

An idle game on the watchpot engine: Bun, TypeScript, React 19. It starts bare: one button, one number, a saved
setting. Everything else is added.

## Before writing code

- Look in the engine first. Its guide and a recipe per system are in `node_modules/watchpot/README.md` and
  `node_modules/watchpot/docs/`. Don't hand-write what it exports (prices, buy-max, achievements, timers, focus
  traps).
- Never edit `node_modules/watchpot`, and never copy engine source into this game. If the engine lacks something,
  build it in this game.

## Commands

- `bun run dev`: the game at http://localhost:3000. Hot reload is off: refresh after a change.
- `bun run verify`: typecheck and lint. Run before every commit.
- `bun run gates`: verify plus a production build.

## Where things go

- The game: `src/game/` (`words.ts` its name and currency, `game.ts` its features and its save, `store.ts`). The page:
  `src/App.tsx`.

## Engine rules that bite

- Never compare Decimals with `<`, `>` or `===`: use `.lt()`, `.gte()`, `.eq()`.
- Game logic never reads the clock: use `api.now()` or the step's `ctx`. Only the store's `now` reads the wall.
- A store selector never returns a fresh object or Decimal (it re-renders forever): select state, compute in render.
- Changing the shape of saved state bumps `save.version` in `src/game/game.ts` with a migration step.
